// Bug history chart — per-sprint bug/incident trend.

import { state } from './state.js';
import { $ } from './utils.js';

const BH_BUG  = "#ef4444";
const BH_INC  = "#7c3aed";
const BH_ACUM = "#2563eb";

export function bhToggle(series) {
  if (series === 'bugs')      state.bhShowBugs = !state.bhShowBugs;
  if (series === 'incidents') state.bhShowInc  = !state.bhShowInc;
  if (series === 'acum')      state.bhShowAcum = !state.bhShowAcum;
  const ids = { bugs: 'bhToggleBugs', incidents: 'bhToggleIncidents', acum: 'bhToggleAcum' };
  const on  = { bugs: state.bhShowBugs, incidents: state.bhShowInc, acum: state.bhShowAcum };
  $(ids[series]).classList.toggle('bh-on',   on[series]);
  $(ids[series]).classList.toggle('bh-off', !on[series]);
  renderBugsHistory();
}

export async function loadBugsHistory() {
  $("bhLoading").style.display = "block";
  $("bhError").style.display   = "none";
  try {
    const res  = await fetch(`/api/bugs-history?board_id=${state.selectedBoardId}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error || "Erro desconhecido");
    state.bugsHistory   = data.history || [];
    state.bhTotalAberto = data.totalAberto || 0;
    renderBugsHistory();
  } catch(e) {
    $("bhError").textContent   = "Erro ao carregar histórico: " + e.message;
    $("bhError").style.display = "block";
  } finally {
    $("bhLoading").style.display = "none";
  }
}

function bhLabel(d) {
  const m = d.sprintName.match(/sprint\s*(\d+)/i);
  return m ? `Sprint ${m[1]}` : d.sprintName.slice(0, 14);
}

export function renderBugsHistory() {
  if (!state.bugsHistory.length) return;
  const range  = parseInt($("bhRange").value) || 6;
  const data   = state.bugsHistory.slice(-range);
  const n      = data.length;
  const labels = data.map(bhLabel);
  const last   = data[n - 1];
  const prev   = n >= 2 ? data[n - 2] : null;

  // ── Metric cards ──
  $("bhMetricRow").style.display = "";
  const delta = (cur, pre) => {
    if (!pre) return `<span style="color:#94a3b8">— primeiro dado</span>`;
    const d = cur - pre;
    if (d > 0) return `<span style="color:#dc2626">↑ +${d} vs sprint anterior</span>`;
    if (d < 0) return `<span style="color:#16a34a">↓ ${d} vs sprint anterior</span>`;
    return `<span style="color:#94a3b8">→ igual à sprint anterior</span>`;
  };
  $("bhMBugs").textContent    = last.bugsTotal;
  $("bhMBugsDelta").innerHTML = delta(last.bugsTotal, prev?.bugsTotal);
  $("bhMInc").textContent     = last.incidentsTotal;
  $("bhMIncDelta").innerHTML  = delta(last.incidentsTotal, prev?.incidentsTotal);
  $("bhMAcum").textContent    = state.bhTotalAberto;
  $("bhMAcumDelta").innerHTML = `<span style="color:#94a3b8">em aberto no projeto</span>`;
  const media = Math.round(data.reduce((s, d) => s + d.bugsTotal, 0) / n);
  $("bhMMedia").textContent    = media;
  $("bhMMediaSub").textContent = `bugs · últimas ${n} sprints`;

  // ── Chart helpers ──
  const barColors = (col) => data.map((_, i) => i === n-1 ? col : col + "40");
  const ptColors  = (col, light) => data.map((_, i) => i === n-1 ? col : light);
  const ptRadius  = data.map((_, i) => i === n-1 ? 7 : 4);
  const tooltipOpts = {
    backgroundColor: "#0f172a", padding: 12,
    titleFont: { size: 12, weight: "700" }, bodyFont: { size: 12 },
    callbacks: {
      title: ctx => {
        const l = ctx[0].label;
        return l === bhLabel(last) ? "⭐ " + l + " (atual)" : l;
      },
    },
  };

  // ── Main chart ──
  if (state.bhMainChart) state.bhMainChart.destroy();
  const mainDS = [];
  if (state.bhShowBugs) mainDS.push({
    type: "bar", label: "Bugs", data: data.map(d => d.bugsTotal),
    backgroundColor: barColors(BH_BUG), borderRadius: 6, order: 2, yAxisID: "y",
  });
  if (state.bhShowInc) mainDS.push({
    type: "bar", label: "Incidents", data: data.map(d => d.incidentsTotal),
    backgroundColor: barColors(BH_INC), borderRadius: 6, order: 2, yAxisID: "y",
  });
  if (state.bhShowAcum) mainDS.push({
    type: "line", label: "Em aberto", data: data.map(d => d.bugsAbertos + d.incidentsAbertos),
    borderColor: BH_ACUM, backgroundColor: BH_ACUM + "12", borderWidth: 2.5,
    pointBackgroundColor: ptColors(BH_ACUM, "#93c5fd"), pointRadius: ptRadius,
    pointBorderColor: "#fff", pointBorderWidth: 2,
    fill: true, tension: 0.35, order: 1, yAxisID: "y2",
  });

  state.bhMainChart = new Chart($("bhMainChart"), {
    data: { labels, datasets: mainDS },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { display: false }, tooltip: tooltipOpts },
      scales: {
        x:  { grid: { color: "#f1f5f9" }, ticks: { font: { size: 11 }, color: "#94a3b8" } },
        y:  { position: "left",  beginAtZero: true, grid: { color: "#f1f5f9" },
              ticks: { font: { size: 11 }, color: "#94a3b8", stepSize: 2 },
              title: { display: true, text: "Total na sprint", font: { size: 10 }, color: "#94a3b8" } },
        y2: { position: "right", beginAtZero: true, grid: { drawOnChartArea: false },
              display: state.bhShowAcum,
              ticks: { font: { size: 11 }, color: BH_ACUM },
              title: { display: true, text: "Em aberto na sprint", font: { size: 10 }, color: BH_ACUM } },
      },
    },
  });

  // ── Trend chart ──
  if (state.bhTrendChart) state.bhTrendChart.destroy();
  const trendDS = [];
  if (state.bhShowBugs) trendDS.push({
    label: "Bugs", data: data.map(d => d.bugsTotal),
    borderColor: BH_BUG, backgroundColor: BH_BUG + "15", borderWidth: 2.5,
    pointBackgroundColor: ptColors(BH_BUG, "#fca5a5"), pointRadius: ptRadius,
    pointBorderColor: "#fff", pointBorderWidth: 2, fill: true, tension: 0.35,
  });
  if (state.bhShowInc) trendDS.push({
    label: "Incidents", data: data.map(d => d.incidentsTotal),
    borderColor: BH_INC, backgroundColor: BH_INC + "15", borderWidth: 2.5,
    pointBackgroundColor: ptColors(BH_INC, "#c4b5fd"), pointRadius: ptRadius,
    pointBorderColor: "#fff", pointBorderWidth: 2, fill: true, tension: 0.35,
  });

  state.bhTrendChart = new Chart($("bhTrendChart"), {
    type: "line", data: { labels, datasets: trendDS },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: true, position: "top", align: "end",
          labels: { font: { size: 11 }, color: "#475569", boxWidth: 8, boxHeight: 8, borderRadius: 4 } },
        tooltip: { backgroundColor: "#0f172a", padding: 10, bodyFont: { size: 12 } },
      },
      scales: {
        x: { grid: { color: "#f1f5f9" }, ticks: { font: { size: 10 }, color: "#94a3b8" } },
        y: { grid: { color: "#f1f5f9" }, ticks: { font: { size: 11 }, color: "#94a3b8", stepSize: 2 }, beginAtZero: true },
      },
    },
  });

  // ── Table ──
  const bestIdx = data.reduce((bi, d, i) =>
    (d.bugsTotal + d.incidentsTotal) < (data[bi].bugsTotal + data[bi].incidentsTotal) ? i : bi, 0);

  const pill = (v, isBest) => {
    const cls = isBest ? "bh-pill-green" : v === 0 ? "bh-pill-green" : "bh-pill-red";
    return `<span class="bh-pill ${cls}">${v}</span>`;
  };
  $("bhTableBody").innerHTML = data.map((d, i) => {
    const isLast = d.isActive || i === n - 1;
    const isBest = i === bestIdx;
    const fw     = isLast ? "font-weight:600;color:#1e293b;" : "color:#475569;";
    const name   = `${isLast ? "● " : ""}${bhLabel(d)}`;
    return `<tr style="${isLast ? "background:#fafafe;" : ""}">
      <td style="padding:10px 12px;border-bottom:1px solid #f8fafc;${fw}">${name}</td>
      <td style="text-align:center;padding:10px 12px;border-bottom:1px solid #f8fafc">${pill(d.bugsTotal, isBest && d.bugsTotal === 0)}</td>
      <td style="text-align:center;padding:10px 12px;border-bottom:1px solid #f8fafc"><span class="bh-pill ${d.incidentsTotal===0?"bh-pill-green":"bh-pill-purple"}">${d.incidentsTotal}</span></td>
      <td style="text-align:center;padding:10px 12px;border-bottom:1px solid #f8fafc">${d.cancelados>0?`<span class="bh-pill" style="background:#f1f5f9;color:#94a3b8">${d.cancelados}</span>`:`<span style="color:#cbd5e1;font-size:11px">—</span>`}</td>
    </tr>`;
  }).join("");
}
