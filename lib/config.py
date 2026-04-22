import json
import os

from dotenv import load_dotenv

load_dotenv()

# ── Jira connection ────────────────────────────────────────────────────────────

JIRA_URL   = os.getenv("JIRA_URL")
JIRA_EMAIL = os.getenv("JIRA_EMAIL")
JIRA_TOKEN = os.getenv("JIRA_TOKEN")
QA_ENV_URL = os.getenv("QA_ENV_URL", "")

# ── Board / project registry ───────────────────────────────────────────────────
# Configured via JIRA_BOARDS in .env (JSON array).
# Example: [{"id": 283, "project": "PROJ", "name": "My Project"}]

_boards_raw = os.getenv("JIRA_BOARDS", "[]")
try:
    BOARDS = {
        int(b["id"]): {"project": b["project"], "name": b["name"]}
        for b in json.loads(_boards_raw)
    }
except Exception:
    BOARDS = {}

_default_raw   = os.getenv("JIRA_DEFAULT_BOARD", "")
DEFAULT_BOARD  = int(_default_raw) if _default_raw.isdigit() else (next(iter(BOARDS), 0))
BOARD_ID       = DEFAULT_BOARD  # legacy alias kept for safety

# ── Issue status sets ──────────────────────────────────────────────────────────

DONE_STATUSES = {
    "finalizado", "pronto p/produção",
    "done", "closed", "resolved", "pronto p/producao",
}

CANCELLED_STATUSES = {"cancelada"}

# ── Issue type sets ────────────────────────────────────────────────────────────

BUG_TYPES = {"bug", "bug (experimental)", "incident"}

STORY_TYPES = {
    "história", "historia", "story", "melhoria",
    "débito técnico", "debito tecnico", "spike", "task", "tarefa",
}

# ── Risk extraction ────────────────────────────────────────────────────────────
# Each entry: (level, [keywords in PT and EN])

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

# ── Priority sort order ────────────────────────────────────────────────────────

PRIORITY_ORDER = {
    "blocker": 0, "crítica": 0, "critica": 0, "critical": 0,
    "alta": 1, "high": 1,
    "média": 2, "media": 2, "medium": 2,
    "baixa": 3, "low": 3,
    "trivial": 4, "mínima": 4, "minima": 4,
}

# ── CT (test case) status ──────────────────────────────────────────────────────
# Maps lowercase tag text inside [brackets] to canonical status key.

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

# Allowed transitions per status (used for workflow validation).
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
