# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

QA Hub is a real-time dashboard built for Vanessa, a QA engineer.
It connects to Jira Cloud and makes QA work visible to the whole team (developers, PO, Scrum Master, QA leader).

**Jira instance:** ferreiracosta.atlassian.net
**Project:** BUPTN (Business Partner)
**Board:** BP - Delivery (board ID 283, Scrum) — this is the board with active sprints

## Running the project

```bash
pip install -r requirements.txt   # first time only
python3 app.py                     # starts at http://localhost:5001
```

`python3 app.py` is the only command end users need. No build step for the frontend.

## Architecture

```
app.py              Flask backend — all Jira API calls, data processing, REST endpoints
static/index.html   Single-file frontend — vanilla JS + Chart.js via CDN (no build step)
requirements.txt    Python deps: flask, flask-cors, requests, python-dotenv
.env                Credentials (never committed)
.env.example        Template for credentials
STARTER_PROMPT.md   Context prompt to paste when starting a new Claude Code session
```

**Key constraint:** the frontend must remain a single HTML file (`static/index.html`).
No npm, no React build step, no bundler. CDN-loaded libraries only.

## Jira API notes

- Use `/rest/agile/1.0/` for sprint/board data
- Use `/rest/api/3/search/jql` for issue search (the old `/rest/api/3/search` was removed)
- Paginate all requests — sprints can have 150+ issues
- Board 283 is Scrum (has active sprints); board 286 is Kanban (upstream, no sprints)

## Jira data model & constraints

- **Test cases = subtasks** of stories (no formal test case issue type)
- **Risk** is written as natural language in subtask text — not a structured field
- **Bugs** can be subtasks of stories OR linked via Jira issue links
- Cannot create custom fields or issue types (limited admin access)
- Risk extraction must be keyword-based (Portuguese + English terms)

## Design principles

- Single URL, zero training needed for non-technical team members
- Every number must be traceable to real Jira data
- Risk-centric: risk flows through test cases, bugs, and delivery impact
- Visual style: background `#f1f5f9`, cards white, primary accent `#6366f1` (indigo)
- Risk colors: Critical `#dc2626`, High `#ea580c`, Medium `#d97706`, Low `#16a34a`

## Roadmap

**Phase 1 (done):** Sprint dashboard with status/type charts, issue table with filters.

**Phase 2 (next):**
- Smarter risk extraction (more PT/EN terms, confidence indicator)
- Time metrics: days bug open, days bug resolved → QA sign-off, days story in "In Testing"
- Automation candidate detection: rank components/labels with recurring bugs
- Sprint quality report: printable HTML with bug totals, risk distribution, recommendations

**Phase 3 (future):**
- Risk chain view: Bug → Test Case → Story → Delivery impact
- Application stability tracker: timeline of incidents and regressions
- QA effort visibility: test cases created, executed, passed, failed
