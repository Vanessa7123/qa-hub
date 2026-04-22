// Chart renderers, chart filters, side panel, CT modal, risk chart/panel.

import { state } from './state.js';
import {
  JIRA_BASE_URL,
  STATUS_COLORS, TYPE_COLORS,
  CT_STATUS_COLORS, CT_STATUS_LABELS, CT_STATUS_ORDER,
  RISK_COLORS, RISK_LABELS,
  TYPE_ORDER, STATUS_SORT_ORDER, PRIORITY_SORT_ORDER,
} from './config.js';
import { $, cc, fmt, jiraLink, statusPill, typePill, priorityPill } from './utils.js';

// ── CT Modal constants ─────────────────────────────────────────────────────────

const CRIT_LABEL  = { critical: 'Alta', medium: 'Média', low: 'Baixa' };
const CRIT_CLASS  = { critical: 'ct-badge-critical', medium: 'ct-badge-medium', low: 'ct-badge-low' };

// ── CT Modal ──────────────────────────────────────────────────────────────────

export function openCtModal() {
  const ps = (state.sprintData || {}).planning_subtasks || [];
  if (!ps.length) return;
  const total = ps.reduce((s, p) => s + p.ct_count, 0);
  $("ctModalTitle").textContent = `Casos de Teste — ${total} CTs`;

  $("ctModalBody").innerHTML = ps.map(p => {
    if (!p.cts || !p.cts.length) return '';
    const storyLink   = p.story_key
      ? `<a class="ct-story-link" href="${JIRA_BASE_URL}${p.story_key}" target="_blank">${p.story_key}</a>`
      : '';
    const subtaskLink = `<a class="ct-story-link" href="${JIRA_BASE_URL}${p.key}" target="_blank" title="Abrir subtarefa">[QA]↗</a>`;
    const catMap = {};
    const categories = [];
    for (const ct of p.cts) {
      const cat = ct.category || 'Sem categoria';
      if (!catMap[cat]) { catMap[cat] = []; categories.push(cat); }
      catMap[cat].push(ct);
    }
    const ctHtml = categories.map(cat => `
      <div class="ct-category">${cat}</div>
      ${catMap[cat].map(ct => `
        <div class="ct-item">
          <span class="ct-badge ${CRIT_CLASS[ct.criticality] || CRIT_CLASS.unknown}">${CRIT_LABEL[ct.criticality] || '—'}</span>
          <span class="ct-id">${ct.id}</span>
          <span class="ct-text">${ct.summary}</span>
        </div>`).join('')}`).join('');
    return `<div class="ct-story-block">
      <div class="ct-story-header">
        ${storyLink}
        <span class="ct-story-title">${p.story_summary || ''}</span>
        ${subtaskLink}
      </div>
      ${ctHtml}
    </div>`;
  }).join('');

  $("ctModalFooter").textContent = `${ps.length} subtarefa(s) de planejamento · ${total} casos de teste`;
  $("ctModal").style.display = "flex";
}
export function closeCtModal() { $("ctModal").style.display = "none"; }
export function onCtModalBackdropClick(e) { if (e.target === $("ctModal")) closeCtModal(); }

// ── Chart filters ─────────────────────────────────────────────────────────────

const MS_BTN_BASE = { csStatusBtn:"Tipo", csTypeBtn:"Status", csAssigneeBtn:"Responsável", ctTypeBtn:"Tipo" };

export function countByKey(issues, field) {
  return issues.reduce((acc, i) => { acc[i[field]] = (acc[i[field]] || 0) + 1; return acc; }, {});
}

export function getStatusChartIssues() {
  if (!state.sprintData) return [];
  let issues = state.sprintData._issues;
  if (!state.csAllSelected) {
    issues = state.csStatusFilter.size > 0
      ? issues.filter(i => state.csStatusFilter.has(i.type))
      : [];
  }
  if (!state.csTypeAllSelected) {
    issues = state.csTypeFilter.size > 0
      ? issues.filter(i => state.csTypeFilter.has(i.status))
      : [];
  }
  if (!state.csAssigneeAllSelected) {
    issues = state.csAssigneeFilter.size > 0
      ? issues.filter(i => state.csAssigneeFilter.has(i.assignee))
      : [];
  }
  return issues;
}

export function getTypeChartIssues() {
  if (!state.sprintData) return [];
  let issues = state.sprintData._issues;
  if (state.ctTypeFilter.size > 0) issues = issues.filter(i => state.ctTypeFilter.has(i.type));
  return issues;
}

export function toggleMs(id) {
  const drop   = $(id + "Drop");
  const isOpen = drop.style.display !== "none";
  document.querySelectorAll(".ms-dropdown").forEach(d => d.style.display = "none");
  if (!isOpen) drop.style.display = "block";
}
document.addEventListener("click", e => {
  if (!e.target.closest(".ms-wrap"))
    document.querySelectorAll(".ms-dropdown").forEach(d => d.style.display = "none");
});

function syncBtn(btnId, filterSet) {
  const btn  = $(btnId);
  const base = MS_BTN_BASE[btnId] || "Filtrar";
  btn.classList.toggle("has-filter", filterSet.size > 0);
  btn.textContent = filterSet.size > 0 ? `${base} (${filterSet.size}) ▾` : `${base} ▾`;
}

export function selectAllCsStatus() {
  state.csAllSelected = true; state.csStatusFilter.clear(); applyStatusChange();
}
export function deselectAllCsStatus() {
  state.csAllSelected = false; state.csStatusFilter.clear(); applyStatusChange();
}
export function onCsStatusAllChange(checked) {
  if (checked) selectAllCsStatus(); else deselectAllCsStatus();
}

export function selectAllCsType() {
  state.csHighlightedStatus = null; state.csTypeAllSelected = true;
  state.csTypeFilter.clear(); rebuildCsOpts(); refreshStatusChart();
}
export function deselectAllCsType() {
  state.csHighlightedStatus = null; state.csTypeAllSelected = false;
  state.csTypeFilter.clear(); rebuildCsOpts(); refreshStatusChart();
}
export function onCsTypeAllChange(checked) {
  if (checked) selectAllCsType(); else deselectAllCsType();
}

function applyStatusChange() {
  state.csHighlightedStatus = null; rebuildCsOpts(); refreshStatusChart();
}

export function onCsStatusChange(key, checked) {
  const contextTypes = (!state.csTypeAllSelected && state.csTypeFilter.size > 0)
    ? [...new Set(state.sprintData._issues.filter(i => state.csTypeFilter.has(i.status)).map(i => i.type))]
    : [...new Set(state.sprintData._issues.map(i => i.type))];
  const allKnownTypes = [...new Set([...Object.keys(TYPE_COLORS), ...contextTypes])];
  if (checked) {
    if (!state.csAllSelected) {
      state.csStatusFilter.add(key);
      if (contextTypes.every(s => state.csStatusFilter.has(s))) {
        state.csAllSelected = true; state.csStatusFilter.clear();
      }
    }
  } else {
    if (state.csAllSelected) {
      state.csStatusFilter = new Set(allKnownTypes.filter(s => s !== key));
      state.csAllSelected = false;
    } else {
      state.csStatusFilter.delete(key);
    }
  }
  applyStatusChange();
}

export function onCsTypeChange(key, checked) {
  state.csHighlightedStatus = null;
  const contextStatuses = (!state.csAllSelected && state.csStatusFilter.size > 0)
    ? [...new Set(state.sprintData._issues.filter(i => state.csStatusFilter.has(i.type)).map(i => i.status))]
    : [...new Set(state.sprintData._issues.map(i => i.status))];
  const allKnownStatuses = [...new Set([...Object.keys(STATUS_COLORS), ...contextStatuses])];
  if (checked) {
    if (!state.csTypeAllSelected) {
      state.csTypeFilter.add(key);
      if (contextStatuses.every(s => state.csTypeFilter.has(s))) {
        state.csTypeAllSelected = true; state.csTypeFilter.clear();
      }
    }
  } else {
    if (state.csTypeAllSelected) {
      state.csTypeFilter = new Set(allKnownStatuses.filter(s => s !== key));
      state.csTypeAllSelected = false;
    } else {
      state.csTypeFilter.delete(key);
    }
  }
  rebuildCsOpts(); refreshStatusChart();
}

export function onCsAssigneeAllChange(checked) {
  if (checked) { state.csAssigneeAllSelected = true; state.csAssigneeFilter.clear(); }
  else { state.csAssigneeAllSelected = false; state.csAssigneeFilter = new Set(state.sprintData._issues.map(i => i.assignee)); }
  rebuildCsOpts(); refreshStatusChart();
}
export function onCsAssigneeChange(key, checked) {
  const all = [...new Set(state.sprintData._issues.map(i => i.assignee))];
  if (checked) {
    if (!state.csAssigneeAllSelected) {
      state.csAssigneeFilter.add(key);
      if (all.every(a => state.csAssigneeFilter.has(a))) { state.csAssigneeAllSelected = true; state.csAssigneeFilter.clear(); }
    }
  } else {
    if (state.csAssigneeAllSelected) {
      state.csAssigneeFilter = new Set(all.filter(a => a !== key));
      state.csAssigneeAllSelected = false;
    } else { state.csAssigneeFilter.delete(key); }
  }
  rebuildCsOpts(); refreshStatusChart();
}
export function deselectAllCsAssignee() {
  state.csAssigneeAllSelected = false; state.csAssigneeFilter.clear();
  rebuildCsOpts(); refreshStatusChart();
}
export function clearCsFilter(kind) {
  if (kind === "status") selectAllCsStatus(); else selectAllCsType();
}

export function onCtTypeChange(key, checked) {
  if (checked) state.ctTypeFilter.add(key); else state.ctTypeFilter.delete(key);
  syncBtn("ctTypeBtn", state.ctTypeFilter);
  refreshTypeChart();
}
export function clearCtFilter() { state.ctTypeFilter.clear(); rebuildCtOpts(); refreshTypeChart(); }

export function rebuildCsOpts() {
  const typeContext   = (!state.csTypeAllSelected && state.csTypeFilter.size > 0)
    ? state.sprintData._issues.filter(i => state.csTypeFilter.has(i.status))
    : state.sprintData._issues;
  const allTypes      = [...new Set([...Object.keys(TYPE_COLORS), ...typeContext.map(i => i.type)])];
  const statusContext = (!state.csAllSelected && state.csStatusFilter.size > 0)
    ? state.sprintData._issues.filter(i => state.csStatusFilter.has(i.type))
    : state.sprintData._issues;
  const allStatuses   = [...new Set([...Object.keys(STATUS_COLORS), ...statusContext.map(i => i.status)])];

  const typeCntMap   = countByKey(state.sprintData._issues, "type");
  const statusCntMap = countByKey(state.sprintData._issues, "status");

  function sortedWithDivider(keys, orderMap, cntMap) {
    const rank        = k => orderMap[k] ?? orderMap[k.toLowerCase()] ?? 99;
    const withData    = keys.filter(k => (cntMap[k] || 0) > 0).sort((a, b) => rank(a) - rank(b));
    const withoutData = keys.filter(k => (cntMap[k] || 0) === 0).sort((a, b) => rank(a) - rank(b));
    return { withData, withoutData };
  }

  function typeOptionHtml(k, checked, cnt) {
    const color = cc(TYPE_COLORS, k);
    const safeK = k.replace(/\\/g,"\\\\").replace(/'/g,"\\'");
    const dim   = cnt === 0 ? "opacity:0.45;" : "";
    return `<label class="ms-option ms-option-sub" style="${dim}">
      <input type="checkbox" ${checked ? "checked" : ""} onchange="onCsStatusChange('${safeK}',this.checked)">
      <span class="dot" style="background:${color}"></span>
      <span style="flex:1">${fmt(k)}</span>
      <span style="font-size:11px;color:#94a3b8;margin-left:4px">${cnt}</span>
    </label>`;
  }
  function statusOptionHtml(k, checked, cnt) {
    const color = cc(STATUS_COLORS, k);
    const safeK = k.replace(/\\/g,"\\\\").replace(/'/g,"\\'");
    const dim   = cnt === 0 ? "opacity:0.45;" : "";
    return `<label class="ms-option ms-option-sub" style="${dim}">
      <input type="checkbox" ${checked ? "checked" : ""} onchange="onCsTypeChange('${safeK}',this.checked)">
      <span class="dot" style="background:${color}"></span>
      <span style="flex:1">${fmt(k)}</span>
      <span style="font-size:11px;color:#94a3b8;margin-left:4px">${cnt}</span>
    </label>`;
  }

  const divider = `<div style="border-top:1px solid #e2e8f0;margin:4px 0"></div>`;
  const { withData: typesWithData, withoutData: typesEmpty }     = sortedWithDivider(allTypes, TYPE_ORDER, typeCntMap);
  const { withData: statusesWithData, withoutData: statusesEmpty } = sortedWithDivider(allStatuses, STATUS_SORT_ORDER, statusCntMap);

  $("csStatusOptions").innerHTML =
    `<label class="ms-option ms-option-todos">
      <input type="checkbox" ${state.csAllSelected ? "checked" : ""} onchange="onCsStatusAllChange(this.checked)">
      <span style="flex:1">Todos</span>
    </label>` +
    typesWithData.map(k => typeOptionHtml(k, state.csAllSelected || state.csStatusFilter.has(k), typeCntMap[k] || 0)).join("") +
    (typesEmpty.length ? divider + typesEmpty.map(k => typeOptionHtml(k, state.csAllSelected || state.csStatusFilter.has(k), 0)).join("") : "");

  $("csTypeOptions").innerHTML =
    `<label class="ms-option ms-option-todos">
      <input type="checkbox" ${state.csTypeAllSelected ? "checked" : ""} onchange="onCsTypeAllChange(this.checked)">
      <span style="flex:1">Todos</span>
    </label>` +
    statusesWithData.map(k => statusOptionHtml(k, state.csTypeAllSelected || state.csTypeFilter.has(k), statusCntMap[k] || 0)).join("") +
    (statusesEmpty.length ? divider + statusesEmpty.map(k => statusOptionHtml(k, state.csTypeAllSelected || state.csTypeFilter.has(k), 0)).join("") : "");

  // Tipo button label
  const tipoBtn = $("csStatusBtn");
  if (state.csAllSelected) { tipoBtn.classList.remove("has-filter"); tipoBtn.textContent = "Tipo ▾"; }
  else if (state.csStatusFilter.size === 0) { tipoBtn.classList.add("has-filter"); tipoBtn.textContent = "Tipo (0) ▾"; }
  else syncBtn("csStatusBtn", state.csStatusFilter);

  // Status button label
  const statusBtn = $("csTypeBtn");
  if (state.csTypeAllSelected) { statusBtn.classList.remove("has-filter"); statusBtn.textContent = "Status ▾"; }
  else if (state.csTypeFilter.size === 0) { statusBtn.classList.add("has-filter"); statusBtn.textContent = "Status (0) ▾"; }
  else syncBtn("csTypeBtn", state.csTypeFilter);

  // Assignee dropdown
  const assignees      = [...new Set(state.sprintData._issues.map(i => i.assignee))].sort((a, b) => a.localeCompare(b, "pt"));
  const assigneeCntMap = countByKey(state.sprintData._issues, "assignee");
  $("csAssigneeOptions").innerHTML =
    `<label class="ms-option ms-option-todos">
      <input type="checkbox" ${state.csAssigneeAllSelected ? "checked" : ""} onchange="onCsAssigneeAllChange(this.checked)">
      <span style="flex:1">Todos</span>
    </label>` +
    assignees.map(k => {
      const safeK   = k.replace(/\\/g,"\\\\").replace(/'/g,"\\'");
      const checked = state.csAssigneeAllSelected || state.csAssigneeFilter.has(k);
      const cnt     = assigneeCntMap[k] || 0;
      return `<label class="ms-option ms-option-sub">
        <input type="checkbox" ${checked ? "checked" : ""} onchange="onCsAssigneeChange('${safeK}',this.checked)">
        <span style="flex:1">${k}</span>
        <span style="font-size:11px;color:#94a3b8;margin-left:4px">${cnt}</span>
      </label>`;
    }).join("");

  const assigneeBtn = $("csAssigneeBtn");
  if (state.csAssigneeAllSelected) { assigneeBtn.classList.remove("has-filter"); assigneeBtn.textContent = "Responsável ▾"; }
  else if (state.csAssigneeFilter.size === 0) { assigneeBtn.classList.add("has-filter"); assigneeBtn.textContent = "Responsável (0) ▾"; }
  else { assigneeBtn.classList.add("has-filter"); assigneeBtn.textContent = `Responsável (${state.csAssigneeFilter.size}) ▾`; }
}

export function rebuildCtOpts() {
  if (!$("ctTypeOptions")) return;
  const types = [...new Set(state.sprintData._issues.map(i => i.type))];
  $("ctTypeOptions").innerHTML = types.map(k => {
    const color   = cc(TYPE_COLORS, k);
    const safeKey = k.replace(/\\/g,"\\\\").replace(/'/g,"\\'");
    return `<label class="ms-option">
      <input type="checkbox" ${state.ctTypeFilter.has(k)?"checked":""} onchange="onCtTypeChange('${safeKey}',this.checked)">
      <span class="dot" style="background:${color}"></span>
      <span style="flex:1">${k}</span>
    </label>`;
  }).join("");
  syncBtn("ctTypeBtn", state.ctTypeFilter);
}

export function refreshStatusChart() {
  const issues     = getStatusChartIssues();
  const singleType = !state.csAllSelected && state.csStatusFilter.size === 1 ? [...state.csStatusFilter][0] : null;
  if (singleType) renderStatusChart(countByKey(issues, "status"), issues, "status");
  else            renderStatusChart(countByKey(issues, "type"),   issues, "type");
  renderCsFilterTags();
  showAllInSidePanel();
}
export function refreshTypeChart() {
  const issues = getTypeChartIssues();
  renderTypeChart(countByKey(issues, "type"), issues);
  renderCtFilterTags();
}

// ── Filter tag renderers ──────────────────────────────────────────────────────

export function buildTagsHtml(filterSet, colorMap, removeFn) {
  if (filterSet.size === 0) return '<span class="ftag ftag-all">Todos</span>';
  return [...filterSet].map(k => {
    const c    = cc(colorMap, k);
    const safe = k.replace(/\\/g,"\\\\").replace(/'/g,"\\'");
    return `<span class="ftag" style="background:${c}22;color:${c}">
      <span class="ftag-dot" style="background:${c}"></span>${fmt(k)}
      <span class="ftag-x" onclick="${removeFn}('${safe}')">×</span>
    </span>`;
  }).join("");
}

function buildInfoTagsHtml(counts, colorMap) {
  const keys = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
  if (!keys.length) return '<span class="ftag ftag-all">—</span>';
  return keys.map(k => {
    const c = cc(colorMap, k);
    return `<span class="ftag" style="background:${c}22;color:${c}">
      <span class="ftag-dot" style="background:${c}"></span>${k}&nbsp;<strong>${counts[k]}</strong>
    </span>`;
  }).join("");
}

export function renderCsFilterTags() {
  const el = $("csFilterTags");
  if (!el) return;
  let typeHtml;
  if (state.csAllSelected) {
    typeHtml = '<span class="ftag ftag-all">Todos</span>';
  } else if (state.csStatusFilter.size > 0) {
    typeHtml = buildTagsHtml(state.csStatusFilter, TYPE_COLORS, "removeCsStatusTag");
  } else {
    typeHtml = '<span class="ftag" style="background:#fee2e2;color:#dc2626;border-color:#fecaca">Nenhum selecionado</span>';
  }
  let statusHtml;
  if (state.csTypeAllSelected) {
    statusHtml = '<span class="ftag ftag-all">Todos</span>';
  } else if (state.csTypeFilter.size > 0) {
    statusHtml = buildTagsHtml(state.csTypeFilter, STATUS_COLORS, "removeCsTypeTag");
  } else {
    statusHtml = '<span class="ftag" style="background:#fee2e2;color:#dc2626;border-color:#fecaca">Nenhum selecionado</span>';
  }
  el.innerHTML =
    `<div class="ftag-group"><span class="ftag-group-label">Tipo:</span>${typeHtml}</div>` +
    `<div class="ftag-group"><span class="ftag-group-label">Status:</span>${statusHtml}</div>`;
}
export function renderCtFilterTags() {
  const el = $("ctFilterTags");
  if (!el) return;
  el.innerHTML = `<div class="ftag-group"><span class="ftag-group-label">Tipo:</span>${buildTagsHtml(state.ctTypeFilter, TYPE_COLORS, "removeCtTypeTag")}</div>`;
}
export function removeCsStatusTag(key) {
  state.csStatusFilter.delete(key);
  if (state.csStatusFilter.size === 0) state.csAllSelected = true;
  applyStatusChange();
}
export function removeCsTypeTag(key) {
  state.csTypeFilter.delete(key);
  if (state.csTypeFilter.size === 0) state.csTypeAllSelected = true;
  rebuildCsOpts(); refreshStatusChart();
}
export function removeCtTypeTag(key) { state.ctTypeFilter.delete(key); rebuildCtOpts(); refreshTypeChart(); }

export function initChartFilters() {
  state.csAllSelected       = true;  state.csStatusFilter.clear();
  state.csTypeAllSelected   = true;  state.csTypeFilter.clear();
  state.csAssigneeAllSelected = true; state.csAssigneeFilter.clear();
  state.ctTypeFilter.clear();
  rebuildCsOpts();
  rebuildCtOpts();
  refreshStatusChart();
  refreshTypeChart();
}

// ── Side panel ────────────────────────────────────────────────────────────────

export function showAllInSidePanel() {
  const baseIssues = getStatusChartIssues();
  state.sidePanelIssues = state.csHighlightedStatus
    ? baseIssues.filter(i => i.status === state.csHighlightedStatus)
    : baseIssues;
  const total = state.sidePanelIssues.length;

  const selectedType = state.csStatusFilter.size === 1 ? [...state.csStatusFilter][0] : null;
  const typeLabel = selectedType
    ? (state.csHighlightedStatus ? `${fmt(selectedType)} · ${fmt(state.csHighlightedStatus)} (${total})` : `${fmt(selectedType)} (${total})`)
    : state.csStatusFilter.size > 1
      ? `${state.csStatusFilter.size} tipos selecionados (${total})`
      : `Todas as issues (${total})`;
  $("sidePanelTitle").textContent = typeLabel;
  $("statusSidePanel").style.display   = "block";
  $("sidePanelDeselBtn").style.display = state.csStatusFilter.size > 0 ? "flex" : "none";

  const summaryEl = $("sidePanelSummary");
  if (total > 0) {
    const statusCounts = countByKey(state.sidePanelIssues, "status");
    const chips = Object.keys(statusCounts)
      .sort((a, b) => (STATUS_SORT_ORDER[a.toLowerCase()]??99) - (STATUS_SORT_ORDER[b.toLowerCase()]??99))
      .map(s => {
        const c = cc(STATUS_COLORS, s);
        return `<span class="sp-summary-chip" style="background:${c}22;color:${c}">
          <span style="width:7px;height:7px;border-radius:50%;background:${c};display:inline-block;flex-shrink:0"></span>
          ${fmt(s)} <strong>${statusCounts[s]}</strong>
        </span>`;
      }).join("");
    summaryEl.innerHTML  = chips;
    summaryEl.style.display = "flex";
  } else {
    summaryEl.style.display = "none";
  }
  renderSidePanel();
}

function updateScrollFade() {
  const listEl = $("sidePanelList");
  const wrapEl = $("spListWrap");
  if (!listEl || !wrapEl) return;
  const atBottom = listEl.scrollHeight - listEl.scrollTop <= listEl.clientHeight + 4;
  wrapEl.classList.toggle("has-more", listEl.scrollHeight > listEl.clientHeight && !atBottom);
}

export function copyIssueKeys() {
  const COPY_PRIORITY_COLORS = {
    "blocker":"#dc2626","crítica":"#dc2626","critica":"#dc2626",
    "alta":"#ea580c","high":"#ea580c",
    "média":"#a16207","media":"#a16207","medium":"#a16207",
    "baixa":"#16a34a","low":"#16a34a",
  };
  const COPY_PRIORITY_BG = {
    "blocker":"#fee2e2","crítica":"#fee2e2","critica":"#fee2e2",
    "alta":"#ffedd5","high":"#ffedd5",
    "média":"#fef9c3","media":"#fef9c3","medium":"#fef9c3",
    "baixa":"#dcfce7","low":"#dcfce7",
  };
  function pill(text, bg, color) {
    return `<span style="display:inline-block;padding:2px 9px;border-radius:999px;font-size:11px;font-weight:700;background:${bg};color:${color};white-space:nowrap">${text}</span>`;
  }
  function statusPillHtml(s) { const c = cc(STATUS_COLORS, s, "#64748b"); return pill(fmt(s), c + "22", c); }
  function typePillHtml(t)   { const c = cc(TYPE_COLORS, t, "#64748b");   return pill(fmt(t), c + "22", c); }
  function priorityPillHtml(p) {
    const key = (p || "").toLowerCase();
    const c   = COPY_PRIORITY_COLORS[key] || "#64748b";
    const bg  = COPY_PRIORITY_BG[key]     || "#f1f5f9";
    return pill(p || "—", bg, c);
  }

  const cols    = ["Tipo", "Chave", "Título", "Status", "Prioridade", "Responsável"];
  const tStyle  = "border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px;min-width:600px";
  const thStyle = "padding:9px 14px;background:#6366f1;color:#fff;font-weight:700;text-align:left;white-space:nowrap;font-size:12px;letter-spacing:.3px";
  const tdBase  = "padding:8px 14px;border-bottom:1px solid #f1f5f9;vertical-align:middle";
  const linkStyle = "color:#6366f1;text-decoration:none;font-weight:700;font-size:12px";

  const header = `<tr>${cols.map(c => `<th style="${thStyle}">${c}</th>`).join("")}</tr>`;
  const body   = state.sidePanelIssues.map((i, idx) => {
    const bg = idx % 2 === 1 ? "background:#f8fafc;" : "background:#fff;";
    const td = s => `<td style="${tdBase};${bg}">${s}</td>`;
    const link = `<a href="${JIRA_BASE_URL}${i.key}" style="${linkStyle}">${i.key}</a>`;
    return `<tr>
      ${td(typePillHtml(i.type))}${td(link)}
      ${td(`<span style="font-size:13px;color:#1e293b">${i.summary}</span>`)}
      ${td(statusPillHtml(i.status))}${td(priorityPillHtml(i.priority))}
      ${td(`<span style="color:#64748b;font-size:12px">${i.assignee}</span>`)}
    </tr>`;
  }).join("");

  const html = `<table style="${tStyle}"><thead>${header}</thead><tbody>${body}</tbody></table>`;
  const tsv  = [cols, ...state.sidePanelIssues.map(i =>
    [i.type, i.key, i.summary, i.status, i.priority||"—", i.assignee]
  )].map(r => r.join("\t")).join("\n");

  const item = new ClipboardItem({
    "text/html":  new Blob([html], { type: "text/html" }),
    "text/plain": new Blob([tsv],  { type: "text/plain" }),
  });
  navigator.clipboard.write([item]).then(() => {
    const btn = $("copyKeysBtn");
    btn.textContent = "✓ Copiado!";
    btn.classList.add("copied");
    setTimeout(() => { btn.textContent = "⎘ Copiar tabela"; btn.classList.remove("copied"); }, 2000);
  });
}

export function selectTypeAndStatus(type, status) {
  state.csAllSelected = false;
  state.csStatusFilter = new Set([type]);
  state.csHighlightedStatus = status;
  rebuildCsOpts(); refreshStatusChart();
}

export function selectDrillDownStatus(status) {
  state.csHighlightedStatus = state.csHighlightedStatus === status ? null : status;
  const issues = getStatusChartIssues();
  renderStatusChart(countByKey(issues, "status"), issues, "status");
  renderCsFilterTags();
  showAllInSidePanel();
}

export function selectStatusSegment(type) {
  state.csHighlightedStatus = null;
  if (!state.csAllSelected && state.csStatusFilter.size === 1 && state.csStatusFilter.has(type)) {
    state.csAllSelected = true; state.csStatusFilter.clear();
  } else {
    state.csAllSelected = false; state.csStatusFilter = new Set([type]);
  }
  applyStatusChange();
}

export function closeSidePanel() { clearCsFilter("status"); }

export function setSidePanelSort(col) {
  if (state.sidePanelSort.col === col) {
    if (state.sidePanelSort.dir === "asc") state.sidePanelSort.dir = "desc";
    else state.sidePanelSort = { col: null, dir: null };
  } else {
    state.sidePanelSort = { col, dir: "asc" };
    state.sidePanelSortCache = null;
  }
  renderSidePanel();
}

function applySortOrder(list, col, dir) {
  if (!col || !dir) return list;
  return [...list].sort((a, b) => {
    let va, vb;
    if (col === "priority") {
      va = PRIORITY_SORT_ORDER[(a.priority||"").toLowerCase()] ?? 99;
      vb = PRIORITY_SORT_ORDER[(b.priority||"").toLowerCase()] ?? 99;
      return dir === "asc" ? va - vb : vb - va;
    } else if (col === "status") {
      va = STATUS_SORT_ORDER[(a.status||"").toLowerCase()] ?? 99;
      vb = STATUS_SORT_ORDER[(b.status||"").toLowerCase()] ?? 99;
      return dir === "asc" ? va - vb : vb - va;
    } else if (col === "days_open") {
      va = a.days_open ?? -1; vb = b.days_open ?? -1;
      return dir === "asc" ? va - vb : vb - va;
    } else {
      va = (a[col]||"").toLowerCase(); vb = (b[col]||"").toLowerCase();
      return dir === "asc" ? va.localeCompare(vb,"pt") : vb.localeCompare(va,"pt");
    }
  });
}
export { applySortOrder };

export function renderSidePanel() {
  const { col, dir } = state.sidePanelSort;
  let sorted;
  if (col && dir) {
    sorted = applySortOrder(state.sidePanelIssues, col, dir);
    state.sidePanelSortCache = sorted.map(i => i.key);
  } else if (state.sidePanelSortCache) {
    const order = new Map(state.sidePanelSortCache.map((k, i) => [k, i]));
    sorted = [...state.sidePanelIssues].sort((a, b) => (order.get(a.key)??999) - (order.get(b.key)??999));
  } else {
    sorted = state.sidePanelIssues;
  }
  const total = sorted.length;
  const si = (c) => {
    const active = col === c && dir;
    const icon   = active ? (dir === "asc" ? "↑" : "↓") : "↕";
    return `<span class="sort-icon${active ? " active" : ""}">${icon}</span>`;
  };
  $("sidePanelList").innerHTML = sorted.length
    ? `<table>
          <colgroup>
            <col class="col-type"><col class="col-key"><col class="col-title">
            <col class="col-status"><col class="col-priority"><col class="col-assignee">
          </colgroup>
          <thead><tr>
            <th class="sp-sort-th" onclick="setSidePanelSort('type')">Tipo${si("type")}</th>
            <th class="sp-sort-th" onclick="setSidePanelSort('key')">Chave${si("key")}</th>
            <th class="sp-sort-th" onclick="setSidePanelSort('summary')">Título${si("summary")}</th>
            <th class="sp-sort-th" onclick="setSidePanelSort('status')">Status${si("status")}</th>
            <th class="sp-sort-th" onclick="setSidePanelSort('priority')">Prioridade${si("priority")}</th>
            <th class="sp-sort-th" onclick="setSidePanelSort('assignee')">Responsável${si("assignee")}</th>
          </tr></thead>
          <tbody>${sorted.map(i => `<tr>
            <td>${typePill(i.type)}</td>
            <td>${jiraLink(i.key, JIRA_BASE_URL)}</td>
            <td class="truncate" title="${i.summary}">${i.summary}</td>
            <td>${statusPill(i.status)}</td>
            <td>${priorityPill(i.priority || "—")}</td>
            <td class="truncate" style="color:#64748b;font-size:12px" title="${i.assignee}">${i.assignee}</td>
          </tr>`).join("")}</tbody>
        </table>`
    : `<div class="empty">Nenhuma issue encontrada.</div>`;

  $("spListCount").textContent = `Exibindo ${total} de ${state.sprintData._issues.length}`;
  const listEl = $("sidePanelList");
  listEl.onscroll = updateScrollFade;
  requestAnimationFrame(updateScrollFade);
}

export function openTypeModal(type) {
  const issues = getTypeChartIssues().filter(i => i.type === type);
  openModal("Tipo: " + type, issues);
}

// ── Chart center-text plugin ──────────────────────────────────────────────────

export function makeCenterPlugin(mainVal, subLabel) {
  return {
    id: "centerText",
    afterDatasetsDraw(chart) {
      const { ctx, chartArea: { left, right, top, bottom } } = chart;
      const cx = (left + right) / 2, cy = (top + bottom) / 2;
      ctx.save();
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillStyle = "#0f172a"; ctx.font = "bold 30px Inter, ui-sans-serif, sans-serif";
      ctx.fillText(mainVal, cx, cy - 11);
      ctx.fillStyle = "#94a3b8"; ctx.font = "12px Inter, ui-sans-serif, sans-serif";
      ctx.fillText(subLabel, cx, cy + 13);
      ctx.restore();
    }
  };
}

// ── Status chart ──────────────────────────────────────────────────────────────

export function renderStatusChart(counts, filteredIssues, mode) {
  const issues       = filteredIssues || state.sprintData._issues;
  const isStatusMode = mode === "status";
  const selectedType = isStatusMode ? [...state.csStatusFilter][0] : null;
  const keys         = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
  const colors       = keys.map(k => {
    const base = isStatusMode ? cc(STATUS_COLORS, k) : cc(TYPE_COLORS, k);
    if (isStatusMode && state.csHighlightedStatus && k !== state.csHighlightedStatus) return base + "40";
    return base;
  });

  const titleEl = $("statusChartTitle");
  if (titleEl) titleEl.textContent = isStatusMode ? `Status em: ${fmt(selectedType)}` : "Distribuição por Tipo";

  const filteredTotal = keys.reduce((s, k) => s + counts[k], 0);
  const grandTotal    = state.sprintData._issues.length;
  const centerSub     = isStatusMode
    ? `de ${grandTotal}`
    : (!state.csAllSelected || state.csTypeFilter.size > 0 ? `de ${grandTotal}` : "issues");

  if (state.charts["statusChart"]) state.charts["statusChart"].destroy();
  state.charts["statusChart"] = new Chart($("statusChart"), {
    type: "doughnut",
    data: { labels: keys.map(fmt), datasets: [{ data: keys.map(k => counts[k]), backgroundColor: colors, borderWidth: 2, borderColor: "#fff" }] },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: "65%",
      plugins: { legend: { display: false } },
      onClick(evt) {
        const pts = state.charts["statusChart"].getElementsAtEventForMode(evt, "nearest", { intersect: true }, false);
        if (!pts.length) return;
        if (isStatusMode) selectDrillDownStatus(keys[pts[0].index]);
        else selectStatusSegment(keys[pts[0].index]);
      },
      onHover(evt) { evt.native.target.style.cursor = "pointer"; },
    },
    plugins: [makeCenterPlugin(String(filteredTotal), centerSub)],
  });

  const typeCounts     = countByKey(issues, "type");
  const allKnownTypes  = [...new Set([...Object.keys(TYPE_COLORS), ...Object.keys(countByKey(state.sprintData._issues, "type"))])];
  const visibleTypes   = allKnownTypes.filter(k => state.csAllSelected || state.csStatusFilter.has(k));
  const legendWithData = visibleTypes.filter(k => (typeCounts[k] || 0) > 0).sort((a, b) => (TYPE_ORDER[a] ?? 99) - (TYPE_ORDER[b] ?? 99));
  const legendEmpty    = visibleTypes.filter(k => (typeCounts[k] || 0) === 0).sort((a, b) => (TYPE_ORDER[a] ?? 99) - (TYPE_ORDER[b] ?? 99));
  const typeKeys       = [...legendWithData, ...legendEmpty];

  $("statusLegend").innerHTML = typeKeys.map(k => {
    const isSelected = state.csAllSelected ? false : state.csStatusFilter.has(k);
    const safeK      = k.replace(/'/g, "\\'");
    let subLegend    = "";
    if (isSelected) {
      const statusCountsForType = countByKey(issues.filter(i => i.type === k), "status");
      const statusKeys = Object.keys(statusCountsForType).sort((a, b) => (STATUS_SORT_ORDER[a.toLowerCase()]??99) - (STATUS_SORT_ORDER[b.toLowerCase()]??99));
      subLegend = `<div class="sp-sub-legend">` +
        statusKeys.map(s => {
          const c           = cc(STATUS_COLORS, s);
          const safeS       = s.replace(/'/g, "\\'");
          const safeKk      = k.replace(/'/g, "\\'");
          const isHighlighted = isStatusMode && state.csHighlightedStatus === s;
          const fade          = isStatusMode && state.csHighlightedStatus && !isHighlighted;
          const onclick       = isStatusMode
            ? `selectDrillDownStatus('${safeS}')`
            : `selectTypeAndStatus('${safeKk}','${safeS}')`;
          return `<div class="sp-sub-legend-row${isHighlighted ? " selected" : ""}" style="cursor:pointer" onclick="${onclick}">
            <span class="legend-dot" style="background:${c};width:8px;height:8px;opacity:${fade?0.35:1}"></span>
            <span class="legend-label" style="opacity:${fade?0.4:1}">${fmt(s)}</span>
            <span class="legend-count">${statusCountsForType[s]}</span>
          </div>`;
        }).join("") + `</div>`;
    }
    const cnt           = typeCounts[k] || 0;
    const rowDim        = cnt === 0 ? " style=\"opacity:0.45\"" : "";
    const isFirstEmpty  = cnt === 0 && legendWithData.length > 0 && typeKeys.indexOf(k) === legendWithData.length;
    const dividerHtml   = isFirstEmpty ? `<div style="border-top:1px solid #e2e8f0;margin:4px 0"></div>` : "";
    return dividerHtml + `<div class="legend-row${isSelected ? " selected" : ""}" data-status="${k}"
        onclick="selectStatusSegment('${safeK}')" title="Clique para filtrar"${rowDim}>
      <span class="legend-dot" style="background:${cc(TYPE_COLORS,k)}"></span>
      <span class="legend-label">${fmt(k)}</span>
      <span class="legend-count">${cnt}</span>
    </div>${subLegend}`;
  }).join("");
}

// ── Type chart ────────────────────────────────────────────────────────────────

export function renderTypeChart(tc, filteredIssues) {
  if (!$("typeChart")) return;
  const issues  = filteredIssues || state.sprintData._issues;
  const keys    = Object.keys(tc).sort((a, b) => tc[b] - tc[a]);
  const colors  = keys.map(k => cc(TYPE_COLORS, k));
  const filteredTotal = keys.reduce((s, k) => s + tc[k], 0);
  const grandTotal    = state.sprintData._issues.length;
  const isFiltered    = state.ctTypeFilter.size > 0;
  const centerSub     = isFiltered ? `de ${grandTotal}` : "issues";

  if (state.charts["typeChart"]) state.charts["typeChart"].destroy();
  state.charts["typeChart"] = new Chart($("typeChart"), {
    type: "doughnut",
    data: { labels: keys, datasets: [{ data: keys.map(k => tc[k]), backgroundColor: colors, borderWidth: 2, borderColor: "#fff" }] },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: "65%",
      plugins: { legend: { display: false } },
      onClick(evt) {
        const pts = state.charts["typeChart"].getElementsAtEventForMode(evt, "nearest", { intersect: true }, false);
        if (!pts.length) return;
        openTypeModal(keys[pts[0].index]);
      },
      onHover(evt) { evt.native.target.style.cursor = "pointer"; },
    },
    plugins: [makeCenterPlugin(String(filteredTotal), centerSub)],
  });

  $("typeLegend").innerHTML = keys.map(k =>
    `<div class="legend-row" onclick="openTypeModal('${k.replace(/'/g,"\\'")}') " title="Ver issues">
      <span class="legend-dot" style="background:${cc(TYPE_COLORS,k)}"></span>
      <span class="legend-label">${k}</span>
      <span class="legend-count">${tc[k]}</span>
    </div>`
  ).join("");
}

// ── Generic issue modal ───────────────────────────────────────────────────────

export function openModal(title, issues) {
  $("modalTitle").textContent = title;
  $("modalBody").innerHTML = issues.map(i => `<tr>
    <td>${jiraLink(i.key, JIRA_BASE_URL)}</td>
    <td class="truncate" title="${i.summary}">${i.summary}</td>
    <td>${typePill(i.type)}</td>
    <td>${statusPill(i.status)}</td>
    <td style="color:#64748b;font-size:12px">${i.assignee}</td>
  </tr>`).join("");
  $("modalFooter").textContent = `${issues.length} issue${issues.length !== 1 ? "s" : ""}`;
  $("issueModal").style.display = "flex";
  document.body.style.overflow  = "hidden";
}
export function openBugsModal() {
  if (!state.sprintData) return;
  openModal(`Bugs Abertos (${state.sprintData.open_bugs.length})`, state.sprintData.open_bugs || []);
}
export function openStoriesModal() {
  if (!state.sprintData) return;
  const types  = new Set(["história", "historia", "story", "melhoria"]);
  const issues = (state.sprintData.stories || [])
    .filter(s => types.has((s.type || "").toLowerCase()))
    .map(s => ({ key: s.key, summary: s.summary, type: s.type, status: s.status, assignee: s.assignee }));
  openModal(`Histórias & Melhorias (${issues.length})`, issues);
}
export function closeModal() {
  $("issueModal").style.display = "none";
  document.body.style.overflow  = "";
}
export function onModalBackdropClick(e) { if (e.target === $("issueModal")) closeModal(); }

// ── Risk chart & panel ────────────────────────────────────────────────────────

export function getAllCts() {
  if (!state.sprintData || !state.sprintData.planning_subtasks) return [];
  return state.sprintData.planning_subtasks.flatMap(ps =>
    (ps.cts || []).map(ct => ({ ...ct, storyKey: ps.story_key, storySummary: ps.story_summary }))
  );
}

const RISK_PAGE_SIZE  = 10;
const RISK_CRIT_ORDER = { critical: 2, medium: 1, low: 0 };

export function renderRiskChart() {
  if (state.charts["riskChart"]) state.charts["riskChart"].destroy();
  const allCts = state.riskFilter ? getAllCts().filter(ct => ct.storyKey === state.riskFilter) : getAllCts();

  if (state.riskSelected) {
    const cts   = allCts.filter(ct => (ct.ct_status || "nao_iniciado") === state.riskSelected);
    const order = ["critical","medium","low"];
    const dist  = {};
    cts.forEach(ct => { const c = ct.criticality || "low"; dist[c] = (dist[c] || 0) + 1; });
    const keys  = order.filter(k => dist[k] > 0);
    const total = cts.length;
    state.charts["riskChart"] = new Chart($("riskChart"), {
      type: "doughnut",
      data: {
        labels: keys.map(k => RISK_LABELS[k]),
        datasets: [{ data: keys.map(k => dist[k]), backgroundColor: keys.map(k => RISK_COLORS[k]), borderWidth: 2, borderColor: "#fff" }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: "65%",
        plugins: { legend: { display: false } },
        onClick() { closeRiskPanel(); },
        onHover(evt) { evt.native.target.style.cursor = "pointer"; },
      },
      plugins: [makeCenterPlugin(String(total), "cenários")],
    });
    $("riskLegend").innerHTML = keys.map(k => `
      <div class="legend-row" style="cursor:pointer" onclick="closeRiskPanel()">
        <span class="legend-dot" style="background:${RISK_COLORS[k]}"></span>
        <span class="legend-label">${RISK_LABELS[k]}</span>
        <span class="legend-count">${dist[k]}</span>
      </div>`).join("");
    if ($("riskChartTitle")) {
      $("riskChartTitle").innerHTML =
        `Cenários — <span style="color:${CT_STATUS_COLORS[state.riskSelected]};font-weight:700">${CT_STATUS_LABELS[state.riskSelected]}</span><span style="font-size:11px;font-weight:500;color:#94a3b8"> · Criticidade</span>`;
    }
    return;
  }

  const statusDist  = {};
  allCts.forEach(ct => { const s = ct.ct_status || "nao_iniciado"; statusDist[s] = (statusDist[s] || 0) + 1; });
  const withData    = CT_STATUS_ORDER.filter(s => statusDist[s] > 0);
  const withoutData = CT_STATUS_ORDER.filter(s => !statusDist[s]);
  const keys        = [...withData, ...withoutData];
  const total       = allCts.length;

  state.charts["riskChart"] = new Chart($("riskChart"), {
    type: "doughnut",
    data: {
      labels: keys.map(s => CT_STATUS_LABELS[s]),
      datasets: [{ data: keys.map(s => statusDist[s] || 0), backgroundColor: keys.map(s => CT_STATUS_COLORS[s]), borderWidth: 2, borderColor: "#fff", offset: 0 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: "65%",
      plugins: { legend: { display: false } },
      onClick(evt) {
        const pts = state.charts["riskChart"].getElementsAtEventForMode(evt, "nearest", { intersect: true }, false);
        if (!pts.length) return;
        openRiskPanel(keys[pts[0].index]);
      },
      onHover(evt) { evt.native.target.style.cursor = "pointer"; },
    },
    plugins: [makeCenterPlugin(String(total), "cenários")],
  });

  $("riskLegend").innerHTML = keys.map(s => {
    const count   = statusDist[s] || 0;
    const isEmpty = count === 0;
    const safeS   = s.replace(/'/g,"\\'");
    return `<div class="legend-row" style="${isEmpty ? "opacity:.4;pointer-events:none" : "cursor:pointer"}" onclick="${isEmpty ? "" : `openRiskPanel('${safeS}')`}">
      <span class="legend-dot" style="background:${CT_STATUS_COLORS[s]}"></span>
      <span class="legend-label">${CT_STATUS_LABELS[s]}</span>
      <span class="legend-count">${count}</span>
    </div>`;
  }).join("");

  if ($("riskChartTitle")) $("riskChartTitle").textContent = "Cenários — por Status";
}

export function openRiskPanel(key) {
  if (state.riskSelected === key) { closeRiskPanel(); return; }
  state.riskSelected = key; state.riskPage = 0;
  state.riskFilter = ""; state.riskSearch = "";
  renderRiskChart(); renderRiskPanel();
}
export function closeRiskPanel() {
  state.riskSelected = null; state.riskFilter = ""; state.riskSearch = "";
  renderRiskChart(); renderRiskPanel();
}

export function setRiskSort(col) {
  if (state.riskSortCol === col) state.riskSortDir = state.riskSortDir === "asc" ? "desc" : "asc";
  else { state.riskSortCol = col; state.riskSortDir = "asc"; }
  state.riskPage = 0; renderRiskTable();
}

function _getRiskBase() {
  const key = state.riskSelected;
  return key ? getAllCts().filter(ct => (ct.ct_status || "nao_iniciado") === key) : getAllCts();
}

export function riskFilterChange(val) {
  state.riskFilter = val; state.riskPage = 0;
  renderRiskChart(); renderRiskTable();
}
export function riskSearchChange(val) {
  state.riskSearch = val; state.riskPage = 0; renderRiskTable();
}
export function riskPagePrev() {
  state.riskPage = Math.max(0, state.riskPage - 1); renderRiskTable();
}
export function riskPageNext(maxPage) {
  state.riskPage = Math.min(maxPage, state.riskPage + 1); renderRiskTable();
}

function renderRiskFilterBar() {
  const base      = _getRiskBase();
  const storyOpts = [...new Map(base.filter(c => c.storyKey).map(c => [c.storyKey, c.storySummary])).entries()]
    .sort((a, b) => a[0].localeCompare(b[0]));

  $("riskFilterBar").innerHTML = `
    <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:10px">
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:#94a3b8;white-space:nowrap;min-width:60px">História:</span>
        <select onchange="riskFilterChange(this.value)"
          style="flex:1;padding:4px 8px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:12px;color:#1e293b;background:#fff;outline:none;cursor:pointer">
          <option value="">Todas</option>
          ${storyOpts.map(([k, s]) => `<option value="${k}" ${state.riskFilter===k?"selected":""}>${k}${s ? " — " + s : ""}</option>`).join("")}
        </select>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:#94a3b8;white-space:nowrap;min-width:60px">Buscar:</span>
        <input id="riskSearchInput" type="text" placeholder="Nome do cenário…"
          oninput="riskSearchChange(this.value)"
          style="flex:1;padding:4px 8px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:12px;color:#1e293b;background:#fff;outline:none">
      </div>
    </div>`;

  const inp = $("riskSearchInput");
  if (inp && inp !== document.activeElement) inp.value = state.riskSearch;
}

export function renderRiskTable() {
  const base = _getRiskBase();
  let cts = base;
  if (state.riskFilter) cts = cts.filter(ct => ct.storyKey === state.riskFilter);
  if (state.riskSearch) {
    const q = state.riskSearch.toLowerCase();
    cts = cts.filter(ct => (ct.summary||"").toLowerCase().includes(q));
  }

  if (state.riskSortCol) {
    const dir = state.riskSortDir === "asc" ? 1 : -1;
    cts = [...cts].sort((a, b) => {
      if (state.riskSortCol === "criticality")
        return ((RISK_CRIT_ORDER[a.criticality] ?? 0) - (RISK_CRIT_ORDER[b.criticality] ?? 0)) * dir;
      if (state.riskSortCol === "status") {
        const oa = CT_STATUS_ORDER.indexOf(a.ct_status || "nao_iniciado");
        const ob = CT_STATUS_ORDER.indexOf(b.ct_status || "nao_iniciado");
        return (oa - ob) * dir;
      }
      const map   = { story: "storyKey", category: "category", id: "id", summary: "summary" };
      const field = map[state.riskSortCol] || state.riskSortCol;
      return ((a[field]||"").localeCompare(b[field]||"")) * dir;
    });
  }

  const total = cts.length;
  const pages = Math.ceil(total / RISK_PAGE_SIZE) || 1;
  const page  = Math.min(state.riskPage, pages - 1);
  const slice = cts.slice(page * RISK_PAGE_SIZE, (page + 1) * RISK_PAGE_SIZE);

  const key = state.riskSelected;
  $("riskPanelTitle").textContent = key
    ? `${CT_STATUS_LABELS[key]} — ${total} cenário${total !== 1 ? "s" : ""}`
    : `Todos os cenários — ${total}`;
  if ($("riskCloseBtn")) $("riskCloseBtn").style.display = key ? "" : "none";

  const critOrder = ["critical","medium","low"];
  const critDist  = {};
  base.forEach(ct => { const c = ct.criticality || "low"; critDist[c] = (critDist[c] || 0) + 1; });
  const critStatsHtml = critOrder.filter(c => critDist[c] > 0).map(c =>
    `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:700;background:${c==='critical'?'#fee2e2':c==='medium'?'#fef3c7':'#dcfce7'};color:${RISK_COLORS[c]}">
      <span style="width:6px;height:6px;border-radius:50%;background:${RISK_COLORS[c]};flex-shrink:0"></span>${RISK_LABELS[c]}: ${critDist[c]}
    </span>`).join("");
  const critBar = document.getElementById("riskCritBar");
  if (critBar) critBar.innerHTML = critStatsHtml ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">${critStatsHtml}</div>` : "";

  const CRIT_LABEL_R = { critical: 'Alta', medium: 'Média', low: 'Baixa' };
  const CRIT_CLASS_R = { critical: 'ct-badge-critical', medium: 'ct-badge-medium', low: 'ct-badge-low' };

  const si = col => {
    const active = state.riskSortCol === col;
    const icon   = active ? (state.riskSortDir === "asc" ? " ↑" : " ↓") : " ↕";
    return `<span class="sort-icon${active ? " active" : ""}">${icon}</span>`;
  };

  $("riskTableArea").innerHTML = slice.length
    ? `<div class="table-scroll"><table>
        <colgroup>
          <col style="width:15%"><col style="width:12%"><col style="width:10%"><col style="width:13%"><col style="width:6%"><col style="width:44%">
        </colgroup>
        <thead><tr>
          <th class="sp-sort-th" onclick="setRiskSort('story')">História${si("story")}</th>
          <th class="sp-sort-th" onclick="setRiskSort('category')">Categoria${si("category")}</th>
          <th class="sp-sort-th" onclick="setRiskSort('criticality')">Criticidade${si("criticality")}</th>
          <th class="sp-sort-th" onclick="setRiskSort('status')">Status${si("status")}</th>
          <th class="sp-sort-th" onclick="setRiskSort('id')">ID${si("id")}</th>
          <th class="sp-sort-th" onclick="setRiskSort('summary')">Cenário${si("summary")}</th>
        </tr></thead>
        <tbody>${slice.map(ct => {
          const st = ct.ct_status || "nao_iniciado";
          return `<tr>
          <td class="truncate" style="font-size:12px" title="${ct.storyKey||''}: ${ct.storySummary||''}">
            ${ct.storyKey ? `<a class="key-link" href="${JIRA_BASE_URL}${ct.storyKey}" target="_blank">${ct.storyKey}</a>` : '—'}
          </td>
          <td class="truncate" style="font-size:12px;color:#64748b" title="${ct.category||''}">${ct.category||'—'}</td>
          <td><span class="${CRIT_CLASS_R[ct.criticality]||''}" style="font-size:10px;padding:2px 7px;border-radius:999px;font-weight:600;white-space:nowrap">${CRIT_LABEL_R[ct.criticality]||'—'}</span></td>
          <td><span style="font-size:10px;padding:2px 7px;border-radius:999px;font-weight:600;white-space:nowrap;color:#fff;background:${CT_STATUS_COLORS[st]}">${CT_STATUS_LABELS[st]}</span></td>
          <td style="font-weight:700;color:#6366f1;font-size:12px;white-space:nowrap">${ct.id}</td>
          <td style="font-size:12px;color:#1e293b;max-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${ct.summary}">${ct.summary}</td>
        </tr>`;}).join("")}</tbody>
      </table></div>`
    : `<div class="empty">Nenhum cenário encontrado.</div>`;

  $("riskPanelPagination").innerHTML = pages > 1 ? `
    <div style="display:flex;align-items:center;gap:6px;justify-content:center;padding-top:10px">
      <button onclick="riskPagePrev()" style="padding:3px 11px;border:1.5px solid #e2e8f0;border-radius:6px;font-size:13px;cursor:pointer;background:#fff;color:#475569;${page===0?'opacity:.4;cursor:default':''}" ${page===0?"disabled":""}>‹</button>
      <span style="font-size:11px;color:#64748b;font-weight:600">${page+1} / ${pages}</span>
      <button onclick="riskPageNext(${pages-1})" style="padding:3px 11px;border:1.5px solid #e2e8f0;border-radius:6px;font-size:13px;cursor:pointer;background:#fff;color:#475569;${page===pages-1?'opacity:.4;cursor:default':''}" ${page===pages-1?"disabled":""}>›</button>
    </div>` : "";

  $("riskPanelCount").textContent = total > RISK_PAGE_SIZE
    ? `Exibindo ${slice.length} de ${total} cenários`
    : `${total} cenário${total !== 1 ? "s" : ""}`;
}

export function renderRiskPanel() {
  renderRiskFilterBar();
  renderRiskTable();
}
