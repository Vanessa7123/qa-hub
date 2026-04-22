// Sprint quality report — generates a printable HTML page.

import { state } from './state.js';

// ── Shared helpers ────────────────────────────────────────────────────────────

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('pt-BR', {
    day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit',
  });
}
function fmtDateShort(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric' });
}

const STATUS_LABEL = {
  nao_iniciado:'Não iniciado', em_andamento:'Em andamento', bloqueado:'Bloqueado',
  aprovado:'Aprovado', falhado:'Falhado', retest:'Retest',
  cancelado:'Cancelado', skipped:'Skipped',
};
const STATUS_COLOR = {
  nao_iniciado:'#94a3b8', em_andamento:'#3b82f6', bloqueado:'#f97316',
  aprovado:'#16a34a',    falhado:'#ef4444',       retest:'#f59e0b',
  cancelado:'#6b7280',   skipped:'#8b5cf6',
};
const CRIT_STYLE = {
  crítica:  { color:'#dc2626', bg:'#fee2e2' },
  critica:  { color:'#dc2626', bg:'#fee2e2' },
  alta:     { color:'#ea580c', bg:'#ffedd5' },
  média:    { color:'#d97706', bg:'#fef3c7' },
  media:    { color:'#d97706', bg:'#fef3c7' },
  baixa:    { color:'#16a34a', bg:'#dcfce7' },
};
const CT_ORDER = ['aprovado','falhado','retest','em_andamento','bloqueado','skipped','cancelado','nao_iniciado'];

function statusPill(s) {
  const c = STATUS_COLOR[s] || '#94a3b8';
  const l = STATUS_LABEL[s] || s;
  return `<span style="display:inline-block;padding:2px 8px;border-radius:999px;border:1px solid ${c}55;background:${c}18;color:${c};font-size:10px;font-weight:700;white-space:nowrap">${l}</span>`;
}
function critPill(crit) {
  if (!crit) return '—';
  const k = crit.toLowerCase();
  const s = CRIT_STYLE[k] || { color:'#64748b', bg:'#f1f5f9' };
  return `<span style="display:inline-block;padding:2px 7px;border-radius:4px;background:${s.bg};color:${s.color};font-size:10px;font-weight:700;white-space:nowrap">${esc(crit)}</span>`;
}

// Shared CSS injected into every report
const BASE_CSS = `
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,sans-serif;background:#f8fafc;color:#1e293b;font-size:13px;line-height:1.5}
  .page{max-width:900px;margin:0 auto;padding:32px 24px}

  /* Header */
  .report-header{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:24px 28px;margin-bottom:20px}
  .report-header h1{font-size:20px;font-weight:800;color:#1e293b;margin-bottom:4px}
  .report-header .sub{font-size:12px;color:#94a3b8}
  .report-header .sprint-badge{display:inline-block;padding:3px 10px;border-radius:6px;background:#6366f110;border:1px solid #6366f130;color:#6366f1;font-size:11px;font-weight:700;margin-bottom:10px}

  /* Sections */
  .section{background:#fff;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:16px;overflow:hidden}
  .section-header{padding:14px 20px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;gap:10px}
  .section-header h2{font-size:13px;font-weight:700;color:#1e293b;text-transform:uppercase;letter-spacing:.5px;flex:1}
  .section-header .count{font-size:11px;color:#94a3b8;background:#f1f5f9;padding:2px 8px;border-radius:999px;font-weight:600}
  .section-body{padding:20px}
  .empty-state{padding:20px;text-align:center;color:#94a3b8;font-size:12px;font-style:italic}

  /* Metric cards */
  .metrics{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:12px;margin-bottom:16px}
  .metric{background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:16px 14px;text-align:center}
  .metric .val{font-size:28px;font-weight:800;line-height:1;margin-bottom:5px}
  .metric .lbl{font-size:10px;color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:.4px}

  /* Status bar */
  .status-bar{display:flex;height:10px;border-radius:999px;overflow:hidden;margin:10px 0 6px;background:#f1f5f9}
  .status-bar-seg{height:100%;transition:width .3s}
  .status-legend{display:flex;flex-wrap:wrap;gap:10px 16px;margin-top:8px}
  .legend-item{display:flex;align-items:center;gap:5px;font-size:11px;color:#475569}
  .legend-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}

  /* Tables */
  table{width:100%;border-collapse:collapse;font-size:12px}
  thead th{background:#f8fafc;padding:8px 12px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:#64748b;border-bottom:1px solid #e2e8f0}
  tbody td{padding:10px 12px;border-bottom:1px solid #f8fafc;vertical-align:top}
  tbody tr:last-child td{border-bottom:none}
  tbody tr:hover td{background:#fafbfc}

  /* CT cards (story report) */
  .cat-label{padding:7px 12px;background:#f8fafc;border-top:1px solid #f1f5f9;border-bottom:1px solid #f1f5f9;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#64748b}
  .ct-row{padding:12px 16px;border-bottom:1px solid #f8fafc;display:flex;flex-direction:column;gap:5px}
  .ct-row:last-child{border-bottom:none}
  .ct-row-top{display:flex;align-items:flex-start;gap:8px;flex-wrap:wrap}
  .ct-id{font-weight:700;color:#475569;font-size:11px;white-space:nowrap;flex-shrink:0;margin-top:1px}
  .ct-summary{font-size:13px;color:#1e293b;flex:1;min-width:0}
  .ct-pills{display:flex;gap:5px;flex-wrap:wrap;align-items:center;flex-shrink:0}
  .ct-links{display:flex;flex-direction:column;gap:4px;padding-left:34px}
  .link-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
  .link-lbl{font-size:10px;font-weight:600;color:#94a3b8;white-space:nowrap}
  .tag{display:inline-block;padding:1px 7px;border-radius:5px;font-size:11px;margin:1px 2px 1px 0}
  .tag-bug{background:#fee2e2;color:#dc2626;border:1px solid #fecaca}
  .tag-rel{background:#ede9fe;color:#7c3aed;border:1px solid #ddd6fe}

  /* Comments */
  .comments{display:flex;flex-direction:column;gap:4px;padding-left:34px}
  .comment-item{background:#f8fafc;border-left:3px solid #6366f1;padding:6px 10px;border-radius:0 6px 6px 0}
  .comment-meta{font-size:10px;color:#94a3b8;margin-bottom:3px}
  .comment-text{font-size:12px;color:#1e293b;white-space:pre-wrap;word-break:break-word}

  /* Pending block */
  .pending-card{border:1px solid #e2e8f0;border-radius:8px;margin-bottom:12px;overflow:hidden}
  .pending-card-header{padding:10px 14px;background:#fafafa;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .pending-card-body{padding:12px 14px}
  .no-notes{font-size:11px;color:#cbd5e1;font-style:italic}

  /* Recommendations */
  .rec{display:flex;gap:10px;align-items:flex-start;padding:10px 14px;background:#f8fafc;border-radius:8px;margin-bottom:8px;font-size:13px}
  .rec-arrow{color:#6366f1;font-weight:800;flex-shrink:0;margin-top:1px}

  /* Story group (sprint report pending section) */
  .story-group{border:1px solid #e2e8f0;border-radius:8px;margin-bottom:12px;overflow:hidden}
  .story-group-header{padding:10px 16px;background:#f8fafc;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;gap:10px}
  .story-key-badge{font-weight:700;color:#6366f1;font-size:11px;white-space:nowrap}
  .story-title{font-size:12px;color:#1e293b;flex:1}
  .story-ct-count{font-size:10px;color:#94a3b8;white-space:nowrap}

  /* Footer */
  .report-footer{margin-top:24px;padding-top:12px;border-top:1px solid #e2e8f0;font-size:10px;color:#94a3b8;display:flex;justify-content:space-between}
  @media print{
    body{background:#fff}
    .section,.report-header,.metric{border-color:#e2e8f0!important;box-shadow:none!important}
    .page{padding:16px}
  }
`;

// ── Shared components ─────────────────────────────────────────────────────────

function statusBarHtml(dist, total) {
  if (!total) return '';
  const segs = CT_ORDER.filter(s => dist[s]).map(s =>
    `<div class="status-bar-seg" style="width:${(dist[s]/total*100).toFixed(1)}%;background:${STATUS_COLOR[s]}" title="${STATUS_LABEL[s]}: ${dist[s]}"></div>`
  ).join('');
  const legend = CT_ORDER.filter(s => dist[s]).map(s =>
    `<div class="legend-item"><span class="legend-dot" style="background:${STATUS_COLOR[s]}"></span>${STATUS_LABEL[s]} <strong>${dist[s]}</strong></div>`
  ).join('');
  return `<div class="status-bar">${segs}</div><div class="status-legend">${legend}</div>`;
}

function ctLinksHtml(ct) {
  const bugs = (ct.linked_bugs || []);
  const rels = (ct.related_items || []);
  if (!bugs.length && !rels.length) return '';
  return `<div class="ct-links">
    ${bugs.length ? `<div class="link-row"><span class="link-lbl">Bugs</span>${bugs.map(b=>`<span class="tag tag-bug">${esc(b.key)} — ${esc(b.summary)}</span>`).join('')}</div>` : ''}
    ${rels.length ? `<div class="link-row"><span class="link-lbl">Relacionados</span>${rels.map(r=>`<span class="tag tag-rel">${esc(r.key??r)}${r.summary?' — '+esc(r.summary):''}</span>`).join('')}</div>` : ''}
  </div>`;
}

function ctCommentsHtml(ct, indent = true) {
  if (!ct.comments || !ct.comments.length) return '';
  const items = ct.comments.map(c => `
    <div class="comment-item">
      <div class="comment-meta">${c.author ? `<strong style="color:#334155">${esc(c.author)}</strong> · ` : ''}${fmtDate(c.createdAt)}${c.updatedAt !== c.createdAt ? ' · editado' : ''}</div>
      <div class="comment-text">${esc(c.text)}</div>
    </div>`).join('');
  return `<div class="${indent ? 'comments' : ''}" style="${indent ? '' : 'display:flex;flex-direction:column;gap:4px'}">${items}</div>`;
}

function enrichCts(cts, storyKey) {
  return (cts || []).map(ct => {
    const k = `${storyKey}/${ct.id}`;
    return {
      ...ct,
      linked_bugs:   (state.ctLocalLinks[k] || {}).linked_bugs   || ct.linked_bugs   || [],
      related_items: (state.ctLocalLinks[k] || {}).related_items || ct.related_items || [],
      comments:      state.ctComments[k] || [],
    };
  });
}

// ── Per-story report ──────────────────────────────────────────────────────────

export function generateStoryReport(storyKey) {
  const subtasks = state.sprintData?.planning_subtasks || [];
  const story    = subtasks.find(ps => ps.story_key === storyKey);
  if (!story) return;

  const sprint = state.sprintData?.sprint?.name || '';
  const now    = fmtDateShort(new Date().toISOString());
  const cts    = enrichCts(story.cts, storyKey);
  const dist   = story.status_dist || {};
  const total  = story.ct_count   || 0;

  // Group by category
  const categories = [];
  const seen = new Map();
  for (const ct of cts) {
    const cat = ct.category || 'Sem categoria';
    if (!seen.has(cat)) { seen.set(cat, []); categories.push(cat); }
    seen.get(cat).push(ct);
  }

  const pending = cts.filter(ct => ct.ct_status === 'cancelado' || ct.ct_status === 'skipped');

  const ctRowHtml = ct => `
    <div class="ct-row">
      <div class="ct-row-top">
        <span class="ct-id">${esc(ct.id)}</span>
        <span class="ct-summary">${esc(ct.summary)}</span>
        <div class="ct-pills">${statusPill(ct.ct_status)} ${critPill(ct.criticality)}</div>
      </div>
      ${ctLinksHtml(ct)}
      ${ctCommentsHtml(ct)}
    </div>`;

  const categorySections = categories.map(cat => `
    <div class="cat-label">${esc(cat)}</div>
    ${seen.get(cat).map(ctRowHtml).join('')}
  `).join('');

  const pendingSection = pending.length ? `
    <div class="section">
      <div class="section-header">
        <h2>Pendências — Cancelados e Skipped</h2>
        <span class="count">${pending.length}</span>
      </div>
      <div class="section-body" style="padding:0 0 4px">
        <p style="padding:12px 20px 8px;font-size:12px;color:#64748b;border-bottom:1px solid #f1f5f9">
          Cenários não executados neste sprint. Avaliar como melhorias futuras.
        </p>
        ${pending.map(ct => `
          <div class="pending-card" style="margin:12px 16px">
            <div class="pending-card-header">
              <span class="ct-id">${esc(ct.id)}</span>
              ${statusPill(ct.ct_status)}
              ${critPill(ct.criticality)}
              <span style="font-size:12px;color:#1e293b;flex:1">${esc(ct.summary)}</span>
            </div>
            <div class="pending-card-body">
              ${ct.category ? `<div style="font-size:11px;color:#94a3b8;margin-bottom:8px">Categoria: ${esc(ct.category)}</div>` : ''}
              ${ctLinksHtml(ct)}
              ${ct.comments.length
                ? ctCommentsHtml(ct, false)
                : `<div class="no-notes" style="margin-top:4px">Sem observações registradas.</div>`}
            </div>
          </div>`).join('')}
      </div>
    </div>` : '';

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/>
  <title>Relatório — ${esc(storyKey)}</title>
  <style>${BASE_CSS}</style></head><body><div class="page">

  <div class="report-header">
    <div class="sprint-badge">${esc(sprint)}</div>
    <h1>${esc(story.story_summary || '(sem resumo)')}</h1>
    <div class="sub">${esc(storyKey)} · ${total} cenário${total !== 1 ? 's' : ''} · gerado em ${now}</div>
  </div>

  <div class="section">
    <div class="section-header"><h2>Distribuição de Status</h2></div>
    <div class="section-body">
      ${statusBarHtml(dist, total)}
    </div>
  </div>

  <div class="section">
    <div class="section-header">
      <h2>Cenários de Teste</h2>
      <span class="count">${total}</span>
    </div>
    <div style="padding:0">
      ${categorySections || '<div class="empty-state">Nenhum cenário encontrado.</div>'}
    </div>
  </div>

  ${pendingSection}

  <div class="report-footer">
    <span>QA Hub · ${esc(storyKey)}</span>
    <span>${esc(sprint)} · ${now}</span>
  </div>
  </div><script>window.print()<\/script></body></html>`;

  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
}

// ── Sprint report ─────────────────────────────────────────────────────────────

function buildPendingCts() {
  const subtasks = state.sprintData?.planning_subtasks || [];
  return subtasks.reduce((groups, story) => {
    const cts = enrichCts(story.cts, story.story_key)
      .filter(ct => ct.ct_status === 'cancelado' || ct.ct_status === 'skipped');
    if (cts.length) groups.push({ story_key: story.story_key, story_summary: story.story_summary, cts });
    return groups;
  }, []);
}

export function generateReport() {
  if (!state.sprintData) return;
  const d      = state.sprintData;
  const now    = fmtDateShort(new Date().toISOString());
  const tc     = d.test_completion;
  const rd     = d.risk_distribution || {};
  const bugs   = d.open_bugs || [];
  const blocked = d.blocked_stories || [];

  const recs = [];
  if (tc.pct < 80) recs.push(`Apenas ${tc.pct}% dos casos de teste concluídos. Priorize a execução antes do fim do sprint.`);
  if (blocked.length) recs.push(`${blocked.length} storie(s) bloqueada(s). Resolva os bugs críticos primeiro.`);
  if ((d.automation_candidates || []).length) {
    const top = d.automation_candidates[0];
    recs.push(`"${top.name}" acumulou ${top.bug_count} bug(s). Considere automação de regressão.`);
  }
  if (!recs.length) recs.push('Sprint com boa qualidade. Nenhuma ação corretiva crítica identificada.');

  const pendingGroups = buildPendingCts();
  const totalPending  = pendingGroups.reduce((n, g) => n + g.cts.length, 0);

  // Overall CT distribution across all stories
  const allDist  = {};
  let   allTotal = 0;
  (d.planning_subtasks || []).forEach(ps => {
    CT_ORDER.forEach(s => {
      allDist[s] = (allDist[s] || 0) + ((ps.status_dist || {})[s] || 0);
      allTotal  += ((ps.status_dist || {})[s] || 0);
    });
  });

  const bugRowsHtml = bugs.map(b => `
    <tr>
      <td style="font-weight:700;color:#6366f1;white-space:nowrap">${esc(b.key)}</td>
      <td>${esc(b.summary)}</td>
      <td>${esc(b.priority || '—')}</td>
      <td style="text-align:center">${b.days_open ?? '—'}d</td>
    </tr>`).join('');

  const pendingHtml = pendingGroups.map(g => `
    <div class="story-group">
      <div class="story-group-header">
        <span class="story-key-badge">${esc(g.story_key)}</span>
        <span class="story-title">${esc(g.story_summary || '')}</span>
        <span class="story-ct-count">${g.cts.length} CT${g.cts.length > 1 ? 's' : ''}</span>
      </div>
      ${g.cts.map(ct => `
        <div style="padding:12px 16px;border-bottom:1px solid #f8fafc;display:flex;flex-direction:column;gap:6px">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span style="font-weight:700;font-size:11px;color:#475569">${esc(ct.id)}</span>
            ${statusPill(ct.ct_status)}
            ${critPill(ct.criticality)}
            <span style="font-size:12px;color:#1e293b;flex:1">${esc(ct.summary)}</span>
          </div>
          ${ctLinksHtml(ct)}
          ${ct.comments.length
            ? ctCommentsHtml(ct, false)
            : `<div class="no-notes">Sem observações registradas.</div>`}
        </div>`).join('')}
    </div>`).join('');

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/>
  <title>Relatório — ${esc(d.sprint.name)}</title>
  <style>${BASE_CSS}</style></head><body><div class="page">

  <div class="report-header">
    <div class="sprint-badge">${esc(d.sprint.name)}</div>
    <h1>Relatório de Qualidade</h1>
    <div class="sub">gerado em ${now}</div>
  </div>

  <div class="metrics">
    <div class="metric"><div class="val" style="color:#6366f1">${tc.pct}%</div><div class="lbl">Testes concluídos</div></div>
    <div class="metric"><div class="val" style="color:#16a34a">${d.stories_done}/${d.stories_total}</div><div class="lbl">Histórias</div></div>
    <div class="metric"><div class="val" style="color:#dc2626">${bugs.length}</div><div class="lbl">Bugs abertos</div></div>
    <div class="metric"><div class="val" style="color:#ea580c">${blocked.length}</div><div class="lbl">Bloqueadas</div></div>
    <div class="metric"><div class="val" style="color:#8b5cf6">${totalPending}</div><div class="lbl">CTs pendentes</div></div>
  </div>

  <div class="section">
    <div class="section-header"><h2>Distribuição de Cenários de Teste</h2><span class="count">${allTotal} total</span></div>
    <div class="section-body">${allTotal ? statusBarHtml(allDist, allTotal) : '<span style="color:#94a3b8;font-size:12px">Nenhum cenário encontrado.</span>'}</div>
  </div>

  <div class="section">
    <div class="section-header"><h2>Distribuição de Risco</h2></div>
    <div class="section-body" style="padding:0">
      <table>
        <thead><tr><th>Nível</th><th style="text-align:center">Cenários</th></tr></thead>
        <tbody>
          <tr><td>${critPill('Crítica')}</td><td style="text-align:center;font-weight:700">${rd.critical||0}</td></tr>
          <tr><td>${critPill('Alta')}</td><td style="text-align:center;font-weight:700">${rd.high||0}</td></tr>
          <tr><td>${critPill('Média')}</td><td style="text-align:center;font-weight:700">${rd.medium||0}</td></tr>
          <tr><td>${critPill('Baixa')}</td><td style="text-align:center;font-weight:700">${rd.low||0}</td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <div class="section">
    <div class="section-header"><h2>Bugs Abertos</h2><span class="count">${bugs.length}</span></div>
    ${bugs.length ? `
    <div style="padding:0">
      <table>
        <thead><tr><th>Chave</th><th>Título</th><th>Prioridade</th><th style="text-align:center">Aberto há</th></tr></thead>
        <tbody>${bugRowsHtml}</tbody>
      </table>
    </div>` : '<div class="empty-state">Nenhum bug aberto neste sprint.</div>'}
  </div>

  <div class="section">
    <div class="section-header"><h2>Pendências — Cancelados e Skipped</h2><span class="count">${totalPending}</span></div>
    ${totalPending ? `
    <div class="section-body" style="padding:12px 16px 16px">
      <p style="font-size:12px;color:#64748b;margin-bottom:14px">Cenários não executados neste sprint, agrupados por história. Avaliar para melhorias futuras.</p>
      ${pendingHtml}
    </div>` : '<div class="empty-state">Nenhum CT cancelado ou skipped neste sprint.</div>'}
  </div>

  <div class="section">
    <div class="section-header"><h2>Recomendações</h2></div>
    <div class="section-body" style="display:flex;flex-direction:column;gap:0">
      ${recs.map(r => `<div class="rec"><span class="rec-arrow">→</span><span>${r}</span></div>`).join('')}
    </div>
  </div>

  <div class="report-footer">
    <span>QA Hub</span>
    <span>${esc(d.sprint.name)} · ${now}</span>
  </div>
  </div><script>window.print()<\/script></body></html>`;

  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
}
