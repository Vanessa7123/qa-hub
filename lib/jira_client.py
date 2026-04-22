import re
from datetime import datetime, timezone

import requests
from requests.auth import HTTPBasicAuth

from .config import (
    JIRA_URL, JIRA_EMAIL, JIRA_TOKEN,
    DONE_STATUSES, CANCELLED_STATUSES, BUG_TYPES, STORY_TYPES,
    RISK_LEVELS, PRIORITY_ORDER,
)

auth    = HTTPBasicAuth(JIRA_EMAIL, JIRA_TOKEN)
headers = {"Accept": "application/json"}


# ── HTTP ───────────────────────────────────────────────────────────────────────

def jira_get(path, params=None):
    r = requests.get(f"{JIRA_URL}{path}", auth=auth, headers=headers,
                     params=params, timeout=15)
    r.raise_for_status()
    return r.json()


# ── Status / type helpers ──────────────────────────────────────────────────────

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


# ── Time helpers ───────────────────────────────────────────────────────────────

def days_since(date_str):
    if not date_str:
        return None
    dt = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
    return (datetime.now(timezone.utc) - dt).days

def priority_sort_key(name):
    return PRIORITY_ORDER.get((name or "").lower(), 99)


# ── Risk extraction ────────────────────────────────────────────────────────────

def extract_risk(text):
    text_lower = text.lower()
    for level, keywords in RISK_LEVELS:
        for kw in keywords:
            if re.search(rf"\b{re.escape(kw)}\b", text_lower):
                return level, "high"
            if kw in text_lower:
                return level, "low"
    return "unknown", "none"


# ── Sprint fetchers ────────────────────────────────────────────────────────────

def get_active_sprint(board_id):
    data = jira_get(f"/rest/agile/1.0/board/{board_id}/sprint", {"state": "active"})
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
