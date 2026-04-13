# Starter Prompt — Copy and paste this as your first message in Claude Code

---

Read the CLAUDE.md file in this project before doing anything else.
It has the full context of what we're building, the constraints, the design principles, and the roadmap.

I am Vanessa, a QA engineer at Ferreira Costa. This project is my QA Hub —
a real-time dashboard that connects to our Jira Cloud instance (ferreiracosta.atlassian.net, project BUPTN)
and makes my work visible to my team (developers, PO, Scrum Master, QA leader).

The Phase 1 files already exist: app.py (Flask backend), static/index.html (React dashboard),
requirements.txt, and .env.example. These are working and ready to run.

---

## What I need from you now

I want you to:

1. Read CLAUDE.md fully to understand the project, constraints, and planned features.

2. Run `pip install -r requirements.txt` to make sure dependencies are installed.

3. Review app.py and static/index.html so you understand the current state.

4. Help me continue building. The next priorities (Phase 2) are:

   a. **Improve risk extraction** — right now it's keyword-based from subtask text.
      Make it smarter: support more Portuguese and English terms, handle variations,
      and show a confidence indicator when the risk couldn't be determined.

   b. **Time metrics** — add to the dashboard:
      - How many days each bug has been open (already partially there, improve the display)
      - How many days between a bug being resolved in Jira and QA signing it off
      - How many days each story has been in "In Testing" status specifically (not just created date)

   c. **Automation candidate detection** — analyze which Jira components or labels
      have the most recurring bugs across the current sprint and surface a ranked list
      with a recommendation: "This flow has X bugs — consider adding regression coverage."

   d. **Sprint quality report** — a button on the dashboard that generates a clean,
      printable HTML report summarizing the sprint quality: total bugs, risk distribution,
      blocked stories, test case completion, and 3 key recommendations.

5. Keep the single-file constraint for the frontend (everything in static/index.html, no build step).
   Keep `python app.py` as the only command needed to run the project.

6. When you make changes, test them and tell me what you changed and why.

---

## My Jira structure (important)

- Stories have subtasks — those subtasks ARE my test cases (there's no formal test case issue type)
- Risk/priority of a test case is written in the subtask text as natural language (not consistent yet)
- Bugs can be subtasks of stories OR linked via Jira issue links
- I cannot create custom fields or issue types in Jira (limited admin access)
- I will manually add conventions going forward (e.g., tagging test case risk in a standard format)

---

## My QA environment URL (for the health check indicator)

[FILL THIS IN — paste the URL of your QA environment here, e.g. https://qa.yourapp.com.br]

---

Start by reading CLAUDE.md, then give me a brief summary of what you understood about the project
and your plan for implementing Phase 2 before you write any code.
