// Scenario modal: filter bar, sort, CT row rendering.

import { state } from './state.js';
import {
  JIRA_BASE_URL,
  CT_STATUS_ORDER, CT_STATUS_COLORS, CT_STATUS_LABELS,
} from './config.js';
import { $ } from './utils.js';
import { selectCtById, deselectCt } from './ct-detail.js';

const CRIT_LABEL = { critical: 'Alta', medium: 'Média', low: 'Baixa' };
const CRIT_CLASS = { critical: 'ct-badge-critical', medium: 'ct-badge-medium', low: 'ct-badge-low' };

const SC_CRIT_OPTIONS = [
  { value: 'critical', label: 'Crítica',  color: '#dc2626' },
  { value: 'medium',   label: 'Média',    color: '#d97706' },
  { value: 'low',      label: 'Baixa',    color: '#16a34a' },
];

function _scCritOrder(val)   { return ['critical','medium','low'].indexOf(val); }
function _scStatusOrder(val) { return CT_STATUS_ORDER.indexOf(val); }

export function setScSort(col) {
  if (state.scSortCol === col) state.scSortDir = state.scSortDir === 'asc' ? 'desc' : 'asc';
  else { state.scSortCol = col; state.scSortDir = 'asc'; }
  renderScenarioTable();
}

function si(col) {
  if (state.scSortCol !== col) return '<span class="sort-icon">↕</span>';
  return `<span class="sort-icon active">${state.scSortDir === 'asc' ? '↑' : '↓'}</span>`;
}

export function toggleScDrop(id) {
  state.scOpenDrop = state.scOpenDrop === id ? null : id;
  renderScenarioFilterBar();
}
export function closeScDrop() {
  state.scOpenDrop = null; renderScenarioFilterBar();
}

export function toggleScFilterVal(dropId, value) {
  const map    = { crit: state.scCritFilter, status: state.scStatusFilter, cat: state.scCatFilter };
  const allMap = { crit: state.scAllCritVals, status: state.scAllStatusVals, cat: state.scAllCatVals };
  const set     = map[dropId];
  const allVals = allMap[dropId] || [];
  if (!set) return;
  if (set.size === 0) {
    allVals.forEach(v => { if (v !== value) set.add(v); });
  } else if (set.has(value)) {
    set.delete(value);
  } else {
    set.add(value);
    if (allVals.length > 0 && allVals.every(v => set.has(v))) set.clear();
  }
  renderScenarioFilterBar(); renderScenarioTable();
}

export function clearScFilter(dropId) {
  const map = { crit: state.scCritFilter, status: state.scStatusFilter, cat: state.scCatFilter };
  const set = map[dropId];
  if (set) set.clear();
  renderScenarioFilterBar(); renderScenarioTable();
}

export function clearAllScFilters() {
  state.scCritFilter.clear(); state.scStatusFilter.clear(); state.scCatFilter.clear();
  state.scSearch = '';
  renderScenarioFilterBar(); renderScenarioTable();
}

export function scSearchChange(val) {
  state.scSearch = val; renderScenarioTable();
}

function renderDropdownBtn(id, label, activeSet, allOptions) {
  const count = activeSet.size;
  const txt   = count === 0 ? label : `${label} (${count})`;
  const isOpen = state.scOpenDrop === id;
  return `<div style="position:relative;display:inline-block">
    <button onclick="toggleScDrop('${id}')" style="padding:4px 10px;border:1.5px solid ${count > 0 ? '#6366f1' : '#e2e8f0'};border-radius:8px;font-size:12px;color:${count > 0 ? '#6366f1' : '#475569'};background:${count > 0 ? '#ede9fe' : '#fff'};cursor:pointer;font-weight:${count > 0 ? '700' : '500'}">
      ${txt} ▾
    </button>
    ${isOpen ? renderDropPanel(id, allOptions, activeSet) : ''}
  </div>`;
}

function renderDropPanel(id, options, activeSet) {
  return `<div style="position:absolute;top:110%;left:0;min-width:180px;background:#fff;border:1.5px solid #e2e8f0;border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,.1);z-index:200;padding:8px 0;max-height:240px;overflow-y:auto">
    <label style="display:flex;align-items:center;gap:8px;padding:5px 12px;cursor:pointer;font-size:12px">
      <input type="checkbox" ${activeSet.size === 0 ? 'checked' : ''} onchange="clearScFilter('${id}')"> Todos
    </label>
    <div style="border-top:1px solid #f1f5f9;margin:4px 0"></div>
    ${options.map(({ value, label, color }) => `
      <label style="display:flex;align-items:center;gap:8px;padding:5px 12px;cursor:pointer;font-size:12px">
        <input type="checkbox" ${(activeSet.size === 0 || activeSet.has(value)) ? 'checked' : ''} onchange="toggleScFilterVal('${id}','${value}')">
        ${color ? `<span style="width:9px;height:9px;border-radius:50%;background:${color};flex-shrink:0"></span>` : ''}
        ${label}
      </label>`).join('')}
  </div>`;
}

export function renderScenarioFilterBar() {
  const el = document.getElementById('scFilterBar');
  if (!el) return;
  const ps = state.storyCts[state.scStoryKey];
  if (!ps) return;

  const catOptions = [...new Set((ps.cts || []).map(c => c.category || 'Sem categoria'))].sort()
    .map(c => ({ value: c, label: c }));
  const statusOptions = CT_STATUS_ORDER.map(s => ({
    value: s, label: CT_STATUS_LABELS[s], color: CT_STATUS_COLORS[s]
  }));
  state.scAllStatusVals = statusOptions.map(o => o.value);
  state.scAllCritVals   = SC_CRIT_OPTIONS.map(o => o.value);
  state.scAllCatVals    = catOptions.map(o => o.value);

  const anyFilter = state.scCritFilter.size + state.scStatusFilter.size + state.scCatFilter.size > 0 || state.scSearch;
  const overlayHtml = state.scOpenDrop !== null
    ? `<div onclick="closeScDrop()" style="position:fixed;inset:0;z-index:190"></div>` : '';

  el.innerHTML = `
    ${overlayHtml}
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:12px 20px 10px;border-bottom:1px solid #f1f5f9">
      <input id="scSearchInput" type="text" placeholder="Buscar cenário…"
        oninput="scSearchChange(this.value)"
        style="padding:4px 10px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:12px;color:#1e293b;background:#fff;outline:none;min-width:160px">
      ${renderDropdownBtn('crit',   'Criticidade', state.scCritFilter,   SC_CRIT_OPTIONS)}
      ${renderDropdownBtn('status', 'Status',      state.scStatusFilter, statusOptions)}
      ${renderDropdownBtn('cat',    'Categoria',   state.scCatFilter,    catOptions)}
      ${anyFilter ? `<button onclick="clearAllScFilters()" style="padding:4px 10px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:12px;color:#64748b;background:#f8fafc;cursor:pointer;font-weight:500">✕ Limpar</button>` : ''}
    </div>`;

  const inp = document.getElementById('scSearchInput');
  if (inp && inp !== document.activeElement) inp.value = state.scSearch;
}

export function renderScenarioTable() {
  const el = document.getElementById('scTableArea');
  if (!el) return;
  const ps = state.storyCts[state.scStoryKey];
  if (!ps) return;

  let cts = ps.cts || [];
  if (state.scCritFilter.size)   cts = cts.filter(ct => state.scCritFilter.has(ct.criticality || ''));
  if (state.scStatusFilter.size) cts = cts.filter(ct => state.scStatusFilter.has(ct.ct_status || 'nao_iniciado'));
  if (state.scCatFilter.size)    cts = cts.filter(ct => state.scCatFilter.has(ct.category || 'Sem categoria'));
  if (state.scSearch) {
    const q = state.scSearch.toLowerCase();
    cts = cts.filter(ct => (ct.summary || '').toLowerCase().includes(q) || (ct.id || '').toLowerCase().includes(q));
  }

  if (state.scSortCol) {
    cts = [...cts].sort((a, b) => {
      let va, vb;
      if (state.scSortCol === 'id')          { va = a.id || ''; vb = b.id || ''; }
      else if (state.scSortCol === 'category')    { va = a.category || ''; vb = b.category || ''; }
      else if (state.scSortCol === 'criticality') { va = _scCritOrder(a.criticality); vb = _scCritOrder(b.criticality); return state.scSortDir === 'asc' ? va - vb : vb - va; }
      else if (state.scSortCol === 'ct_status')   { va = _scStatusOrder(a.ct_status || 'nao_iniciado'); vb = _scStatusOrder(b.ct_status || 'nao_iniciado'); return state.scSortDir === 'asc' ? va - vb : vb - va; }
      else if (state.scSortCol === 'summary')     { va = a.summary || ''; vb = b.summary || ''; }
      else { va = ''; vb = ''; }
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return state.scSortDir === 'asc' ? cmp : -cmp;
    });
  }

  const totalFiltered = cts.length;
  const totalAll      = (ps.cts || []).length;
  const rows          = cts.map(ct => _renderCtRow(ct)).join('');

  el.innerHTML = `
    <div class="table-scroll" style="padding:0 20px 16px">
      <table>
        <colgroup><col style="width:6%"><col style="width:15%"><col style="width:10%"><col style="width:13%"><col style="width:56%"></colgroup>
        <thead><tr>
          <th class="sp-sort-th" onclick="setScSort('id')">ID${si('id')}</th>
          <th class="sp-sort-th" onclick="setScSort('category')">Categoria${si('category')}</th>
          <th class="sp-sort-th" onclick="setScSort('criticality')">Criticidade${si('criticality')}</th>
          <th class="sp-sort-th" onclick="setScSort('ct_status')">Status${si('ct_status')}</th>
          <th class="sp-sort-th" onclick="setScSort('summary')">Cenário${si('summary')}</th>
        </tr></thead>
        <tbody>${rows || '<tr><td colspan="5" style="text-align:center;color:#94a3b8;font-size:12px;padding:16px">Nenhum cenário encontrado.</td></tr>'}</tbody>
      </table>
    </div>`;

  const updateFade = () => {
    const fade = document.getElementById('scTableFade');
    if (!fade) return;
    fade.style.display = (el.scrollHeight <= el.clientHeight + 4 || el.scrollTop + el.clientHeight >= el.scrollHeight - 4) ? 'none' : 'block';
  };
  el.addEventListener('scroll', updateFade);
  updateFade();

  const footerEl = document.getElementById('scenarioModalFooter');
  if (footerEl) {
    footerEl.textContent = `${(ps && ps.story_summary) || ''} · ${totalFiltered} de ${totalAll} cenário${totalAll !== 1 ? 's' : ''}`;
  }
}

function _renderCtRow(ct) {
  const sc         = CT_STATUS_COLORS[ct.ct_status || 'nao_iniciado'];
  const sl         = CT_STATUS_LABELS[ct.ct_status  || 'nao_iniciado'];
  const isSelected = state.selectedCt && state.selectedCt.ct.id === ct.id;
  return `<tr data-ctid="${ct.id}" onclick="selectCtById('${state.scStoryKey}','${ct.id}')" style="cursor:pointer${isSelected ? ';background:#ede9fe' : ''}">
    <td style="font-weight:700;color:#6366f1;font-size:12px;white-space:nowrap">${ct.id}</td>
    <td style="font-size:12px;color:#64748b;white-space:nowrap;max-width:140px;overflow:hidden;text-overflow:ellipsis" title="${ct.category||''}">${ct.category||'—'}</td>
    <td><span class="${CRIT_CLASS[ct.criticality]||''}" style="font-size:10px;padding:2px 7px;border-radius:999px;font-weight:600;white-space:nowrap">${CRIT_LABEL[ct.criticality]||'—'}</span></td>
    <td><span class="ct-status-pill" style="font-size:10px;padding:2px 8px;border-radius:999px;font-weight:600;color:#fff;background:${sc};white-space:nowrap">${sl}</span></td>
    <td style="font-size:12px;color:#1e293b">${ct.summary}</td>
  </tr>`;
}

export function openScenarioModal(storyKey, statusKey) {
  const ps = state.storyCts[storyKey];
  if (!ps) return;

  state.scStoryKey     = storyKey;
  state.scCritFilter   = new Set();
  state.scStatusFilter = statusKey ? new Set([statusKey]) : new Set();
  state.scCatFilter    = new Set();
  state.scSearch       = "";
  state.scSortCol      = null;
  state.scSortDir      = "asc";
  state.scOpenDrop     = null;
  state.selectedCt     = null;
  state.workflowExpanded = false;

  const stColor = statusKey ? CT_STATUS_COLORS[statusKey] : "#6366f1";
  const stLabel = statusKey ? CT_STATUS_LABELS[statusKey] : "Todos os cenários";
  $("scenarioModalTitle").innerHTML =
    `<a class="key-link" href="${JIRA_BASE_URL}${storyKey}" target="_blank">${storyKey}</a>` +
    `<span style="margin:0 8px;color:#cbd5e1">·</span>` +
    `<span style="padding:2px 10px;border-radius:999px;font-size:11px;font-weight:700;` +
    (statusKey ? `color:#fff;background:${stColor}` : `color:#6366f1;background:#ede9fe`) +
    `">${stLabel}</span>`;

  $("scenarioCtList").innerHTML =
    '<div id="scFilterBar" style="flex-shrink:0"></div>' +
    '<div style="position:relative;flex:1;min-height:0">' +
      '<div id="scTableArea" style="overflow-y:auto;max-height:calc(92vh - 56px - 57px - 37px);min-height:0"></div>' +
      '<div id="scTableFade" style="position:absolute;bottom:0;left:0;right:0;height:64px;background:linear-gradient(to bottom,transparent,#fff);pointer-events:none;z-index:5"></div>' +
    '</div>';

  renderScenarioFilterBar();
  renderScenarioTable();

  const panel = $('ctDetailPanel');
  if (panel) panel.style.display = 'none';
  $("scenarioModal").style.display = "flex";
}

export function closeScenarioModal() {
  deselectCt();
  state.workflowExpanded = false;
  $("scenarioModal").style.display = "none";
}
export function onScenarioModalBackdropClick(e) {
  if (e.target === $("scenarioModal")) closeScenarioModal();
}
