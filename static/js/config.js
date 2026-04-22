// UI constants — colors, labels, sort orders, workflow definitions.
// Nothing here is mutable. Import what you need from this module.

// ── Jira ──────────────────────────────────────────────────────────────────────

export const JIRA_BASE_URL = "https://ferreiracosta.atlassian.net/browse/";
export const REFRESH_MS    = 5 * 60 * 1000; // auto-refresh interval

// ── Status / type colors ───────────────────────────────────────────────────────

export const STATUS_COLORS = {
  "Não Iniciado":          "#94a3b8",
  "Em andamento":          "#f59e0b",
  "Revisão de pares":      "#f97316",
  "Validação Pré QA":      "#ec4899",
  "PRONTO P/QA":           "#6366f1",
  "EM TESTE INTEGRADO":    "#0284c7",
  "EM VALIDAÇÃO NEGÓCIO":  "#0d9488",
  "PRONTO P/PRODUÇÃO":     "#84cc16",
  "Finalizado":            "#16a34a",
  "Reaberto":              "#ef4444",
  "Cancelada":             "#64748b",
  "DEPLOY QAS":            "#06b6d4",
};

export const TYPE_COLORS = {
  "História":          "#6366f1",
  "Bug":               "#ef4444",
  "Bug (Experimental)":"#f97316",
  "Subtarefa":         "#94a3b8",
  "Incident":          "#9333ea",
  "Débito Técnico":    "#8b5cf6",
  "Spike":             "#06b6d4",
  "Melhoria":          "#10b981",
};

export const RISK_COLORS = { critical: "#dc2626", medium: "#d97706", low: "#16a34a" };
export const RISK_LABELS = { critical: "Crítica",  medium: "Média",   low: "Baixa"  };

// ── CT (test case) status ──────────────────────────────────────────────────────

export const CT_STATUS_COLORS = {
  nao_iniciado: "#94a3b8",
  em_andamento: "#3b82f6",
  bloqueado:    "#f59e0b",
  falhado:      "#dc2626",
  aprovado:     "#16a34a",
  cancelado:    "#6b7280",
  skipped:      "#8b5cf6",
  retest:       "#f97316",
};

export const CT_STATUS_LABELS = {
  nao_iniciado: "Não Iniciado",
  em_andamento: "Em Andamento",
  bloqueado:    "Bloqueado",
  falhado:      "Falhado",
  aprovado:     "Aprovado",
  cancelado:    "Cancelado",
  skipped:      "Skipped",
  retest:       "Retest",
};

// Display order in lists/dropdowns
export const CT_STATUS_ORDER = [
  "nao_iniciado","em_andamento","bloqueado","falhado",
  "aprovado","cancelado","skipped","retest",
];

// Order for stacked progress bars (done → not started)
export const CT_BAR_ORDER = [
  "aprovado","cancelado","skipped","retest",
  "falhado","bloqueado","em_andamento","nao_iniciado",
];

export const CT_FINAL_STATUSES = new Set(["aprovado", "cancelado", "skipped"]);

export const CT_STATUS_DESC = {
  nao_iniciado: "Cenário mapeado, aguardando execução",
  em_andamento: "Sendo executado agora",
  bloqueado:    "Impedimento externo (bug, ambiente, dependência)",
  falhado:      "Executado e encontrou divergência",
  aprovado:     "Executado com sucesso ✅",
  cancelado:    "Descontinuado, fora de escopo",
  skipped:      "Pulado intencionalmente (ex: fora do sprint)",
  retest:       "Falhou, bug corrigido, aguarda nova execução",
};

export const CT_STATUS_TRANSITIONS = {
  nao_iniciado: ["em_andamento", "skipped", "cancelado"],
  em_andamento: ["aprovado", "falhado", "bloqueado", "skipped", "cancelado"],
  bloqueado:    ["em_andamento", "retest", "cancelado"],
  falhado:      ["retest", "cancelado"],
  retest:       ["em_andamento", "aprovado", "falhado"],
  skipped:      ["nao_iniciado", "cancelado"],
  aprovado:     ["nao_iniciado"],
  cancelado:    ["nao_iniciado"],
};

// ── Sort-order maps ────────────────────────────────────────────────────────────

export const TYPE_ORDER = {
  "História": 0, "Subtarefa": 1,
  "Bug": 2, "Bug (Experimental)": 3, "Incident": 4,
  "Melhoria": 5, "Débito Técnico": 6, "Spike": 7,
};

export const STATUS_SORT_ORDER = {
  "não iniciado": 0,
  "pronto p/planning": 1,
  "discovery": 2,
  "design solution": 3,
  "em andamento": 4,
  "revisão de pares": 5,
  "pronto p/qa": 6,
  "pronto p/validação negócio": 7,
  "em validação negócio": 8,
  "coe funcional": 9,
  "release orquestrado": 10,
  "pronto p/produção": 11,
  "finalizado": 12,
  "cancelada": 13,
  "reaberto": 14,
};

export const PRIORITY_SORT_ORDER = {
  "crítica": 0, "critica": 0,
  "muito alto": 1,
  "alta": 2,
  "média": 3, "media": 3,
  "baixa": 4,
  "sem prioridade": 5,
};

// ── Display name overrides (used by fmt()) ─────────────────────────────────────

export const FMT_MAP = {
  "pronto p/qa":              "Pronto p/ QA",
  "pronto p/produção":        "Pronto p/ produção",
  "em validação negócio":     "Em validação de negócio",
  "validação pré qa":         "Validação pré QA",
  "incident":                 "Incidente",
  "em teste integrado":       "Em teste integrado",
};

// ── localStorage keys ─────────────────────────────────────────────────────────

export const LS_CT_LINKS    = "qahub_ct_links";
export const LS_CT_COMMENTS = "qahub_ct_comments";
