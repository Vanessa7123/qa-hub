// Automation candidates and blocked stories sections.

import { state } from './state.js';
import { JIRA_BASE_URL, CT_STATUS_COLORS, CT_STATUS_LABELS } from './config.js';
import { $ } from './utils.js';
import { _jiraStatusStyle, issueTypeIconFull } from './ct-detail.js';

const CRIT_LABEL = { critical: 'Alta', medium: 'Média', low: 'Baixa' };

// ── Automation candidates ──────────────────────────────────────────────────────

export function renderAutomation(candidates) {
  const el = $("automationSection");
  if (!el) return;
  if (!candidates || !candidates.length) {
    el.innerHTML = `<div class="empty">Dados insuficientes — bugs sem componente ou label no Jira.</div>`;
    return;
  }
  const max = candidates[0].bug_count;
  el.innerHTML = candidates.map(c => `
    <div style="margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:3px">
        <span style="font-weight:600">${c.name}</span>
        <span style="color:#64748b">${c.type} · ${c.bug_count} bug${c.bug_count>1?"s":""}</span>
      </div>
      <div class="progress-wrap"><div class="progress-fill" style="width:${Math.round(c.bug_count/max*100)}%;background:#ef4444"></div></div>
      <div style="font-size:11px;color:#94a3b8;margin-top:2px">Considere cobertura de regressão</div>
    </div>`).join("");
}

// ── Blocked stories ────────────────────────────────────────────────────────────

const BS_PRIORITY = {
  'Highest': { label: 'Crítica',    dot: '#dc2626' },
  'High':    { label: 'Alta',       dot: '#ea580c' },
  'Alta':    { label: 'Alta',       dot: '#ea580c' },
  'Medium':  { label: 'Média',      dot: '#d97706' },
  'Média':   { label: 'Média',      dot: '#d97706' },
  'Low':     { label: 'Baixa',      dot: '#16a34a' },
  'Baixa':   { label: 'Baixa',      dot: '#16a34a' },
  'Lowest':  { label: 'Muito Baixa',dot: '#94a3b8' },
};
const BS_PRIO_ORDER = ['Highest','Alta','High','Medium','Média','Low','Baixa','Lowest'];

function _bsPrioKey(p) { return BS_PRIO_ORDER.indexOf(p) >= 0 ? BS_PRIO_ORDER.indexOf(p) : 99; }

function _impactedCts(bugKey) {
  const hits = [];
  for (const [k, data] of Object.entries(state.ctLocalLinks)) {
    const bugs = data.linked_bugs || [];
    if (bugs.some(b => (typeof b === 'string' ? b : b.key) === bugKey)) {
      const [storyKey, ctId] = k.split('/');
      const ps = state.storyCts[storyKey];
      const ct = ps && (ps.cts || []).find(c => c.id === ctId);
      if (ct) hits.push({ storyKey, ct });
    }
  }
  return hits;
}

function _bsBugStatusPill(status) {
  const st = _jiraStatusStyle(status);
  return `<span style="padding:2px 10px;border-radius:999px;border:1px solid ${st.border};color:${st.color};background:${st.bg};font-size:11px;font-weight:600;white-space:nowrap">${status}</span>`;
}

function _bsAvatarInitials(name) {
  const parts    = (name || '?').split(' ');
  const initials = (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
  const colors   = ['#6366f1','#0ea5e9','#10b981','#f59e0b','#ec4899','#8b5cf6','#14b8a6'];
  const ci       = (name || '').split('').reduce((a,c)=>a+c.charCodeAt(0),0) % colors.length;
  return `<span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:${colors[ci]};color:#fff;font-size:9px;font-weight:700;flex-shrink:0">${initials}</span>`;
}

export function toggleBsExpand(id) {
  const el  = document.getElementById('bs-expand-' + id);
  const btn = document.getElementById('bs-btn-' + id);
  if (!el) return;
  const open = el.style.display !== 'none';
  el.style.display = open ? 'none' : '';
  if (btn) btn.style.transform = open ? '' : 'rotate(180deg)';
}

export function toggleBlockedStory(key) {
  if (state.blockedExpanded.has(key)) state.blockedExpanded.delete(key);
  else state.blockedExpanded.add(key);
  renderBlockedStories((state.sprintData || {}).blocked_stories || []);
}

export function renderBlockedStories(blocked) {
  const el = $("blockedSection");
  if (!el) return;
  if (!blocked || !blocked.length) {
    el.innerHTML = `<div class="empty">Nenhuma story bloqueada neste sprint.</div>`;
    return;
  }

  el.innerHTML = blocked.map((s, si) => {
    const allBugs        = s.all_bugs || [];
    const openCount      = allBugs.filter(b => b.open).length;
    const totalCtsImpacted = new Set(
      allBugs.flatMap(b => _impactedCts(b.key).map(x => x.storyKey + '/' + x.ct.id))
    ).size;

    const groups = {};
    allBugs.forEach(b => {
      const p = b.priority || 'Lowest';
      if (!groups[p]) groups[p] = [];
      groups[p].push(b);
    });
    const sortedPrios = Object.keys(groups).sort((a, b) => _bsPrioKey(a) - _bsPrioKey(b));
    const isExpanded  = state.blockedExpanded.has(s.key);
    const safeKey     = s.key.replace(/'/g, "\\'");

    const prioPills = sortedPrios.map(prio => {
      const cfg         = BS_PRIORITY[prio] || { label: prio, dot: '#94a3b8' };
      const openInPrio  = groups[prio].filter(b => b.open).length;
      return `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:700;background:#f1f5f9;color:#475569">
        <span style="width:6px;height:6px;border-radius:50%;background:${cfg.dot};flex-shrink:0"></span>
        ${groups[prio].length}${openInPrio < groups[prio].length ? ` <span style="color:#94a3b8;font-weight:400">(${openInPrio} aberto${openInPrio!==1?'s':''})</span>` : ''}
      </span>`;
    }).join('');

    const summaryParts = [
      `${allBugs.length} bug${allBugs.length !== 1 ? 's' : ''}`,
      `<span style="color:${openCount > 0 ? '#dc2626' : '#94a3b8'}">${openCount} aberto${openCount !== 1 ? 's' : ''}</span>`,
      totalCtsImpacted ? `${totalCtsImpacted} CT${totalCtsImpacted !== 1 ? 's' : ''} impactado${totalCtsImpacted !== 1 ? 's' : ''}` : '',
    ].filter(Boolean).join(' · ');

    const groupsHtml = sortedPrios.map(prio => {
      const cfg  = BS_PRIORITY[prio] || { label: prio, dot: '#94a3b8' };
      const rows = groups[prio].map((b, bi) => {
        const rowId    = `s${si}p${prio.replace(/\s/g,'_')}b${bi}`;
        const impacted = _impactedCts(b.key);
        const ctCount  = impacted.length;
        const daysHtml = b.open
          ? `<span style="font-size:11px;font-weight:700;color:${b.days_open > 7 ? '#dc2626' : b.days_open > 3 ? '#d97706' : '#64748b'}">${b.days_open === 0 ? 'hoje' : b.days_open + 'd'}</span>`
          : `<span style="font-size:11px;color:#94a3b8">—</span>`;

        const expandRows = impacted.length
          ? `<div style="padding:6px 12px 8px 12px;background:#f8fafc;border-top:1px solid #f1f5f9;display:flex;flex-direction:column;gap:5px">` +
            impacted.map(({ ct }) => {
              const statusColor = CT_STATUS_COLORS[ct.ct_status || 'nao_iniciado'];
              const statusLabel = CT_STATUS_LABELS[ct.ct_status  || 'nao_iniciado'];
              const critCfg = {
                critical: { bg:'#fee2e2', color:'#dc2626' },
                medium:   { bg:'#fef3c7', color:'#d97706' },
                low:      { bg:'#dcfce7', color:'#16a34a' },
              };
              const cc2 = critCfg[ct.criticality] || { bg:'#f1f5f9', color:'#94a3b8' };
              return `<div style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:#fff;border:1px solid #e2e8f0;border-left:3px solid ${statusColor};border-radius:8px">
                <span style="font-weight:700;color:#6366f1;font-size:11px;white-space:nowrap;min-width:36px">${ct.id}</span>
                <span style="font-size:11px;color:#1e293b;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${ct.summary || '—'}</span>
                <span style="padding:1px 8px;border-radius:999px;font-size:10px;font-weight:700;color:#fff;background:${statusColor};white-space:nowrap;flex-shrink:0">${statusLabel}</span>
                <span style="padding:1px 8px;border-radius:999px;font-size:10px;font-weight:700;background:${cc2.bg};color:${cc2.color};white-space:nowrap;flex-shrink:0">${CRIT_LABEL[ct.criticality] || '—'}</span>
              </div>`;
            }).join('') + `</div>`
          : `<div style="padding:8px 12px 8px 48px;background:#f8fafc;border-top:1px solid #f1f5f9;font-size:11px;color:#94a3b8;font-style:italic">Nenhum CT vinculado manualmente</div>`;

        return `<div>
          <div style="display:flex;align-items:center;gap:12px;padding:10px 12px;border-top:1px solid #f1f5f9;${!b.open ? 'opacity:.65' : ''}">
            ${issueTypeIconFull(b.type, 13)}
            <a href="${JIRA_BASE_URL}${b.key}" target="_blank" style="font-weight:700;color:#6366f1;font-size:12px;text-decoration:none;white-space:nowrap;min-width:96px">${b.key}</a>
            <span style="font-size:12px;color:#1e293b;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${b.summary}</span>
            ${_bsBugStatusPill(b.status)}
            <span style="font-size:11px;color:${ctCount ? '#6366f1' : '#94a3b8'};font-weight:${ctCount ? '700' : '400'};white-space:nowrap;min-width:44px;text-align:right">${ctCount ? ctCount + ' CT' + (ctCount !== 1 ? 's' : '') : '—'}</span>
            ${daysHtml}
            <div style="display:flex;align-items:center;gap:5px;min-width:100px">${_bsAvatarInitials(b.assignee)}<span style="font-size:11px;color:#475569;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${(b.assignee||'').split(' ')[0]}</span></div>
            <button id="bs-btn-${rowId}" onclick="toggleBsExpand('${rowId}')" style="border:none;background:none;cursor:pointer;padding:2px 4px;color:#94a3b8;font-size:11px;transition:transform .2s;flex-shrink:0">▼</button>
          </div>
          <div id="bs-expand-${rowId}" style="display:none">${expandRows}</div>
        </div>`;
      }).join('');

      return `<div style="border-left:3px solid ${cfg.dot};margin:6px 12px 0;border-radius:0 6px 6px 0;overflow:hidden">
        <div style="display:flex;align-items:center;gap:7px;padding:5px 10px;background:${cfg.dot}18">
          <span style="width:7px;height:7px;border-radius:50%;background:${cfg.dot};flex-shrink:0"></span>
          <span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:${cfg.dot}">${cfg.label}</span>
          <span style="font-size:10px;color:#94a3b8">· ${groups[prio].length}</span>
        </div>
        <div style="background:#fff">${rows}</div>
      </div>`;
    }).join('');

    return `<div style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin-bottom:8px">
      <div onclick="toggleBlockedStory('${safeKey}')" style="display:flex;align-items:center;gap:10px;padding:12px 16px;background:#fff;cursor:pointer;user-select:none;${isExpanded ? 'border-bottom:1px solid #f1f5f9' : ''}">
        <span style="font-size:13px;color:#94a3b8;transition:transform .2s;flex-shrink:0;${isExpanded ? 'transform:rotate(90deg)' : ''}">▶</span>
        <a href="${JIRA_BASE_URL}${s.key}" target="_blank" onclick="event.stopPropagation()" style="font-weight:700;color:#6366f1;font-size:13px;text-decoration:none;white-space:nowrap">${s.key}</a>
        <span style="font-size:13px;font-weight:600;color:#1e293b;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${s.summary}</span>
        ${isExpanded
          ? `<span style="font-size:11px;color:#94a3b8;white-space:nowrap;flex-shrink:0">${summaryParts}</span>`
          : `<div style="display:flex;align-items:center;gap:6px;flex-shrink:0">${prioPills}<span style="font-size:11px;color:${openCount>0?'#dc2626':'#94a3b8'};font-weight:700;white-space:nowrap">${openCount} aberto${openCount!==1?'s':''}</span></div>`
        }
      </div>
      ${isExpanded ? groupsHtml : ''}
    </div>`;
  }).join('');
}
