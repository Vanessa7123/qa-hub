import json
import os
import requests
from flask import Flask, jsonify, request
from flask_cors import CORS

from lib.config import (
    JIRA_URL, QA_ENV_URL,
    BOARDS, DEFAULT_BOARD,
    DONE_STATUSES, CANCELLED_STATUSES,
    WORKFLOW_TRANSITIONS,
)
from lib.jira_client import (
    auth, headers,
    jira_get,
    is_done, is_cancelled, is_bug, is_story,
    is_qa_subtask, is_planning_subtask, is_execution_subtask,
    days_since, priority_sort_key, extract_risk,
    get_active_sprint, get_sprint_by_id, get_sprint_issues,
)
from lib.adf_parser import (
    parse_cts_from_description,
    adf_update_ct_tag,
    parse_relationships,
)

app = Flask(__name__, static_folder="static", static_url_path="")
CORS(app)


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
    """Full sprint dashboard data. Accepts ?sprint_id=X&board_id=Y (defaults to active sprint)."""
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

    issues        = get_sprint_issues(sprint["id"])
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

    qa_tcs = [tc for tc in test_cases if tc["is_qa"]] or test_cases

    FINAL_CT_STATUSES = {"aprovado", "cancelado", "skipped"}

    # Count real CTs from "[QA] Planejamento de Casos de Teste" descriptions
    planning_subtasks_raw  = [tc for tc in test_cases if tc["is_planning"]]
    total_tc = 0
    done_tc  = 0
    planning_subtasks_data = []
    for ps in planning_subtasks_raw:
        issue_data = jira_get(f"/rest/api/3/issue/{ps['key']}", {"fields": "description"})
        cts        = parse_cts_from_description(issue_data["fields"].get("description"))
        ct_count   = len(cts)
        total_tc  += ct_count
        done_tc   += sum(1 for ct in cts if ct["ct_status"] in FINAL_CT_STATUSES)
        story      = stories.get(ps["parent_key"], {})
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

    # Fallback: if no planning subtasks found, count QA subtasks instead
    if total_tc == 0:
        total_tc = len(qa_tcs)

    comp_pct = round(done_tc / total_tc * 100) if total_tc else 0

    risk_dist = {"critical": 0, "medium": 0, "low": 0}
    if planning_subtasks_data:
        for ps in planning_subtasks_data:
            for ct in ps["cts"]:
                k = ct["criticality"] if ct["criticality"] in risk_dist else "low"
                risk_dist[k] += 1
    else:
        for tc in qa_tcs:
            risk_dist[tc["risk"]] = risk_dist.get(tc["risk"], 0) + 1

    comp_bugs  = {}
    label_bugs = {}
    for bug in bugs:
        for c in bug["components"]:
            comp_bugs[c] = comp_bugs.get(c, 0) + 1
        for lbl in bug["labels"]:
            label_bugs[lbl] = label_bugs.get(lbl, 0) + 1

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
    done_stories = [s for s in metric_stories if s["done"]]

    flat_issues = [{
        "key":      i["key"],
        "summary":  i["fields"]["summary"],
        "status":   i["fields"]["status"]["name"],
        "type":     i["fields"]["issuetype"]["name"],
        "priority": (i["fields"].get("priority") or {}).get("name", "—"),
        "assignee": (i["fields"].get("assignee") or {}).get("displayName", "Sem responsável"),
    } for i in issues]

    # Also fetch bugs via JQL — bugs linked to sprint stories but not added as sprint items
    # are missed by the agile sprint endpoint.
    existing_keys = {i["key"] for i in issues}
    try:
        jql   = (f'project = {project_key} AND issuetype in (Bug, "Bug (Experimental)", Incident) '
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
        "total":             len(issues),
        "status_count":      status_count,
        "type_count":        type_count,
        "test_completion":   {"total": total_tc, "done": done_tc, "pct": comp_pct},
        "planning_subtasks": planning_subtasks_data,
        "risk_distribution": risk_dist,
        "stories":           stories_list,
        "stories_done":      len(done_stories),
        "stories_total":     len(metric_stories),
        "open_bugs":         open_bugs,
        "blocked_stories":   blocked_stories,
        "automation_candidates": automation_candidates,
        "_issues": flat_issues,
    })


# ── /api/ct/status ────────────────────────────────────────────────────────────

@app.route("/api/ct/status", methods=["POST"])
def ct_update_status():
    """Update the status tag of a CT inside a subtask description."""
    body        = request.get_json(silent=True) or {}
    subtask_key = body.get("subtask_key")
    ct_id       = body.get("ct_id")
    new_status  = body.get("new_status")

    if not subtask_key or not ct_id or not new_status:
        return jsonify({"error": "subtask_key, ct_id, new_status são obrigatórios"}), 400
    if new_status not in WORKFLOW_TRANSITIONS:
        return jsonify({"error": f"Status inválido: {new_status}"}), 400

    try:
        issue_data  = jira_get(f"/rest/api/3/issue/{subtask_key}", {"fields": "description"})
        adf         = issue_data["fields"].get("description")
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
    body        = request.get_json(silent=True) or {}
    subtask_key = body.get("subtask_key")
    ct_id       = body.get("ct_id")
    bug_keys    = body.get("bug_keys", [])

    if not subtask_key or not ct_id:
        return jsonify({"error": "subtask_key e ct_id são obrigatórios"}), 400

    try:
        issue_data  = jira_get(f"/rest/api/3/issue/{subtask_key}", {"fields": "description"})
        adf         = issue_data["fields"].get("description")
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
    """Quick search for any ticket type by text (for linking bugs/related issues to CTs)."""
    q = request.args.get("q", "").strip()
    if not q:
        return jsonify([])
    bid    = int(request.args.get("board_id", DEFAULT_BOARD))
    proj   = BOARDS.get(bid, BOARDS[DEFAULT_BOARD])["project"]
    safe_q = q.replace('"', '\\"')
    jql    = f'project = {proj} AND (key = "{safe_q}" OR text ~ "{safe_q}") ORDER BY created DESC'
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
        active  = active_data.get("values", [])
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

        last_entry  = history[-1] if history else None
        sprint_open = (last_entry["bugsAbertos"] + last_entry["incidentsAbertos"]) if last_entry else 0

        backlog_open = 0
        try:
            bug_jql = f'project = {proj} AND issuetype in (Bug, "Bug (Experimental)", Incident)'
            start   = 0
            while True:
                batch = jira_get(f"/rest/agile/1.0/board/{bid}/backlog", {
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

        return jsonify({
            "success":      True,
            "history":      history,
            "totalAberto":  sprint_open + backlog_open,
        })
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
    bid             = int(request.args.get("board_id", DEFAULT_BOARD))
    if bid not in BOARDS:
        bid = DEFAULT_BOARD
    proj = BOARDS[bid]["project"]

    fields         = ("summary,status,issuetype,priority,assignee,"
                      "issuelinks,parent,created,resolutiondate")
    bug_jql_filter = 'issuetype in (Bug, "Bug (Experimental)", Incident)'

    all_issues  = []
    sprint_name = None

    if scope == "all":
        jql   = f'project = {proj} AND {bug_jql_filter} ORDER BY created DESC'
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
            sid         = sprint_id_param
            sprint_obj  = get_sprint_by_id(sid)
            sprint_name = sprint_obj.get("name", f"Sprint {sid}")
        else:
            sprint_obj = get_active_sprint(bid)
            if not sprint_obj:
                return jsonify({"error": "Nenhum sprint ativo"}), 404
            sid         = sprint_obj["id"]
            sprint_name = sprint_obj["name"]

        start = 0
        while True:
            data = jira_get(
                f"/rest/agile/1.0/sprint/{sid}/issue",
                {"startAt": start, "maxResults": 100,
                 "jql": f"project = {proj} AND {bug_jql_filter}", "fields": fields},
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
        r      = requests.get(QA_ENV_URL, timeout=5, allow_redirects=True)
        online = r.status_code < 500
    except Exception:
        online = False
    return jsonify({"status": "online" if online else "offline", "url": QA_ENV_URL})


# ── /api/ct/data ──────────────────────────────────────────────────────────────

CT_DATA_FILE = os.path.join(os.path.dirname(__file__), "data", "ct_data.json")

def _read_ct_data():
    try:
        with open(CT_DATA_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {"links": {}, "comments": {}}

def _write_ct_data(data):
    os.makedirs(os.path.dirname(CT_DATA_FILE), exist_ok=True)
    with open(CT_DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

@app.route("/api/ct/data", methods=["GET"])
def ct_data_get():
    return jsonify(_read_ct_data())

@app.route("/api/ct/data", methods=["POST"])
def ct_data_post():
    body = request.get_json(silent=True) or {}
    data = _read_ct_data()
    if "links" in body:
        data["links"] = body["links"]
    if "comments" in body:
        data["comments"] = body["comments"]
    _write_ct_data(data)
    return jsonify({"ok": True})


@app.route("/")
def index():
    return app.send_static_file("index.html")


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5001)
