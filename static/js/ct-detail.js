// CT detail panel: status transitions, bug/related linking, comments.

import { state } from './state.js';
import {
  JIRA_BASE_URL,
  STATUS_COLORS,
  CT_STATUS_COLORS, CT_STATUS_LABELS, CT_STATUS_ORDER, CT_STATUS_TRANSITIONS, CT_STATUS_DESC,
} from './config.js';
import { $, escHtml, issueTypeIcon } from './utils.js';
import { formatGherkin, initStoryChart, updateStoryCardUI, _saveCtLinks } from './story-progress.js';
import { saveCtData } from './api.js';

// ── Status pill (uses Jira status names, not CT statuses) ─────────────────────

export function jiraStatusPill(status) {
  if (!status) return '';
  const st = _jiraStatusStyle(status);
  return `<span style="padding:1px 7px;border-radius:999px;border:1px solid ${st.border};color:${st.color};background:${st.bg};font-size:10px;font-weight:600;white-space:nowrap">${status}</span>`;
}

export function _jiraStatusStyle(status) {
  const exactColor = STATUS_COLORS[status];
  if (exactColor) return { bg: exactColor + '22', border: exactColor + '66', color: exactColor };
  const s = (status || '').toLowerCase();
  if (/finalizado|conclu|pronto.?p.?prod|done|resolved|resolvido|fechado|closed/.test(s))
    return { bg: '#dcfce7', border: '#86efac', color: '#15803d' };
  if (/pronto.?p.?qa|em.?teste|em.?valida|deploy/.test(s))
    return { bg: '#ede9fe', border: '#c4b5fd', color: '#6d28d9' };
  if (/andamento|progress|fazendo|doing/.test(s))
    return { bg: '#dbeafe', border: '#93c5fd', color: '#1d4ed8' };
  if (/revis|review|homologa|valida/.test(s))
    return { bg: '#fdf4ff', border: '#e879f9', color: '#a21caf' };
  if (/bloquea|blocked/.test(s))
    return { bg: '#fef3c7', border: '#fcd34d', color: '#92400e' };
  if (/cancel/.test(s))
    return { bg: '#f1f5f9', border: '#cbd5e1', color: '#64748b' };
  return { bg: '#f1f5f9', border: '#cbd5e1', color: '#475569' };
}

// Full issue type icon (includes sub-task, task, document icons)
export function issueTypeIconFull(type, size = 14) {
  const sz = size;
  const t  = (type || '').toLowerCase();
  if (t.includes('incident') || t.includes('incidente'))
    return `<svg width="${sz}" height="${sz}" viewBox="0 0 16 16" style="flex-shrink:0"><circle cx="8" cy="8" r="8" fill="#F4511E"/><path d="M8.5 3C8.5 3 10.5 5.8 10.5 8.2C10.5 9.6 9.4 10.5 8 10.5C6.6 10.5 5.5 9.6 5.5 8.2 5.5 8.2 5 9 5 10 5 11.9 6.3 13 8 13 9.7 13 11 11.9 11 10 11 7.2 8.5 3 8.5 3Z" fill="white"/></svg>`;
  if (t.includes('bug'))
    return `<svg width="${sz}" height="${sz}" viewBox="0 0 16 16" style="flex-shrink:0"><circle cx="8" cy="8" r="8" fill="#E53935"/><ellipse cx="8" cy="9.2" rx="2.4" ry="2.9" fill="white"/><rect x="6.5" y="4.5" width="3" height="2.4" rx="1.5" fill="white"/><line x1="5.6" y1="7.8" x2="3.5" y2="6.8" stroke="white" stroke-width="1.1" stroke-linecap="round"/><line x1="10.4" y1="7.8" x2="12.5" y2="6.8" stroke="white" stroke-width="1.1" stroke-linecap="round"/><line x1="5.8" y1="10.2" x2="3.8" y2="11.2" stroke="white" stroke-width="1.1" stroke-linecap="round"/><line x1="10.2" y1="10.2" x2="12.2" y2="11.2" stroke="white" stroke-width="1.1" stroke-linecap="round"/></svg>`;
  if (t.includes('epic'))
    return `<svg width="${sz}" height="${sz}" viewBox="0 0 16 16" style="flex-shrink:0"><circle cx="8" cy="8" r="8" fill="#904EE2"/><path d="M9 3L5 9h4l-2 4 6-7H9l1-3z" fill="white"/></svg>`;
  if (t.includes('story') || t.includes('história') || t.includes('historia') || t.includes('melhoria'))
    return `<svg width="${sz}" height="${sz}" viewBox="0 0 16 16" style="flex-shrink:0"><circle cx="8" cy="8" r="8" fill="#2D8A4E"/><path d="M5.5 3.5h5a.5.5 0 01.5.5v8l-3-2-3 2V4a.5.5 0 01.5-.5z" fill="white"/></svg>`;
  if (t.includes('sub-task') || t.includes('subtask') || t.includes('subtarefa'))
    return `<svg width="${sz}" height="${sz}" viewBox="0 0 16 16" style="flex-shrink:0"><circle cx="8" cy="8" r="8" fill="#4BADE8"/><rect x="4.5" y="4.5" width="7" height="7" rx="1" fill="none" stroke="white" stroke-width="1.4"/><path d="M5.5 8l2 2 3-3" stroke="white" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`;
  if (t.includes('task') || t.includes('tarefa'))
    return `<svg width="${sz}" height="${sz}" viewBox="0 0 16 16" style="flex-shrink:0"><circle cx="8" cy="8" r="8" fill="#4BADE8"/><path d="M4.5 8l2.5 2.5 4.5-4.5" stroke="white" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`;
  return `<svg width="${sz}" height="${sz}" viewBox="0 0 16 16" style="flex-shrink:0"><circle cx="8" cy="8" r="8" fill="#94a3b8"/><rect x="5" y="4" width="6" height="8" rx="1" fill="white" opacity=".9"/><line x1="6.5" y1="6.5" x2="9.5" y2="6.5" stroke="#94a3b8" stroke-width="1"/><line x1="6.5" y1="8" x2="9.5" y2="8" stroke="#94a3b8" stroke-width="1"/><line x1="6.5" y1="9.5" x2="8.5" y2="9.5" stroke="#94a3b8" stroke-width="1"/></svg>`;
}

export function ctIcon(sz = 14) {
  return `<svg width="${sz}" height="${sz}" viewBox="0 0 16 16" style="flex-shrink:0">
    <circle cx="8" cy="8" r="8" fill="#6366f1"/>
    <text x="8" y="11.5" text-anchor="middle" fill="white" font-size="6.5" font-weight="700" font-family="monospace">CT</text></svg>`;
}

// ── CT selection ──────────────────────────────────────────────────────────────

export function selectCtById(storyKey, ctId) {
  const ps = state.storyCts[storyKey];
  if (!ps) return;
  const ct = (ps.cts || []).find(c => c.id === ctId);
  if (!ct) return;
  if (state.selectedCt && state.selectedCt.ct.id === ctId && state.selectedCt.storyKey === storyKey) {
    deselectCt(); return;
  }
  selectCt(ct, ps.key, storyKey);
}

export function selectCt(ct, subtaskKey, storyKey) {
  state.selectedCt = { ct, subtaskKey, storyKey };
  _checkAutoRetest();
}

export function deselectCt() {
  state.selectedCt = null;
  const panel = $('ctDetailPanel');
  if (panel) panel.style.display = 'none';
}

// ── Workflow modal ─────────────────────────────────────────────────────────────

export function openWorkflowModal() {
  const statusRows = CT_STATUS_ORDER.map(s => `
    <div style="display:flex;align-items:flex-start;gap:10px;padding:8px 10px;border-radius:8px;background:#f8fafc;border:1px solid #f1f5f9">
      <span style="flex-shrink:0;margin-top:1px;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700;color:#fff;background:${CT_STATUS_COLORS[s]}">${CT_STATUS_LABELS[s]}</span>
      <span style="font-size:12px;color:#475569;line-height:1.4">${CT_STATUS_DESC[s]}</span>
    </div>`).join("");

  const transitionRows = CT_STATUS_ORDER.map(s => {
    const targets     = CT_STATUS_TRANSITIONS[s];
    const isFinal     = targets.length === 0;
    const targetsHtml = isFinal
      ? `<span style="font-size:11px;color:#94a3b8;font-style:italic">status final</span>`
      : targets.map(t => `<span style="padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;color:#fff;background:${CT_STATUS_COLORS[t]}">${CT_STATUS_LABELS[t]}</span>`).join(" ");
    return `<tr>
      <td style="padding:6px 10px 6px 0;white-space:nowrap;vertical-align:middle">
        <span style="padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;color:#fff;background:${CT_STATUS_COLORS[s]}">${CT_STATUS_LABELS[s]}</span>
      </td>
      <td style="padding:6px 0;color:#cbd5e1;font-size:14px;text-align:center;vertical-align:middle;width:24px">→</td>
      <td style="padding:6px 0 6px 10px;vertical-align:middle"><div style="display:flex;flex-wrap:wrap;gap:4px">${targetsHtml}</div></td>
    </tr>`;
  }).join("");

  const notes = [
    ["Falhado → Aprovado", "obrigatório passar por Retest antes"],
    ["Não Iniciado → Aprovado", "não se pode aprovar sem executar"],
    ["Retest → Não Iniciado / Skipped", "execução obrigatória quando em Retest"],
    ["Skipped → Em Andamento", "deve retornar a Não Iniciado antes de executar"],
    ["Aprovado / Cancelado → Em Andamento direto", "deve retornar a Não Iniciado antes de executar novamente"],
  ];
  const notesHtml = notes.map(([rule, reason]) =>
    `<div style="display:flex;gap:8px;font-size:11px;padding:4px 0;border-bottom:1px solid #f1f5f9">
      <span style="color:#dc2626;font-weight:700;white-space:nowrap;flex-shrink:0">✕ ${rule}</span>
      <span style="color:#64748b">${reason}</span>
    </div>`).join("");

  $("workflowModalBody").innerHTML = `
    <div style="display:flex;flex-direction:column;gap:20px">
      <div>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#94a3b8;margin-bottom:10px">Status disponíveis</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">${statusRows}</div>
      </div>
      <div>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#94a3b8;margin-bottom:10px">Transições permitidas</div>
        <table style="border-collapse:collapse;width:100%">${transitionRows}</table>
      </div>
      <div>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#94a3b8;margin-bottom:8px">Transições não permitidas</div>
        ${notesHtml}
      </div>
    </div>`;
  $("workflowModal").style.display = "flex";
}
export function closeWorkflowModal() { $("workflowModal").style.display = "none"; }
export function onWorkflowModalBackdropClick(e) { if (e.target === $("workflowModal")) closeWorkflowModal(); }

// ── CT detail render ──────────────────────────────────────────────────────────

function _refreshLinkedStatuses(ct) {
  if (!state.sprintData || !state.sprintData._issues) return;
  const idx = {};
  for (const i of state.sprintData._issues) idx[i.key] = i;
  for (const b of (ct.linked_bugs || [])) {
    const key = typeof b === 'string' ? b : b.key;
    if (idx[key] && typeof b === 'object') b.status = idx[key].status;
  }
  for (const r of (ct.related_items || [])) {
    if (r.isCt) continue;
    const key = typeof r === 'string' ? r : r.key;
    if (idx[key] && typeof r === 'object') r.status = idx[key].status;
  }
}

export function renderCtDetail() {
  if (!state.selectedCt) return;
  const { ct, subtaskKey, storyKey } = state.selectedCt;
  _refreshLinkedStatuses(ct);
  const currentStatus = ct.ct_status || 'nao_iniciado';
  const allowed       = CT_STATUS_TRANSITIONS[currentStatus] || [];
  const isFalhado     = currentStatus === 'falhado';

  const statusDropHtml = `
    <div style="position:relative;display:inline-block">
      <button id="ctStatusDropBtn" onclick="toggleCtStatusDrop()"
        style="display:flex;align-items:center;gap:6px;padding:5px 12px;border-radius:999px;border:none;cursor:pointer;font-size:12px;font-weight:700;color:#fff;background:${CT_STATUS_COLORS[currentStatus]}">
        ${CT_STATUS_LABELS[currentStatus]} ▾
      </button>
      <div id="ctStatusDropPanel" style="display:none;position:absolute;top:110%;right:0;min-width:180px;background:#fff;border:1.5px solid #e2e8f0;border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,.1);z-index:300;overflow:hidden">
        ${allowed.map(s => `
          <div onclick="changeCtStatus('${s}')"
            style="display:flex;align-items:center;gap:8px;padding:7px 14px;cursor:pointer;font-size:12px;font-weight:600"
            onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background=''">
            <span style="width:10px;height:10px;border-radius:50%;background:${CT_STATUS_COLORS[s]};flex-shrink:0"></span>
            ${CT_STATUS_LABELS[s]}
          </div>`).join('')}
        ${allowed.length ? '<div style="border-top:1px solid #f1f5f9;margin:2px 0"></div>' : ''}
        <div onclick="openWorkflowModal()"
          style="display:flex;align-items:center;gap:6px;padding:7px 14px;cursor:pointer;font-size:11px;color:#6366f1;font-weight:700"
          onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background=''">
          ⇄ Ver workflow
        </div>
      </div>
    </div>`;

  const linkedBugPills = (ct.linked_bugs || []).map(b => {
    const key     = typeof b === 'string' ? b : b.key;
    const summary = typeof b === 'string' ? null : b.summary;
    const status  = typeof b === 'string' ? null : b.status;
    const type    = typeof b === 'string' ? null : b.type;
    return `<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:#fff5f5;border:1px solid #fca5a5;border-radius:8px;font-size:11px">
      ${issueTypeIconFull(type)}
      <a href="${JIRA_BASE_URL}${key}" target="_blank" style="font-weight:700;color:#dc2626;text-decoration:none;white-space:nowrap">${key}</a>
      ${summary ? `<span style="color:#1e293b;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${summary.replace(/"/g,'&quot;')}">${summary}</span>` : '<span style="flex:1"></span>'}
      ${jiraStatusPill(status)}
      <span onmousedown="unlinkCtBug('${key}')" style="cursor:pointer;font-size:16px;line-height:1;color:#dc2626;opacity:.5;flex-shrink:0" title="Remover">×</span>
    </div>`;
  }).join('');

  const isFalhadoBorder = isFalhado ? '#fca5a5' : '#e2e8f0';
  const sep = `<div style="border-top:1px solid #f1f5f9;margin:0 -16px"></div>`;
  const sectionLabel = (txt, color) =>
    `<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:${color||'#94a3b8'};margin-bottom:8px">${txt}</div>`;

  $('ctDetailPanel').innerHTML = `
    <div style="display:flex;flex-direction:column">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;padding-bottom:14px">
        <div style="min-width:0;flex:1">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:nowrap;margin-bottom:6px">
            <div style="font-size:11px;font-weight:700;color:#6366f1;letter-spacing:.3px;white-space:nowrap">${ct.id}${ct.category ? ` · <span style="color:#94a3b8;font-weight:600">${ct.category}</span>` : ''}</div>
            <div style="flex:1"></div>
            ${statusDropHtml}
          </div>
          <div style="font-size:13px;font-weight:700;color:#1e293b;line-height:1.45">${ct.summary}</div>
        </div>
        <button onclick="deselectCt()" style="flex-shrink:0;width:26px;height:26px;display:flex;align-items:center;justify-content:center;border:none;background:#f1f5f9;border-radius:6px;cursor:pointer;font-size:14px;color:#64748b;margin-left:4px">✕</button>
      </div>
      ${sep}
      <div style="padding:14px 0">
        ${sectionLabel('Gherkin')}
        <div style="font-size:12px">${formatGherkin(ct.gherkin)}</div>
      </div>
      ${sep}
      <div id="ctBugsSection" style="padding:14px 0${isFalhado ? ';background:linear-gradient(0deg,#fff5f5,transparent)' : ''}">
        ${sectionLabel('Impedimentos' + (isFalhado ? ' ⚠️' : ''), isFalhado ? '#dc2626' : '#94a3b8')}
        <div style="position:relative;margin-bottom:10px">
          <input id="ctBugSearchInput" type="text" placeholder="Buscar ticket impedidor…"
            oninput="searchCtBugs(this.value)"
            style="width:100%;box-sizing:border-box;padding:6px 10px;border:1.5px solid ${isFalhado?'#fca5a5':'#e2e8f0'};border-radius:8px;font-size:12px;color:#1e293b;background:#fff;outline:none">
          <div id="ctBugResults" style="position:absolute;top:calc(100% + 4px);left:0;right:0;background:#fff;border:1.5px solid #e2e8f0;border-radius:8px;z-index:50;box-shadow:0 4px 16px rgba(0,0,0,.1);display:none;max-height:220px;overflow-y:auto"></div>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px">
          ${linkedBugPills || '<span style="font-size:11px;color:#94a3b8;font-style:italic">Nenhum impedimento vinculado</span>'}
        </div>
      </div>
      ${sep}
      <div style="padding:14px 0">
        ${sectionLabel('Relacionados')}
        <div style="position:relative;margin-bottom:10px">
          <input id="ctRelSearchInput" type="text" placeholder="Buscar ticket ou CT relacionado…"
            oninput="searchCtRelated(this.value)"
            style="width:100%;box-sizing:border-box;padding:6px 10px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:12px;color:#1e293b;background:#fff;outline:none">
          <div id="ctRelResults" style="position:absolute;top:calc(100% + 4px);left:0;right:0;background:#fff;border:1.5px solid #e2e8f0;border-radius:8px;z-index:50;box-shadow:0 4px 16px rgba(0,0,0,.1);display:none;max-height:220px;overflow-y:auto"></div>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px">
          ${(ct.related_items || []).length ? (ct.related_items || []).map(b => {
            const key     = typeof b === 'string' ? b : b.key;
            const summary = typeof b === 'string' ? null : b.summary;
            const status  = typeof b === 'string' ? null : b.status;
            const type    = typeof b === 'string' ? null : b.type;
            const isCt    = typeof b === 'object' && b.isCt;
            return `<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;font-size:11px">
              ${isCt ? ctIcon() : issueTypeIconFull(type)}
              <a href="${isCt ? '' : JIRA_BASE_URL+key}" target="${isCt ? '_self' : '_blank'}" style="font-weight:700;color:#6366f1;text-decoration:none;white-space:nowrap">${key}</a>
              ${summary ? `<span style="color:#1e293b;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${summary.replace(/"/g,'&quot;')}">${summary}</span>` : '<span style="flex:1"></span>'}
              ${jiraStatusPill(status)}
              <span onmousedown="unlinkCtRel('${key}')" style="cursor:pointer;font-size:16px;line-height:1;color:#64748b;opacity:.5;flex-shrink:0" title="Remover">×</span>
            </div>`;
          }).join('') : '<span style="font-size:11px;color:#94a3b8;font-style:italic">Nenhum relacionamento vinculado</span>'}
        </div>
      </div>
      ${sep}
      <div style="padding:14px 0">
        ${sectionLabel('Comentários')}
        <div id="ctCommentsList" style="display:flex;flex-direction:column;gap:6px;margin-bottom:10px"></div>
        <div id="ctCommentingAs" style="font-size:11px;color:#64748b;margin-bottom:6px">${_commentingAsHtml()}</div>
        <textarea id="ctCommentInput" class="ct-comment-textarea" placeholder="Adicionar comentário…"></textarea>
        <div style="display:flex;justify-content:flex-end;margin-top:6px">
          <button onclick="addCtComment()" class="btn btn-primary" style="padding:5px 14px;font-size:12px">Comentar</button>
        </div>
      </div>
    </div>`;

  state.ctBugSearchSeq++;
  state.ctRelSearchSeq++;
  $('ctDetailPanel').style.display = '';
  renderCtComments();
}

// ── CT Comments ───────────────────────────────────────────────────────────────

function _ctCommentKey() {
  if (!state.selectedCt) return null;
  return `${state.selectedCt.storyKey}/${state.selectedCt.ct.id}`;
}
function _saveComments() {
  saveCtData(state.ctLocalLinks, state.ctComments).catch(() => {});
}
function getCtUser() { return localStorage.getItem('qahub_username') || ''; }
export function setCtUser(name) {
  localStorage.setItem('qahub_username', name.trim());
  const el = $('ctCommentingAs');
  if (el) el.innerHTML = _commentingAsHtml();
}
function _commentingAsHtml() {
  const u = getCtUser();
  return u
    ? `Comentando como <strong>${escHtml(u)}</strong> · <span style="cursor:pointer;color:#6366f1;text-decoration:underline" onclick="promptCtUser()">alterar</span>`
    : `<span style="color:#ef4444">Defina seu nome antes de comentar</span> · <span style="cursor:pointer;color:#6366f1;text-decoration:underline" onclick="promptCtUser()">definir</span>`;
}
export function promptCtUser() {
  const cur  = getCtUser();
  const name = window.prompt('Seu nome (será exibido nos comentários):', cur);
  if (name === null) return;
  setCtUser(name);
}
function _fmtCommentDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function renderCtComments() {
  const el = $('ctCommentsList');
  if (!el || !state.selectedCt) return;
  const key      = _ctCommentKey();
  const comments = (state.ctComments[key] || []);
  if (!comments.length) {
    el.innerHTML = '<span style="font-size:11px;color:#94a3b8;font-style:italic">Nenhum comentário ainda.</span>';
    return;
  }
  el.innerHTML = comments.map(c => `
    <div class="ct-comment" id="ctcmt-${c.id}">
      <div class="ct-comment-text" id="ctcmt-text-${c.id}">${escHtml(c.text)}</div>
      <textarea class="ct-comment-textarea" id="ctcmt-edit-${c.id}" style="display:none;margin-top:6px">${escHtml(c.text)}</textarea>
      <div class="ct-comment-meta">
        ${c.author ? `<span style="font-weight:600;color:#334155">${escHtml(c.author)}</span> · ` : ''}
        <span title="${c.updatedAt !== c.createdAt ? 'Editado em ' + _fmtCommentDate(c.updatedAt) : ''}">${_fmtCommentDate(c.createdAt)}${c.updatedAt !== c.createdAt ? ' · editado' : ''}</span>
        <button class="ct-comment-action" id="ctcmt-editbtn-${c.id}" onclick="startEditCtComment('${c.id}')">Editar</button>
        <button class="ct-comment-action" id="ctcmt-savebtn-${c.id}" style="display:none;color:#6366f1" onclick="saveCtCommentEdit('${c.id}')">Salvar</button>
        <button class="ct-comment-action" id="ctcmt-cancelbtn-${c.id}" style="display:none" onclick="cancelCtCommentEdit('${c.id}')">Cancelar</button>
        <button class="ct-comment-action del" onclick="deleteCtComment('${c.id}')">Excluir</button>
      </div>
    </div>`).join('');
}

export function addCtComment() {
  if (!state.selectedCt) return;
  const author = getCtUser();
  if (!author) { promptCtUser(); return; }
  const input = $('ctCommentInput');
  const text  = (input.value || '').trim();
  if (!text) return;
  const key = _ctCommentKey();
  if (!state.ctComments[key]) state.ctComments[key] = [];
  const now = new Date().toISOString();
  state.ctComments[key].push({ id: Date.now().toString(36), text, author, createdAt: now, updatedAt: now });
  _saveComments();
  input.value = '';
  renderCtComments();
}
export function deleteCtComment(commentId) {
  if (!state.selectedCt) return;
  const key = _ctCommentKey();
  if (!state.ctComments[key]) return;
  state.ctComments[key] = state.ctComments[key].filter(c => c.id !== commentId);
  _saveComments(); renderCtComments();
}
export function startEditCtComment(commentId) {
  $('ctcmt-text-'    + commentId).style.display = 'none';
  $('ctcmt-edit-'    + commentId).style.display = '';
  $('ctcmt-editbtn-' + commentId).style.display = 'none';
  $('ctcmt-savebtn-' + commentId).style.display = '';
  $('ctcmt-cancelbtn-'+ commentId).style.display = '';
  $('ctcmt-edit-'    + commentId).focus();
}
export function saveCtCommentEdit(commentId) {
  if (!state.selectedCt) return;
  const key     = _ctCommentKey();
  const newText = ($('ctcmt-edit-' + commentId).value || '').trim();
  if (!newText) return;
  const c = (state.ctComments[key] || []).find(x => x.id === commentId);
  if (!c) return;
  c.text = newText; c.updatedAt = new Date().toISOString();
  _saveComments(); renderCtComments();
}
export function cancelCtCommentEdit() { renderCtComments(); }

// ── Status change ─────────────────────────────────────────────────────────────

export async function changeCtStatus(newStatus) {
  if (!state.selectedCt) return;
  const { ct, subtaskKey, storyKey } = state.selectedCt;
  try {
    const res  = await fetch('/api/ct/status', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subtask_key: subtaskKey, ct_id: ct.id, new_status: newStatus }),
    });
    const data = await res.json();
    if (!data.ok) { console.error('Erro ao mudar status:', data.error); return; }
    state.selectedCt.ct.ct_status = newStatus;
    const ps = state.storyCts[storyKey];
    if (ps) {
      const dist = {};
      for (const c of (ps.cts || [])) { const s = c.ct_status || 'nao_iniciado'; dist[s] = (dist[s] || 0) + 1; }
      ps.status_dist = dist;
      if (state.storyCharts[storyKey]) { try { state.storyCharts[storyKey].destroy(); } catch(e){} delete state.storyCharts[storyKey]; }
      initStoryChart(storyKey, dist);
      updateStoryCardUI(storyKey);
    }
    const row = document.querySelector(`tr[data-ctid="${ct.id}"]`);
    if (row) {
      const statusCell = row.querySelector('.ct-status-pill');
      if (statusCell) { statusCell.textContent = CT_STATUS_LABELS[newStatus]; statusCell.style.background = CT_STATUS_COLORS[newStatus]; }
    }
    renderCtDetail();
    if (newStatus === 'falhado') {
      const bugsSection = $('ctBugsSection');
      if (bugsSection) bugsSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  } catch(e) { console.error('Erro changeCtStatus:', e); }
}

export function toggleCtStatusDrop() {
  const panel = document.getElementById('ctStatusDropPanel');
  if (!panel) return;
  panel.style.display = panel.style.display === 'none' ? '' : 'none';
}

// ── Bug / related search ──────────────────────────────────────────────────────

export function searchCtBugs(q) {
  clearTimeout(state.ctBugSearchTimer);
  const el = $('ctBugResults');
  if (!q || q.length < 2) { if (el) el.style.display = 'none'; return; }
  const seq = ++state.ctBugSearchSeq;
  state.ctBugSearchTimer = setTimeout(async () => {
    try {
      const res  = await fetch(`/api/bugs/search?q=${encodeURIComponent(q)}&board_id=${state.selectedBoardId}`);
      const data = await res.json();
      if (seq !== state.ctBugSearchSeq) return;
      state.ctBugResults = data;
      const el2 = $('ctBugResults');
      if (!el2) return;
      if (!state.ctBugResults.length) { el2.style.display = 'none'; return; }
      el2.innerHTML = state.ctBugResults.slice(0, 8).map((b, i) =>
        `<div onmousedown="linkCtBugByIdx(${i})"
          style="display:flex;align-items:center;gap:7px;padding:7px 10px;cursor:pointer;border-bottom:1px solid #f1f5f9;font-size:12px"
          onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background=''">
          ${issueTypeIconFull(b.type)}
          <span style="font-weight:700;color:#6366f1;white-space:nowrap">${b.key}</span>
          <span style="color:#1e293b;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${b.summary}</span>
          ${jiraStatusPill(b.status)}
        </div>`
      ).join('');
      el2.style.display = '';
    } catch(e) { console.error('searchCtBugs error:', e); }
  }, 300);
}

export function linkCtBugByIdx(idx) {
  if (!state.selectedCt) return;
  const b = state.ctBugResults[idx];
  if (!b) return;
  const { ct, storyKey } = state.selectedCt;
  if (!ct.linked_bugs) ct.linked_bugs = [];
  if (ct.linked_bugs.some(x => (typeof x === 'string' ? x : x.key) === b.key)) return;
  ct.linked_bugs.push({ key: b.key, summary: b.summary, status: b.status, type: b.type });
  _saveCtLinks(storyKey, ct.id, ct);
  const el = $('ctBugResults'); if (el) el.style.display = 'none';
  const inp = $('ctBugSearchInput'); if (inp) inp.value = '';
  _checkAutoRetest();
}
export function unlinkCtBug(bugKey) {
  if (!state.selectedCt) return;
  const { ct, storyKey } = state.selectedCt;
  ct.linked_bugs = (ct.linked_bugs || []).filter(x => (typeof x === 'string' ? x : x.key) !== bugKey);
  _saveCtLinks(storyKey, ct.id, ct);
  _checkAutoRetest();
}

function _isBugResolved(b) {
  const s = ((typeof b === 'string' ? '' : b.status) || '').toLowerCase();
  return /finalizado|conclu|pronto.?p.?prod|done|resolved|resolvido|fechado|closed|cancel/.test(s);
}
function _checkAutoRetest() {
  if (!state.selectedCt) { renderCtDetail(); return; }
  const { ct } = state.selectedCt;
  _refreshLinkedStatuses(ct);
  const currentStatus = ct.ct_status || 'nao_iniciado';
  const bugs          = ct.linked_bugs || [];
  if ((currentStatus === 'bloqueado' || currentStatus === 'falhado') && bugs.length > 0 && bugs.every(_isBugResolved)) {
    changeCtStatus('retest');
  } else {
    renderCtDetail();
  }
}

export function searchCtRelated(q) {
  clearTimeout(state.ctRelSearchTimer);
  const el = $('ctRelResults');
  if (!q || q.length < 2) { if (el) el.style.display = 'none'; return; }

  if (state.selectedCt) {
    const storyKey  = state.selectedCt.storyKey;
    const ps        = state.storyCts[storyKey];
    const localCts  = (ps && ps.cts || []).filter(c =>
      c.id !== state.selectedCt.ct.id &&
      (c.id.toLowerCase().includes(q.toLowerCase()) || c.summary.toLowerCase().includes(q.toLowerCase()))
    );
    if (localCts.length && el) {
      state.ctRelResults = localCts.map(c => ({ key: c.id, summary: c.summary, status: CT_STATUS_LABELS[c.ct_status || 'nao_iniciado'], type: null, isCt: true }));
      el.innerHTML = state.ctRelResults.map((b, i) =>
        `<div onmousedown="linkCtRelByIdx(${i})"
          style="display:flex;align-items:center;gap:7px;padding:7px 10px;cursor:pointer;border-bottom:1px solid #f1f5f9;font-size:12px"
          onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background=''">
          ${ctIcon()}
          <span style="font-weight:700;color:#6366f1;white-space:nowrap">${b.key}</span>
          <span style="color:#1e293b;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${b.summary}</span>
        </div>`
      ).join('');
      el.style.display = ''; return;
    }
  }

  const seq = ++state.ctRelSearchSeq;
  state.ctRelSearchTimer = setTimeout(async () => {
    try {
      const res  = await fetch(`/api/bugs/search?q=${encodeURIComponent(q)}&board_id=${state.selectedBoardId}`);
      const data = await res.json();
      if (seq !== state.ctRelSearchSeq) return;
      state.ctRelResults = data;
      if (!el) return;
      if (!state.ctRelResults.length) { el.style.display = 'none'; return; }
      el.innerHTML = state.ctRelResults.slice(0, 8).map((b, i) =>
        `<div onmousedown="linkCtRelByIdx(${i})"
          style="display:flex;align-items:center;gap:7px;padding:7px 10px;cursor:pointer;border-bottom:1px solid #f1f5f9;font-size:12px"
          onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background=''">
          ${issueTypeIconFull(b.type)}
          <span style="font-weight:700;color:#6366f1;white-space:nowrap">${b.key}</span>
          <span style="color:#1e293b;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${b.summary}</span>
          ${jiraStatusPill(b.status)}
        </div>`
      ).join('');
      el.style.display = '';
    } catch(e) { console.error('searchCtRelated error:', e); }
  }, 300);
}

export function linkCtRelByIdx(idx) {
  if (!state.selectedCt) return;
  const b = state.ctRelResults[idx];
  if (!b) return;
  const { ct, storyKey } = state.selectedCt;
  if (!ct.related_items) ct.related_items = [];
  if (ct.related_items.some(x => (typeof x === 'string' ? x : x.key) === b.key)) return;
  ct.related_items.push({ key: b.key, summary: b.summary, status: b.status, type: b.type, isCt: !!b.isCt });
  _saveCtLinks(storyKey, ct.id, ct);
  const el = $('ctRelResults'); if (el) el.style.display = 'none';
  const inp = $('ctRelSearchInput'); if (inp) inp.value = '';
  renderCtDetail();
}
export function unlinkCtRel(key) {
  if (!state.selectedCt) return;
  const { ct, storyKey } = state.selectedCt;
  ct.related_items = (ct.related_items || []).filter(x => (typeof x === 'string' ? x : x.key) !== key);
  _saveCtLinks(storyKey, ct.id, ct);
  renderCtDetail();
}
