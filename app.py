import copy
import os
import re
import requests
from datetime import datetime, timezone
from requests.auth import HTTPBasicAuth
from flask import Flask, jsonify, request
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__, static_folder="static", static_url_path="")
CORS(app)

JIRA_URL   = os.getenv("JIRA_URL")
JIRA_EMAIL = os.getenv("JIRA_EMAIL")
JIRA_TOKEN = os.getenv("JIRA_TOKEN")
QA_ENV_URL = os.getenv("QA_ENV_URL", "")

# ── Board / project registry ───────────────────────────────────────────────────
BOARDS = {
    283: {"project": "BUPTN", "name": "Business Partner"},
    514: {"project": "ECB2B", "name": "ECommerce B2B"},
}
DEFAULT_BOARD = 283
BOARD_ID = DEFAULT_BOARD  # kept for legacy references

auth    = HTTPBasicAuth(JIRA_EMAIL, JIRA_TOKEN)
headers = {"Accept": "application/json"}

# ── Constants ─────────────────────────────────────────────────────────────────

DONE_STATUSES = {
    "finalizado", "pronto p/produção",
    "done", "closed", "resolved", "pronto p/producao",
}

CANCELLED_STATUSES = {"cancelada"}

BUG_TYPES = {"bug", "bug (experimental)", "incident"}

STORY_TYPES = {
    "história", "historia", "story", "melhoria",
    "débito técnico", "debito tecnico", "spike", "task", "tarefa",
}

RISK_LEVELS = [
    ("critical", ["crítico", "critico", "critical", "bloqueante", "blocking",
                  "p0", "urgente", "urgent", "severo", "severe", "impeditivo"]),
    ("high",     ["alto", "alta", "high", "importante", "important",
                  "p1", "grave", "maior", "major"]),
    ("medium",   ["médio", "media", "medio", "medium", "moderado", "moderate",
                  "p2", "normal", "moderada"]),
    ("low",      ["baixo", "baixa", "low", "menor", "minor",
                  "p3", "trivial", "cosmético", "cosmetico", "pequeno"]),
]

PRIORITY_ORDER = {
    "blocker": 0, "crítica": 0, "critica": 0, "critical": 0,
    "alta": 1, "high": 1,
    "média": 2, "media": 2, "medium": 2,
    "baixa": 3, "low": 3,
    "trivial": 4, "mínima": 4, "minima": 4,
}

# Maps lowercase status tag text (inside [brackets] in CT lines) to canonical status key
CT_STATUS_MAP = {
    "não iniciado":  "nao_iniciado",
    "nao iniciado":  "nao_iniciado",
    "em andamento":  "em_andamento",
    "bloqueado":     "bloqueado",
    "falhado":       "falhado",
    "aprovado":      "aprovado",
    "passou":        "aprovado",
    "cancelado":     "cancelado",
    "skipped":       "skipped",
    "ignorado":      "skipped",
    "retest":        "retest",
}

CT_STATUS_KEY_TO_LABEL = {
    "nao_iniciado": "Não Iniciado",
    "em_andamento": "Em Andamento",
    "bloqueado":    "Bloqueado",
    "falhado":      "Falhado",
    "aprovado":     "Aprovado",
    "cancelado":    "Cancelado",
    "skipped":      "Skipped",
    "retest":       "Retest",
}

WORKFLOW_TRANSITIONS = {
    "nao_iniciado": ["em_andamento", "skipped", "cancelado"],
    "em_andamento": ["aprovado", "falhado", "bloqueado", "skipped", "cancelado"],
    "bloqueado":    ["em_andamento", "retest", "cancelado"],
    "falhado":      ["retest", "cancelado"],
    "retest":       ["em_andamento", "aprovado", "falhado"],
    "skipped":      ["nao_iniciado", "cancelado"],
    "aprovado":     ["nao_iniciado"],
    "cancelado":    ["nao_iniciado"],
}

# ── Helpers ───────────────────────────────────────────────────────────────────

def jira_get(path, params=None):
    r = requests.get(f"{JIRA_URL}{path}", auth=auth, headers=headers,
                     params=params, timeout=15)
    r.raise_for_status()
    return r.json()


def extract_risk(text):
    text_lower = text.lower()
    for level, keywords in RISK_LEVELS:
        for kw in keywords:
            if re.search(rf"\b{re.escape(kw)}\b", text_lower):
                return level, "high"
            if kw in text_lower:
                return level, "low"
    return "unknown", "none"


def days_since(date_str):
    if not date_str:
        return None
    dt = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
    return (datetime.now(timezone.utc) - dt).days


def priority_sort_key(name):
    return PRIORITY_ORDER.get((name or "").lower(), 99)


def is_done(status_name):
    return status_name.lower() in DONE_STATUSES

def is_cancelled(status_name):
    return status_name.lower() in CANCELLED_STATUSES


def is_bug(itype):
    return itype.lower() in BUG_TYPES


def is_story(itype):
    return itype.lower() in STORY_TYPES


def is_qa_subtask(summary):
    return summary.strip().upper().startswith("[QA]")


def is_planning_subtask(summary):
    s = summary.lower()
    return "[qa]" in s and "planejamento" in s


def is_execution_subtask(summary):
    s = summary.lower()
    return "[qa]" in s and "execu" in s  # matches "execução"


def parse_execution_progress(description):
    """Parse 'Validados até o ciclo atual: X/Y' from execution subtask.
    Returns (done, total) from the last cycle found (most recent = cumulative)."""
    if not description:
        return 0, 0
    text = adf_to_text(description)
    # flexible: handles 'ciclo'/'clico' typo and various separators
    matches = re.findall(r'[Vv]alidados até o c\w+ atual[:\s]*(\d+)/(\d+)', text)
    if not matches:
        return 0, 0
    done, total = int(matches[-1][0]), int(matches[-1][1])
    return done, total


def adf_to_text(node):
    """Recursively extract plain text from an Atlassian Document Format node."""
    if not node:
        return ""
    if node.get("type") == "text":
        return node.get("text", "")
    parts = [adf_to_text(child) for child in node.get("content", [])]
    return " ".join(p for p in parts if p)


def adf_para_to_lines(para_node):
    """Split a paragraph node on hardBreak inline elements, yielding one line per segment."""
    parts, current = [], []
    for inline in para_node.get("content", []):
        if inline.get("type") == "hardBreak":
            text = " ".join(current).strip()
            if text:
                parts.append(text)
            current = []
        else:
            t = adf_to_text(inline)
            if t:
                current.append(t)
    text = " ".join(current).strip()
    if text:
        parts.append(text)
    return parts


def adf_to_lines(node):
    """Convert top-level ADF content to list of (text, node_type) pairs."""
    if not node:
        return []
    result = []
    for child in node.get("content", []):
        ntype = child.get("type", "")
        if ntype in ("bulletList", "orderedList"):
            for item in child.get("content", []):
                t = adf_to_text(item).strip()
                if t:
                    result.append((t, "listitem"))
        elif ntype == "codeBlock":
            # Code blocks may store full Gherkin with real \n separators
            t = adf_to_text(child)
            for line in t.split("\n"):
                line = line.strip()
                if line:
                    result.append((line, "codeblock"))
        elif ntype == "paragraph":
            for line in adf_para_to_lines(child):
                result.append((line, "paragraph"))
        else:
            t = adf_to_text(child).strip()
            if t:
                result.append((t, ntype))
    return result


def parse_cts_from_description(description):
    """Parse individual CTs from ADF description, returning a list of CT dicts."""
    if not description:
        return []
    lines = adf_to_lines(description)
    cts = []
    current_category = None
    current_ct = None

    def flush_ct():
        if current_ct is not None:
            cts.append(current_ct)

    for text, ntype in lines:
        ct_match = re.search(r'\bCT(\d+)\b\s*[-–]\s*(.+)', text)
        if ct_match:
            flush_ct()
            num         = ct_match.group(1)
            summary_raw = ct_match.group(2).strip()
            if '🔴' in text:
                criticality = 'critical'
            elif '🟡' in text or '🟠' in text:
                criticality = 'medium'
            else:
                criticality = 'low'
            # Parse optional [BUGS:key1,key2] tag
            bugs_tag = re.search(r'\[BUGS:([^\]]+)\]', summary_raw)
            if bugs_tag:
                linked_bugs = [k.strip() for k in bugs_tag.group(1).split(',') if k.strip()]
                summary_raw = re.sub(r'\s*\[BUGS:[^\]]+\]\s*', ' ', summary_raw).strip()
            else:
                linked_bugs = []
            # Parse optional [Status] tag — do NOT match [BUGS:...]
            status_tag = re.search(r'\[(?!BUGS:)([^\]]+)\]', summary_raw)
            if status_tag:
                ct_status = CT_STATUS_MAP.get(status_tag.group(1).lower().strip(), 'nao_iniciado')
                summary   = re.sub(r'\s*\[(?!BUGS:)[^\]]+\]\s*', ' ', summary_raw).strip()
            else:
                ct_status = 'nao_iniciado'
                summary   = summary_raw
            current_ct = {
                'id':          f'CT{int(num):02d}',
                'summary':     summary,
                'category':    current_category,
                'criticality': criticality,
                'ct_status':   ct_status,
                'linked_bugs': linked_bugs,
                'gherkin':     [],
            }
        elif ntype == "heading":
            flush_ct()
            current_ct = None
            clean = re.sub(r'^[\s✅❌⚠️🔥💡📊🔴🟡🟢🟠]+', '', text).strip()
            if clean:
                current_category = clean
        else:
            # Accumulate gherkin lines for the current CT
            if current_ct is not None:
                stripped = text.strip()
                if stripped:
                    current_ct['gherkin'].append(stripped)

    flush_ct()
    return cts


def _walk_adf_texts(node, callback):
    """Recursively walk all ADF text nodes and call callback(node, parent_content_list, index)."""
    if not node:
        return
    content = node.get("content", [])
    for i, child in enumerate(content):
        if child.get("type") == "text":
            callback(child, content, i)
        else:
            _walk_adf_texts(child, callback)


def adf_update_ct_tag(adf, ct_id_str, tag_type, value):
    """
    Walk ADF text nodes, find the one for ct_id_str (e.g. 'CT01'), and update
    either the status tag or the [BUGS:...] tag in-place.

    tag_type: 'status' → value is a status key string
              'bugs'   → value is a list of bug key strings
    Returns a deep-copied modified ADF.
    """
    adf_copy = copy.deepcopy(adf)
    ct_pattern = re.compile(r'\b' + re.escape(ct_id_str) + r'\b')

    def update_node(node, content_list, idx):
        text = node.get("text", "")
        if not ct_pattern.search(text):
            return
        if tag_type == "status":
            # Remove existing non-BUGS bracket tags
            text = re.sub(r'\s*\[(?!BUGS:)[^\]]+\]', '', text)
            # Insert status label right after "CT01 - " pattern
            label = CT_STATUS_KEY_TO_LABEL.get(value, value)
            text = re.sub(
                r'(\b' + re.escape(ct_id_str) + r'\b\s*[-–]\s*)',
                r'\1[' + label + '] ',
                text,
            )
        elif tag_type == "bugs":
            # Remove existing [BUGS:...] tag
            text = re.sub(r'\s*\[BUGS:[^\]]*\]', '', text)
            if value:
                text = text.rstrip() + ' [BUGS:' + ','.join(value) + ']'
        node["text"] = text

    _walk_adf_texts(adf_copy, update_node)
    return adf_copy


def parse_relationships(issue_fields):
    """Extract linked issues and parent as relationships."""
    rels = []
    for link in issue_fields.get("issuelinks", []):
        other = link.get("outwardIssue") or link.get("inwardIssue")
        if not other:
            continue
        other_f = other.get("fields", {})
        rels.append({
            "key":       other["key"],
            "summary":   other_f.get("summary", ""),
            "type":      other_f.get("issuetype", {}).get("name", ""),
            "link_type": link.get("type", {}).get("outward") or link.get("type", {}).get("name", ""),
        })
    parent = issue_fields.get("parent")
    if parent:
        parent_f = parent.get("fields", {})
        rels.append({
            "key":       parent["key"],
            "summary":   parent_f.get("summary", ""),
            "type":      parent_f.get("issuetype", {}).get("name", ""),
            "link_type": "subtarefa de",
        })
    return rels


# ── Jira fetchers ─────────────────────────────────────────────────────────────

def get_active_sprint(board_id=None):
    bid = board_id or DEFAULT_BOARD
    data = jira_get(f"/rest/agile/1.0/board/{bid}/sprint", {"state": "active"})
    values = data.get("values", [])
    return values[0] if values else None


def get_sprint_by_id(sprint_id):
    return jira_get(f"/rest/agile/1.0/sprint/{sprint_id}")


def get_sprint_issues(sprint_id, extra_fields=""):
    base_fields = ("summary,status,issuetype,assignee,priority,created,"
                   "resolutiondate,parent,subtasks,issuelinks,labels,components")
    fields = f"{base_fields},{extra_fields}" if extra_fields else base_fields
    all_issues = []
    start = 0
    while True:
        data = jira_get(
            f"/rest/agile/1.0/sprint/{sprint_id}/issue",
            {"startAt": start, "maxResults": 100, "fields": fields},
        )
        all_issues.extend(data["issues"])
        if start + 100 >= data["total"]:
            break
        start += 100
    return all_issues


# ── /api/sprints ──────────────────────────────────────────────────────────────

@app.route("/api/sprints")
def list_sprints():
    """Returns the last 12 closed sprints + the active sprint for the board (most recent first).
    Accepts ?board_id=X (defaults to DEFAULT_BOARD)."""
    bid = int(request.args.get("board_id", DEFAULT_BOARD))
    if bid not in BOARDS:
        bid = DEFAULT_BOARD

    # Fetch active sprint separately to avoid pagination cut-off
    active_data = jira_get(
        f"/rest/agile/1.0/board/{bid}/sprint",
        {"state": "active", "maxResults": 10},
    )
    active_sprints = active_data.get("values", [])

    # Fetch closed sprints — paginate to get the most recent ones
    closed_data = jira_get(
        f"/rest/agile/1.0/board/{bid}/sprint",
        {"state": "closed", "maxResults": 50},
    )
    closed_sprints = closed_data.get("values", [])
    total = closed_data.get("total", 0)
    if total > 50:
        start = max(0, total - 50)
        closed_data2 = jira_get(
            f"/rest/agile/1.0/board/{bid}/sprint",
            {"state": "closed", "maxResults": 50, "startAt": start},
        )
        closed_sprints = closed_data2.get("values", [])

    all_sprints = active_sprints + list(reversed(closed_sprints))
    result = [{
        "id":        s["id"],
        "name":      s["name"],
        "state":     s["state"],
        "startDate": s.get("startDate"),
        "endDate":   s.get("endDate"),
    } for s in all_sprints][:12]
    return jsonify(result)


@app.route("/api/boards")
def list_boards():
    """Returns the configured projects/boards."""
    return jsonify([
        {"board_id": bid, "project": info["project"], "name": info["name"]}
        for bid, info in BOARDS.items()
    ])


# ── /api/sprint ───────────────────────────────────────────────────────────────

@app.route("/api/sprint")
def sprint_data():
    """Full sprint dashboard data. Accepts ?sprint_id=X&board_id=Y (defaults to active BP sprint)."""
    sprint_id_param = request.args.get("sprint_id")
    board_id_param  = int(request.args.get("board_id", DEFAULT_BOARD))
    if board_id_param not in BOARDS:
        board_id_param = DEFAULT_BOARD
    project_key = BOARDS[board_id_param]["project"]

    if sprint_id_param:
        sprint = get_sprint_by_id(sprint_id_param)
    else:
        sprint = get_active_sprint(board_id_param)

    if not sprint:
        return jsonify({"error": "Nenhum sprint ativo encontrado"}), 404

    issues       = get_sprint_issues(sprint["id"])
    issues_by_key = {i["key"]: i for i in issues}

    stories    = {}
    bugs       = []
    test_cases = []

    for issue in issues:
        f      = issue["fields"]
        itype  = f["issuetype"]["name"]
        key    = issue["key"]
        status = f["status"]["name"]
        done   = is_done(status)

        if itype.lower() == "subtarefa":
            parent_key = f.get("parent", {}).get("key") if f.get("parent") else None
            risk, confidence = extract_risk(f["summary"])
            test_cases.append({
                "key": key, "summary": f["summary"], "status": status,
                "done": done, "risk": risk, "risk_confidence": confidence,
                "parent_key": parent_key, "is_qa": is_qa_subtask(f["summary"]),
                "is_planning":  is_planning_subtask(f["summary"]),
                "is_execution": is_execution_subtask(f["summary"]),
            })

        elif is_bug(itype):
            if is_cancelled(status):
                continue
            priority = (f.get("priority") or {}).get("name", "Sem prioridade")
            linked_stories = []
            for link in f.get("issuelinks", []):
                other = link.get("outwardIssue") or link.get("inwardIssue")
                if other and other["key"] in issues_by_key:
                    otype = issues_by_key[other["key"]]["fields"]["issuetype"]["name"]
                    if is_story(otype):
                        linked_stories.append(other["key"])
            if f.get("parent") and f["parent"]["key"] in issues_by_key:
                linked_stories.append(f["parent"]["key"])

            bugs.append({
                "key": key, "summary": f["summary"], "status": status, "type": itype,
                "priority": priority, "days_open": days_since(f.get("created")),
                "linked_stories": list(set(linked_stories)),
                "assignee": (f.get("assignee") or {}).get("displayName", "Sem responsável"),
                "open": not done,
                "labels": f.get("labels", []),
                "components": [c["name"] for c in f.get("components", [])],
            })

        elif is_story(itype):
            stories[key] = {
                "key": key, "summary": f["summary"], "status": status, "type": itype,
                "assignee": (f.get("assignee") or {}).get("displayName", "Sem responsável"),
                "subtask_keys": [s["key"] for s in f.get("subtasks", [])],
                "test_cases": [], "blocked_by_bugs": [], "done": done,
            }

    for tc in test_cases:
        if tc["parent_key"] and tc["parent_key"] in stories:
            stories[tc["parent_key"]]["test_cases"].append(tc)

    open_bugs = sorted([b for b in bugs if b["open"]],
                       key=lambda b: priority_sort_key(b["priority"]))

    # Map story → all bugs (open + closed) for full picture
    story_all_bugs: dict = {k: [] for k in stories}
    for bug in sorted(bugs, key=lambda b: priority_sort_key(b["priority"])):
        for sk in bug["linked_stories"]:
            if sk in story_all_bugs:
                story_all_bugs[sk].append({
                    "key":       bug["key"],
                    "summary":   bug["summary"],
                    "priority":  bug["priority"],
                    "type":      bug["type"],
                    "status":    bug["status"],
                    "days_open": bug["days_open"],
                    "assignee":  bug["assignee"],
                    "open":      bug["open"],
                })

    for bug in open_bugs:
        for sk in bug["linked_stories"]:
            if sk in stories:
                stories[sk]["blocked_by_bugs"].append({
                    "key": bug["key"], "summary": bug["summary"],
                    "priority": bug["priority"], "days_open": bug["days_open"],
                })

    qa_tcs   = [tc for tc in test_cases if tc["is_qa"]] or test_cases

    FINAL_CT_STATUSES = {"aprovado", "cancelado", "skipped"}

    # Count real CTs from "[QA] Planejamento de Casos de Teste" descriptions
    planning_subtasks_raw = [tc for tc in test_cases if tc["is_planning"]]
    total_tc = 0
    done_tc  = 0
    planning_subtasks_data = []
    for ps in planning_subtasks_raw:
        issue_data = jira_get(f"/rest/api/3/issue/{ps['key']}", {"fields": "description"})
        cts = parse_cts_from_description(issue_data["fields"].get("description"))
        ct_count = len(cts)
        total_tc += ct_count
        done_tc += sum(1 for ct in cts if ct["ct_status"] in FINAL_CT_STATUSES)
        story = stories.get(ps["parent_key"], {})
        status_dist: dict = {}
        for ct in cts:
            s = ct["ct_status"]
            status_dist[s] = status_dist.get(s, 0) + 1
        planning_subtasks_data.append({
            "key":           ps["key"],
            "story_key":     ps["parent_key"] or "",
            "story_summary": story.get("summary", ""),
            "done":          ps["done"],
            "ct_count":      ct_count,
            "status_dist":   status_dist,
            "cts":           cts,
        })

    # Last fallback: if still no total, count QA subtasks
    if total_tc == 0:
        total_tc = len(qa_tcs)

    comp_pct = round(done_tc / total_tc * 100) if total_tc else 0

    risk_dist = {"critical": 0, "medium": 0, "low": 0}
    if planning_subtasks_data:
        for ps in planning_subtasks_data:
            for ct in ps["cts"]:
                key = ct["criticality"] if ct["criticality"] in risk_dist else "low"
                risk_dist[key] += 1
    else:
        for tc in qa_tcs:
            risk_dist[tc["risk"]] = risk_dist.get(tc["risk"], 0) + 1

    comp_bugs  = {}
    label_bugs = {}
    for bug in bugs:
        for c in bug["components"]:
            comp_bugs[c] = comp_bugs.get(c, 0) + 1
        for l in bug["labels"]:
            label_bugs[l] = label_bugs.get(l, 0) + 1

    automation_candidates = sorted(
        [{"name": k, "type": "Componente", "bug_count": v} for k, v in comp_bugs.items()] +
        [{"name": k, "type": "Label",      "bug_count": v} for k, v in label_bugs.items()],
        key=lambda x: x["bug_count"], reverse=True,
    )[:5]

    status_count = {}
    type_count   = {}
    for issue in issues:
        s = issue["fields"]["status"]["name"]
        t = issue["fields"]["issuetype"]["name"]
        status_count[s] = status_count.get(s, 0) + 1
        type_count[t]   = type_count.get(t, 0) + 1

    STORY_METRIC_TYPES = {"história", "historia", "story", "melhoria"}
    stories_list    = list(stories.values())
    metric_stories  = [s for s in stories_list
                       if s.get("type", "").lower() in STORY_METRIC_TYPES]
    blocked_stories = [
        {**s, "all_bugs": story_all_bugs.get(s["key"], [])}
        for s in stories_list if s["blocked_by_bugs"]
    ]
    done_stories    = [s for s in metric_stories if s["done"]]

    flat_issues = [{
        "key":      i["key"],
        "summary":  i["fields"]["summary"],
        "status":   i["fields"]["status"]["name"],
        "type":     i["fields"]["issuetype"]["name"],
        "priority": (i["fields"].get("priority") or {}).get("name", "—"),
        "assignee": (i["fields"].get("assignee") or {}).get("displayName", "Sem responsável"),
    } for i in issues]

    # Also fetch bugs via JQL — bugs are often linked to sprint stories but not directly
    # added as sprint items, so the agile sprint endpoint misses them.
    existing_keys = {i["key"] for i in issues}
    try:
        jql = (f'project = {project_key} AND issuetype in (Bug, "Bug (Experimental)", Incident) '
               f'AND sprint = {sprint["id"]} ORDER BY created DESC')
        start = 0
        while True:
            data = jira_get("/rest/api/3/search/jql", {
                "jql": jql, "startAt": start, "maxResults": 100,
                "fields": "summary,status,issuetype,priority,assignee",
            })
            for bi in data["issues"]:
                if bi["key"] not in existing_keys:
                    bf = bi["fields"]
                    s  = bf["status"]["name"]
                    t  = bf["issuetype"]["name"]
                    if is_cancelled(s):
                        existing_keys.add(bi["key"])
                        continue
                    flat_issues.append({
                        "key":      bi["key"],
                        "summary":  bf["summary"],
                        "status":   s,
                        "type":     t,
                        "priority": (bf.get("priority") or {}).get("name", "—"),
                        "assignee": (bf.get("assignee") or {}).get("displayName", "Sem responsável"),
                    })
                    status_count[s] = status_count.get(s, 0) + 1
                    type_count[t]   = type_count.get(t, 0) + 1
                    existing_keys.add(bi["key"])
            if start + 100 >= data["total"]:
                break
            start += 100
    except Exception:
        pass

    return jsonify({
        "sprint": {
            "id":        sprint["id"],
            "name":      sprint["name"],
            "state":     sprint.get("state", "active"),
            "startDate": sprint.get("startDate"),
            "endDate":   sprint.get("endDate"),
            "goal":      sprint.get("goal", ""),
        },
        "total":        len(issues),
        "status_count": status_count,
        "type_count":   type_count,
        "test_completion": {"total": total_tc, "done": done_tc, "pct": comp_pct},
        "planning_subtasks": planning_subtasks_data,
        "risk_distribution": risk_dist,
        "stories":          stories_list,
        "stories_done":     len(done_stories),
        "stories_total":    len(metric_stories),
        "open_bugs":        open_bugs,
        "blocked_stories":  blocked_stories,
        "automation_candidates": automation_candidates,
        "_issues": flat_issues,
    })


# ── /api/ct/status ────────────────────────────────────────────────────────────

@app.route("/api/ct/status", methods=["POST"])
def ct_update_status():
    """Update the status tag of a CT inside a subtask description."""
    body = request.get_json(silent=True) or {}
    subtask_key = body.get("subtask_key")
    ct_id       = body.get("ct_id")
    new_status  = body.get("new_status")

    if not subtask_key or not ct_id or not new_status:
        return jsonify({"error": "subtask_key, ct_id, new_status são obrigatórios"}), 400
    if new_status not in WORKFLOW_TRANSITIONS:
        return jsonify({"error": f"Status inválido: {new_status}"}), 400

    try:
        issue_data = jira_get(f"/rest/api/3/issue/{subtask_key}", {"fields": "description"})
        adf = issue_data["fields"].get("description")
        if not adf:
            return jsonify({"error": "Descrição vazia"}), 400
        updated_adf = adf_update_ct_tag(adf, ct_id, "status", new_status)
        r = requests.put(
            f"{JIRA_URL}/rest/api/3/issue/{subtask_key}",
            auth=auth,
            headers={**headers, "Content-Type": "application/json"},
            json={"fields": {"description": updated_adf}},
            timeout=15,
        )
        if not r.ok:
            return jsonify({"error": r.text}), 400
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 400


# ── /api/ct/bugs ──────────────────────────────────────────────────────────────

@app.route("/api/ct/bugs", methods=["POST"])
def ct_update_bugs():
    """Update the [BUGS:...] tag of a CT inside a subtask description."""
    body = request.get_json(silent=True) or {}
    subtask_key = body.get("subtask_key")
    ct_id       = body.get("ct_id")
    bug_keys    = body.get("bug_keys", [])

    if not subtask_key or not ct_id:
        return jsonify({"error": "subtask_key e ct_id são obrigatórios"}), 400

    try:
        issue_data = jira_get(f"/rest/api/3/issue/{subtask_key}", {"fields": "description"})
        adf = issue_data["fields"].get("description")
        if not adf:
            return jsonify({"error": "Descrição vazia"}), 400
        updated_adf = adf_update_ct_tag(adf, ct_id, "bugs", bug_keys)
        r = requests.put(
            f"{JIRA_URL}/rest/api/3/issue/{subtask_key}",
            auth=auth,
            headers={**headers, "Content-Type": "application/json"},
            json={"fields": {"description": updated_adf}},
            timeout=15,
        )
        if not r.ok:
            return jsonify({"error": r.text}), 400
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 400


# ── /api/bugs/search ──────────────────────────────────────────────────────────

@app.route("/api/bugs/search")
def bugs_search():
    """Quick search for any ticket type by text (impedimentos or relacionados)."""
    q = request.args.get("q", "").strip()
    if not q:
        return jsonify([])
    bid = int(request.args.get("board_id", DEFAULT_BOARD))
    proj = BOARDS.get(bid, BOARDS[DEFAULT_BOARD])["project"]
    safe_q = q.replace('"', '\\"')
    jql = f'project = {proj} AND (key = "{safe_q}" OR text ~ "{safe_q}") ORDER BY created DESC'
    try:
        data = jira_get("/rest/api/3/search/jql", {
            "jql": jql, "startAt": 0, "maxResults": 10,
            "fields": "summary,status,issuetype",
        })
        results = []
        for issue in data.get("issues", []):
            f = issue["fields"]
            results.append({
                "key":     issue["key"],
                "summary": f.get("summary", ""),
                "status":  f["status"]["name"],
                "type":    f["issuetype"]["name"],
            })
        return jsonify(results)
    except Exception as e:
        return jsonify({"error": str(e)}), 400


# ── /api/bugs-history ─────────────────────────────────────────────────────────

@app.route("/api/bugs-history")
def bugs_history():
    """Last 7 closed sprints + active sprint: open bugs & incidents + running total."""
    bid = int(request.args.get("board_id", DEFAULT_BOARD))
    if bid not in BOARDS:
        bid = DEFAULT_BOARD
    proj = BOARDS[bid]["project"]
    try:
        closed_data = jira_get(
            f"/rest/agile/1.0/board/{bid}/sprint",
            {"state": "closed", "maxResults": 50},
        )
        closed = sorted(closed_data.get("values", []), key=lambda s: s.get("endDate", ""))
        closed = closed[-7:]  # last 7 closed

        active_data = jira_get(
            f"/rest/agile/1.0/board/{bid}/sprint",
            {"state": "active", "maxResults": 1},
        )
        active = active_data.get("values", [])

        sprints = closed + active  # oldest → newest, active last

        history = []
        for sprint in sprints:
            sid  = sprint["id"]
            jql  = (f'project = {proj} AND issuetype in (Bug, "Bug (Experimental)", Incident) '
                    f'AND sprint = {sid}')
            issues = []
            start  = 0
            while True:
                batch = jira_get("/rest/api/3/search/jql", {
                    "jql": jql, "startAt": start, "maxResults": 100,
                    "fields": "issuetype,status",
                })
                issues.extend(batch["issues"])
                if start + 100 >= batch.get("total", 0):
                    break
                start += 100

            bugs_total      = 0
            incidents_total = 0
            bugs_open       = 0
            incidents_open  = 0
            cancelled_total = 0
            for issue in issues:
                f      = issue["fields"]
                itype  = f["issuetype"]["name"].lower()
                status = f["status"]["name"].lower()
                if status in CANCELLED_STATUSES:
                    cancelled_total += 1
                    continue
                done = status in DONE_STATUSES
                if "incident" in itype:
                    incidents_total += 1
                    if not done:
                        incidents_open += 1
                else:
                    bugs_total += 1
                    if not done:
                        bugs_open += 1

            history.append({
                "sprintName":       sprint["name"],
                "bugsTotal":        bugs_total,
                "incidentsTotal":   incidents_total,
                "bugsAbertos":      bugs_open,
                "incidentsAbertos": incidents_open,
                "cancelados":       cancelled_total,
                "isActive":         sprint.get("state") == "active",
            })

        # totalAberto = open bugs in last sprint + open bugs in backlog (no sprint)
        last_entry = history[-1] if history else None
        sprint_open = (last_entry["bugsAbertos"] + last_entry["incidentsAbertos"]) if last_entry else 0

        backlog_open = 0
        try:
            bug_jql = 'issuetype in (Bug, "Bug (Experimental)", Incident)'
            start = 0
            while True:
                batch = jira_get(f"/rest/agile/1.0/board/{BOARD_ID}/backlog", {
                    "jql": bug_jql, "startAt": start, "maxResults": 100, "fields": "status",
                })
                for issue in batch.get("issues", []):
                    s = issue["fields"]["status"]["name"].lower()
                    if s not in DONE_STATUSES and s not in CANCELLED_STATUSES:
                        backlog_open += 1
                if start + 100 >= batch.get("total", 0):
                    break
                start += 100
        except Exception:
            pass

        total_aberto = sprint_open + backlog_open

        return jsonify({"success": True, "history": history, "totalAberto": total_aberto})
    except Exception as e:
        app.logger.error(f"bugs-history error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


# ── /api/bugs ─────────────────────────────────────────────────────────────────

@app.route("/api/bugs")
def get_bugs():
    """
    Bug tracker across sprints.
    ?sprint_id=X   — bugs of a specific sprint (default: active sprint)
    ?scope=all     — all bugs in the project (last 300)
    ?board_id=X    — which board/project (default: DEFAULT_BOARD)
    """
    sprint_id_param = request.args.get("sprint_id")
    scope           = request.args.get("scope", "sprint")
    bid = int(request.args.get("board_id", DEFAULT_BOARD))
    if bid not in BOARDS:
        bid = DEFAULT_BOARD
    proj = BOARDS[bid]["project"]

    fields = ("summary,status,issuetype,priority,assignee,"
              "issuelinks,parent,created,resolutiondate")
    bug_jql_filter = 'issuetype in (Bug, "Bug (Experimental)", Incident)'

    all_issues  = []
    sprint_name = None

    if scope == "all":
        jql = (f'project = {proj} AND {bug_jql_filter} '
               f'ORDER BY created DESC')
        start = 0
        while len(all_issues) < 300:
            data = jira_get("/rest/api/3/search/jql", {
                "jql": jql, "startAt": start,
                "maxResults": 100, "fields": fields,
            })
            all_issues.extend(data["issues"])
            if start + 100 >= data["total"]:
                break
            start += 100
    else:
        if sprint_id_param:
            sid = sprint_id_param
            sprint_obj = get_sprint_by_id(sid)
            sprint_name = sprint_obj.get("name", f"Sprint {sid}")
        else:
            sprint_obj = get_active_sprint(bid)
            if not sprint_obj:
                return jsonify({"error": "Nenhum sprint ativo"}), 404
            sid = sprint_obj["id"]
            sprint_name = sprint_obj["name"]

        start = 0
        while True:
            data = jira_get(
                f"/rest/agile/1.0/sprint/{sid}/issue",
                {"startAt": start, "maxResults": 100,
                 "jql": bug_jql_filter, "fields": fields},
            )
            all_issues.extend(data["issues"])
            if start + 100 >= data["total"]:
                break
            start += 100

    bugs = []
    for issue in all_issues:
        f      = issue["fields"]
        status = f["status"]["name"]
        itype  = f["issuetype"]["name"]
        bugs.append({
            "key":           issue["key"],
            "summary":       f["summary"],
            "type":          itype,
            "status":        status,
            "priority":      (f.get("priority") or {}).get("name", "Sem prioridade"),
            "days_open":     days_since(f.get("created")),
            "assignee":      (f.get("assignee") or {}).get("displayName", "Sem responsável"),
            "open":          not is_done(status) and not is_cancelled(status),
            "sprint":        sprint_name,
            "relationships": parse_relationships(f),
        })

    bugs.sort(key=lambda b: (priority_sort_key(b["priority"]), -(b["days_open"] or 0)))

    status_count = {}
    type_count   = {}
    for b in bugs:
        status_count[b["status"]] = status_count.get(b["status"], 0) + 1
        type_count[b["type"]]     = type_count.get(b["type"], 0) + 1

    return jsonify({
        "bugs":         bugs,
        "status_count": status_count,
        "type_count":   type_count,
        "total":        len(bugs),
        "sprint":       sprint_name,
    })


# ── /api/env-status ───────────────────────────────────────────────────────────

@app.route("/api/env-status")
def env_status():
    if not QA_ENV_URL:
        return jsonify({"status": "unknown", "url": None})
    try:
        r = requests.get(QA_ENV_URL, timeout=5, allow_redirects=True)
        online = r.status_code < 500
    except Exception:
        online = False
    return jsonify({"status": "online" if online else "offline", "url": QA_ENV_URL})


@app.route("/")
def index():
    return app.send_static_file("index.html")


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5001)
