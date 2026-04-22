// Story progress cards, CT status summary, story charts, Gherkin formatter.

import { state } from './state.js';
import {
  JIRA_BASE_URL,
  CT_STATUS_ORDER, CT_STATUS_COLORS, CT_STATUS_LABELS, CT_FINAL_STATUSES,
  CT_BAR_ORDER,
} from './config.js';
import { $ } from './utils.js';
import { saveCtData } from './api.js';

// Re-export for use by ct-detail.js and scenarios.js
export { CT_STATUS_ORDER, CT_STATUS_COLORS, CT_STATUS_LABELS };

// ── Chart factory (uses global Chart.js from CDN) ─────────────────────────────

function makeCenterPlugin(mainVal, subLabel) {
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

// ── Story chart helpers ───────────────────────────────────────────────────────

export function destroyStoryCharts() {
  Object.values(state.storyCharts).forEach(c => { try { c.destroy(); } catch(e){} });
  Object.keys(state.storyCharts).forEach(k => delete state.storyCharts[k]);
  Object.keys(state.storyCts).forEach(k => delete state.storyCts[k]);
}

export function initStoryChart(storyKey, statusDist) {
  const safeKey = storyKey.replace(/-/g, "_");
  const canvas  = document.getElementById("stChart_" + safeKey);
  if (!canvas) return;
  const statuses = CT_STATUS_ORDER.filter(s => statusDist[s]);
  const data     = statuses.map(s => statusDist[s] || 0);
  const total    = data.reduce((a, b) => a + b, 0);
  state.storyCharts[storyKey] = new Chart(canvas, {
    type: "doughnut",
    plugins: [makeCenterPlugin(total, "CTs")],
    data: {
      labels:   statuses.map(s => CT_STATUS_LABELS[s]),
      datasets: [{ data, backgroundColor: statuses.map(s => CT_STATUS_COLORS[s]), borderWidth: 2, borderColor: "#fff", hoverOffset: 6 }],
    },
    options: {
      cutout: "68%",
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.raw}` } },
      },
      onClick: (evt, elements) => {
        if (!elements.length) { window.openScenarioModal?.(storyKey, null); return; }
        window.openScenarioModal?.(storyKey, statuses[elements[0].index]);
      },
    },
  });
  canvas.style.cursor = "pointer";
}

function _storyPct(dist, total) {
  if (!total) return 0;
  const done = CT_STATUS_ORDER.filter(s => CT_FINAL_STATUSES.has(s))
    .reduce((sum, s) => sum + ((dist || {})[s] || 0), 0);
  return Math.round(done / total * 100);
}

function _storyLegendHTML(dist) {
  const items = CT_STATUS_ORDER
    .filter(s => (dist || {})[s])
    .map(s => `
      <div style="display:flex;align-items:center;gap:4px;font-size:11px">
        <span style="width:8px;height:8px;border-radius:50%;background:${CT_STATUS_COLORS[s]};flex-shrink:0"></span>
        <span style="color:#475569">${CT_STATUS_LABELS[s]}</span>
        <span style="font-weight:700;color:#1e293b">${dist[s]}</span>
      </div>`).join('');
  return items || '<div style="font-size:11px;color:#94a3b8">Nenhum cenário</div>';
}

function _storyBarsHTML(dist, total) {
  if (!total) return '';
  const d         = dist || {};
  const aprovado  = d['aprovado']  || 0;
  const cancelado = d['cancelado'] || 0;
  const skipped   = d['skipped']   || 0;
  const concluido = aprovado + cancelado + skipped;
  const pctConc   = Math.round(concluido / total * 100);
  const pctAprov  = Math.round(aprovado  / total * 100);

  const noteparts = [];
  if (skipped)   noteparts.push(`${skipped} skipped`);
  if (cancelado) noteparts.push(`${cancelado} cancelado${cancelado > 1 ? 's' : ''}`);
  const note = noteparts.length
    ? `<div style="font-size:10px;color:#6366f1;margin-top:4px">⚠ inclui ${noteparts.join(' e ')} (fora de escopo)</div>`
    : '';

  const bar1 = `
    <div style="display:flex;height:7px;border-radius:9999px;background:#f1f5f9;overflow:hidden;margin-top:5px">
      <div style="width:${pctConc}%;background:#16a34a;border-radius:9999px;transition:width .3s" title="Concluído: ${concluido} de ${total}"></div>
    </div>`;

  const segs = CT_BAR_ORDER.filter(s => d[s]).map((s, i, arr) => {
    const w       = (d[s] / total * 100).toFixed(2);
    const isFirst = i === 0, isLast = i === arr.length - 1;
    const r       = `border-radius:${isFirst ? '9999px' : '3px'} ${isLast ? '9999px' : '3px'} ${isLast ? '9999px' : '3px'} ${isFirst ? '9999px' : '3px'}`;
    return `<div style="height:100%;width:${w}%;background:${CT_STATUS_COLORS[s]};${r}" title="${CT_STATUS_LABELS[s]}: ${d[s]}"></div>`;
  }).join('');
  const bar2 = `
    <div style="display:flex;gap:2px;height:7px;background:#f1f5f9;border-radius:9999px;margin-top:5px;overflow:visible">
      ${segs}
    </div>`;

  const labelRow = (dot, label, pct, color) =>
    `<div style="display:flex;align-items:center;gap:6px;font-size:11px">
      <span style="width:8px;height:8px;border-radius:50%;background:${dot};flex-shrink:0"></span>
      <span style="color:#475569;flex:1">${label}</span>
      <span style="font-weight:700;color:${color}">${pct}%</span>
    </div>`;

  return `
    <div style="display:flex;flex-direction:column;gap:0">
      ${labelRow('#16a34a', 'Concluído', pctConc, '#15803d')}
      ${bar1}${note}
      <div style="margin-top:10px">
        ${labelRow('#16a34a', 'Aprovado', pctAprov, '#15803d')}
        ${bar2}
      </div>
    </div>`;
}

export function updateStoryCardUI(storyKey) {
  const ps      = state.storyCts[storyKey];
  if (!ps) return;
  const safeKey = storyKey.replace(/-/g, "_");
  const dist    = ps.status_dist || {};
  const total   = ps.ct_count    || 0;
  const legendEl = document.getElementById("stLegend_" + safeKey);
  const barsEl   = document.getElementById("stBars_"   + safeKey);
  if (legendEl) legendEl.innerHTML = _storyLegendHTML(dist);
  if (barsEl)   barsEl.innerHTML   = _storyBarsHTML(dist, total);
}

function renderStoryCard(ps) {
  const safeKey = (ps.story_key || "").replace(/-/g, "_");
  const total   = ps.ct_count   || 0;
  const dist    = ps.status_dist || {};
  return `
    <div style="border:1.5px solid #e2e8f0;border-radius:12px;padding:16px;background:#fff">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:14px;min-height:56px">
        <div style="min-width:0;flex:1">
          <a class="key-link" href="${JIRA_BASE_URL}${ps.story_key}" target="_blank" style="font-size:12px">${ps.story_key}</a>
          <div style="font-size:13px;color:#1e293b;font-weight:600;margin-top:2px;line-height:1.35">${ps.story_summary || '(sem resumo)'}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
          <span style="font-size:11px;color:#94a3b8;white-space:nowrap">${total} cenário${total!==1?"s":""}</span>
          <button onclick="generateStoryReport('${ps.story_key}')" style="font-size:10px;padding:3px 9px;border-radius:6px;border:1px solid #e2e8f0;background:#f8fafc;color:#6366f1;cursor:pointer;white-space:nowrap;font-weight:600" title="Gerar relatório desta história">Relatório</button>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:center;gap:0">
        <div style="width:200px;height:200px;position:relative"><canvas id="stChart_${safeKey}"></canvas></div>
      </div>
      <div id="stLegend_${safeKey}" style="display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;margin-top:12px;min-height:100px;align-content:start">
        ${_storyLegendHTML(dist)}
      </div>
      ${total ? `
      <div id="stBars_${safeKey}" style="margin-top:14px;padding-top:12px;border-top:1px solid #f1f5f9">
        ${_storyBarsHTML(dist, total)}
      </div>` : ""}
    </div>`;
}

function renderCtStatusSummary(planningSubtasks) {
  const totals = {};
  CT_STATUS_ORDER.forEach(s => { totals[s] = 0; });
  planningSubtasks.forEach(ps => {
    const dist = ps.status_dist || {};
    CT_STATUS_ORDER.forEach(s => { totals[s] += dist[s] || 0; });
  });
  const cards = CT_STATUS_ORDER.map(s => {
    const n      = totals[s];
    const color  = CT_STATUS_COLORS[s];
    const label  = CT_STATUS_LABELS[s];
    const active = n > 0;
    return `<div style="display:flex;flex-direction:column;align-items:center;gap:3px;padding:8px 14px;border-radius:10px;border:1.5px solid ${active ? color + '33' : '#e2e8f0'};background:${active ? color + '0d' : '#f8fafc'};min-width:72px;opacity:${active ? '1' : '0.45'}">
      <span style="font-size:18px;font-weight:700;color:${active ? color : '#94a3b8'};line-height:1">${n}</span>
      <span style="font-size:10px;font-weight:500;color:${active ? '#475569' : '#94a3b8'};white-space:nowrap;letter-spacing:.2px">${label}</span>
    </div>`;
  }).join('');
  return `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px">${cards}</div>`;
}

export function _saveCtLinks(storyKey, ctId, ct) {
  const k = `${storyKey}/${ctId}`;
  state.ctLocalLinks[k] = {
    linked_bugs:   (ct.linked_bugs   || []).slice(),
    related_items: (ct.related_items || []).slice(),
  };
  saveCtData(state.ctLocalLinks, state.ctComments).catch(() => {});
}

export function _restoreCtLinks(planningSubtasks) {
  planningSubtasks.forEach(ps => {
    (ps.cts || []).forEach(ct => {
      const k = `${ps.story_key}/${ct.id}`;
      if (state.ctLocalLinks[k]) {
        ct.linked_bugs   = state.ctLocalLinks[k].linked_bugs;
        ct.related_items = state.ctLocalLinks[k].related_items;
      }
    });
  });
}

export function renderStoryProgress(planningSubtasks) {
  destroyStoryCharts();
  const el = $("storyProgressSection");
  if (!planningSubtasks || !planningSubtasks.length) {
    el.innerHTML = '<div class="empty">Nenhuma história com planejamento de testes neste sprint.</div>';
    return;
  }
  _restoreCtLinks(planningSubtasks);
  el.innerHTML =
    renderCtStatusSummary(planningSubtasks) +
    `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:16px">
    ${planningSubtasks.map(ps => renderStoryCard(ps)).join("")}
  </div>`;
  planningSubtasks.forEach(ps => {
    if (ps.story_key) {
      state.storyCts[ps.story_key] = ps;
      initStoryChart(ps.story_key, ps.status_dist || {});
    }
  });
}

// ── Gherkin formatter ─────────────────────────────────────────────────────────

export function formatGherkin(lines) {
  if (!lines || !lines.length) return '<span style="font-size:12px;color:#94a3b8;font-style:italic">Sem conteúdo Gherkin.</span>';

  const PRIMARY = [
    { re: /^(Dado que)\b/i, color: '#3b82f6' },
    { re: /^(Dado)\b/i,     color: '#3b82f6' },
    { re: /^(Quando)\b/i,   color: '#8b5cf6' },
    { re: /^(Então|Entao)\b/i, color: '#16a34a' },
    { re: /^(Given)\b/i,    color: '#3b82f6' },
    { re: /^(When)\b/i,     color: '#8b5cf6' },
    { re: /^(Then)\b/i,     color: '#16a34a' },
  ];
  const CONT = [
    { re: /^(E que)\b/,    color: '#64748b' },
    { re: /^(E)\b/,        color: '#64748b' },
    { re: /^(And)\b/i,     color: '#64748b' },
    { re: /^(Mas|But)\b/i, color: '#f97316' },
  ];

  const upperFirst = s => { const c = (s || '')[0]; return !!c && c !== c.toLowerCase(); };
  const KW_RE = /\b(?:Dado que|Dado|Quando|Então|Entao|Given|When|Then)\b/gi;

  function splitAtUpperKeywords(text) {
    const splits = [0];
    let m;
    KW_RE.lastIndex = 0;
    while ((m = KW_RE.exec(text)) !== null) {
      if (m.index > 0 && upperFirst(text[m.index])) splits.push(m.index);
    }
    return splits.map((start, i) => text.slice(start, splits[i + 1]).trim()).filter(s => s);
  }

  const normalized = [];
  for (const line of lines) {
    for (const part of splitAtUpperKeywords(line.trim())) {
      const isPrim = upperFirst(part) && PRIMARY.some(k => k.re.test(part));
      const isCont = CONT.some(k => k.re.test(part));
      if (isPrim || isCont) normalized.push(part);
    }
  }

  const blocks = [];
  let current  = null;
  for (const seg of normalized) {
    const prim = upperFirst(seg) ? PRIMARY.find(k => k.re.test(seg)) : null;
    if (prim) {
      if (current) blocks.push(current);
      const m = seg.match(prim.re);
      current = { color: prim.color, keyword: m[1] || m[0], rest: seg.slice(m[0].length).trim(), continuations: [] };
      continue;
    }
    const cont = CONT.find(k => k.re.test(seg));
    if (cont && current) {
      const m = seg.match(cont.re);
      current.continuations.push({ color: cont.color, keyword: m[1] || m[0], rest: seg.slice(m[0].length).trim() });
    }
  }
  if (current) blocks.push(current);
  if (!blocks.length) return '<span style="font-size:12px;color:#94a3b8;font-style:italic">Sem conteúdo Gherkin.</span>';

  return blocks.map((block, i) => `
    <div style="${i > 0 ? 'margin-top:10px;padding-top:10px;border-top:1px solid #f1f5f9' : ''}">
      <div style="font-size:12px;line-height:1.7">
        <span style="font-weight:700;color:${block.color}">${block.keyword}</span><span style="color:#1e293b"> ${block.rest}</span>
      </div>
      ${block.continuations.map(c => `
        <div style="font-size:12px;line-height:1.7;padding-left:14px;margin-top:1px">
          <span style="font-weight:600;color:${c.color}">${c.keyword}</span><span style="color:#475569"> ${c.rest}</span>
        </div>`).join('')}
    </div>`).join('');
}
