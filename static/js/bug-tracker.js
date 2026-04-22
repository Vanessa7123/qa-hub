// Bug tracker section — loading, filters, table and chart rendering.

import { state } from './state.js';
import {
  JIRA_BASE_URL,
  STATUS_COLORS, TYPE_COLORS,
  STATUS_SORT_ORDER, TYPE_ORDER,
} from './config.js';
import { $, cc, fmt, statusPill, typePill, priorityPill, daysBadge, jiraLink } from './utils.js';
import { applySortOrder, makeCenterPlugin, buildTagsHtml } from './charts.js';

const BUG_TYPE_LIST = ["Bug", "Bug (Experimental)", "Incident"];

// ── Data loading ───────────────────────────────────────────────────────────────

export async function loadBugData() {
  const loadingEl = $("bugSectionLoading");
  if (loadingEl) loadingEl.style.display = "flex";
  const sel = $("bugSprintSelect").value;
  const bp  = `board_id=${state.selectedBoardId}`;
  let url;
  if (sel === "__all__")  url = `/api/bugs?scope=all&${bp}`;
  else if (sel)           url = `/api/bugs?sprint_id=${sel}&${bp}`;
  else                    url = `/api/bugs?${bp}`;

  try {
    const res = await fetch(url);
    state.bugData = await res.json();
    state.bugFTypeAll = true;   state.bugFTypeFilter.clear();
    state.bugFStatusAll = true; state.bugFStatusFilter.clear();
    state.bugChartSelected = null; state.bugChartHighlighted = null;
    state.bugSort = { col: null, dir: null };
    state.bugSortCache = null;
    rebuildBugFilterOpts();
    renderBugTable();
  } catch(e) {
    console.error("Erro ao carregar bugs:", e);
  } finally {
    if (loadingEl) loadingEl.style.display = "none";
  }
}

export function onBugSprintChange() { loadBugData(); }

// ── Filter option builders ─────────────────────────────────────────────────────

export function rebuildBugFilterOpts() {
  if (!state.bugData) return;
  const typeCnt   = state.bugData.bugs.reduce((a, b) => { a[b.type]   = (a[b.type]  ||0)+1; return a; }, {});
  const statusCnt = state.bugData.bugs.reduce((a, b) => { a[b.status] = (a[b.status]||0)+1; return a; }, {});
  const allStatuses = [...new Set(state.bugData.bugs.map(b => b.status))]
    .sort((a, b) => (STATUS_SORT_ORDER[a.toLowerCase()]??99) - (STATUS_SORT_ORDER[b.toLowerCase()]??99));

  const bugTypesWithData    = BUG_TYPE_LIST.filter(k => (typeCnt[k]||0) > 0);
  const bugTypesWithoutData = BUG_TYPE_LIST.filter(k => (typeCnt[k]||0) === 0);
  const divider = `<div style="border-top:1px solid #e2e8f0;margin:4px 0"></div>`;

  function typeOptHtml(k, cnt) {
    const safeK   = k.replace(/'/g,"\\'");
    const checked = state.bugFTypeAll || state.bugFTypeFilter.has(k);
    const dim     = cnt === 0 ? "opacity:0.45;pointer-events:none;" : "";
    return `<label class="ms-option ms-option-sub" style="${dim}">
      <input type="checkbox" ${checked?"checked":""}${cnt===0?" disabled":""} onchange="bugOnTypeChange('${safeK}',this.checked)">
      <span class="dot" style="background:${cc(TYPE_COLORS,k)}"></span>
      <span style="flex:1">${fmt(k)}</span>
      <span style="font-size:11px;color:#94a3b8;margin-left:4px">${cnt}</span>
    </label>`;
  }

  $("bugTypeFOptions").innerHTML =
    `<label class="ms-option ms-option-todos">
      <input type="checkbox" ${state.bugFTypeAll?"checked":""} onchange="bugOnTypeAllChange(this.checked)">
      <span style="flex:1">Todos</span>
    </label>` +
    bugTypesWithData.map(k => typeOptHtml(k, typeCnt[k]||0)).join("") +
    (bugTypesWithoutData.length ? divider + bugTypesWithoutData.map(k => typeOptHtml(k, 0)).join("") : "");

  $("bugStatusFOptions").innerHTML =
    `<label class="ms-option ms-option-todos">
      <input type="checkbox" ${state.bugFStatusAll?"checked":""} onchange="bugOnStatusAllChange(this.checked)">
      <span style="flex:1">Todos</span>
    </label>` +
    allStatuses.map(k => {
      const safeK   = k.replace(/'/g,"\\'");
      const cnt     = statusCnt[k]||0;
      const checked = state.bugFStatusAll || state.bugFStatusFilter.has(k);
      return `<label class="ms-option ms-option-sub">
        <input type="checkbox" ${checked?"checked":""} onchange="bugOnStatusChange('${safeK}',this.checked)">
        <span class="dot" style="background:${cc(STATUS_COLORS,k)}"></span>
        <span style="flex:1">${fmt(k)}</span>
        <span style="font-size:11px;color:#94a3b8;margin-left:4px">${cnt}</span>
      </label>`;
    }).join("");

  const tb = $("bugTypeFBtn");
  tb.textContent = state.bugFTypeAll ? "Tipo ▾" : `Tipo (${state.bugFTypeFilter.size}) ▾`;
  tb.classList.toggle("has-filter", !state.bugFTypeAll);

  const sb = $("bugStatusFBtn");
  sb.textContent = state.bugFStatusAll ? "Status ▾" : `Status (${state.bugFStatusFilter.size}) ▾`;
  sb.classList.toggle("has-filter", !state.bugFStatusAll);

  renderBugFilterTags();
}

export function renderBugFilterTags() {
  const el = $("bugFilterTags");
  if (!el) return;

  let typeHtml;
  if (state.bugChartHighlighted) {
    const tc   = cc(TYPE_COLORS, state.bugChartHighlighted);
    const safeT = state.bugChartHighlighted.replace(/'/g,"\\'");
    typeHtml = `<span class="ftag" style="background:${tc}22;color:${tc}"><span class="ftag-dot" style="background:${tc}"></span>${fmt(state.bugChartHighlighted)}<span class="ftag-x" onclick="selectBugDrillType('${safeT}')">✕</span></span>`;
  } else if (!state.bugFTypeAll && state.bugFTypeFilter.size > 0) {
    typeHtml = buildTagsHtml(state.bugFTypeFilter, TYPE_COLORS, "removeBugTypeTag");
  } else if (!state.bugFTypeAll) {
    typeHtml = '<span class="ftag" style="background:#fee2e2;color:#dc2626;border-color:#fecaca">Nenhum selecionado</span>';
  } else {
    typeHtml = '<span class="ftag ftag-all">Todos</span>';
  }

  let statusHtml;
  if (state.bugChartSelected) {
    const sc   = cc(STATUS_COLORS, state.bugChartSelected);
    const safeS = state.bugChartSelected.replace(/'/g,"\\'");
    statusHtml = `<span class="ftag" style="background:${sc}22;color:${sc}"><span class="ftag-dot" style="background:${sc}"></span>${fmt(state.bugChartSelected)}<span class="ftag-x" onclick="selectBugChartStatus('${safeS}')">✕</span></span>`;
  } else if (!state.bugFStatusAll && state.bugFStatusFilter.size > 0) {
    statusHtml = buildTagsHtml(state.bugFStatusFilter, STATUS_COLORS, "removeBugStatusTag");
  } else if (!state.bugFStatusAll) {
    statusHtml = '<span class="ftag" style="background:#fee2e2;color:#dc2626;border-color:#fecaca">Nenhum selecionado</span>';
  } else {
    statusHtml = '<span class="ftag ftag-all">Todos</span>';
  }

  el.innerHTML =
    `<div class="ftag-group"><span class="ftag-group-label">Tipo:</span>${typeHtml}</div>` +
    `<div class="ftag-group"><span class="ftag-group-label">Status:</span>${statusHtml}</div>`;
}

export function removeBugTypeTag(key) {
  state.bugFTypeFilter.delete(key);
  if (state.bugFTypeFilter.size === 0) state.bugFTypeAll = true;
  rebuildBugFilterOpts(); renderBugTable();
}

export function removeBugStatusTag(key) {
  state.bugFStatusFilter.delete(key);
  if (state.bugFStatusFilter.size === 0) state.bugFStatusAll = true;
  rebuildBugFilterOpts(); renderBugTable();
}

export function bugOnTypeAllChange(checked) {
  state.bugFTypeAll = checked;
  if (checked) {
    state.bugFTypeFilter.clear();
  } else {
    const typeCnt = state.bugData
      ? state.bugData.bugs.reduce((a,b)=>{ a[b.type]=(a[b.type]||0)+1; return a; }, {})
      : {};
    state.bugFTypeFilter = new Set(BUG_TYPE_LIST.filter(t => (typeCnt[t]||0) > 0));
  }
  rebuildBugFilterOpts(); renderBugTable();
}

export function bugOnTypeChange(key, checked) {
  const typeCnt   = state.bugData ? state.bugData.bugs.reduce((a,b)=>{ a[b.type]=(a[b.type]||0)+1; return a; }, {}) : {};
  const activeTypes = BUG_TYPE_LIST.filter(t => (typeCnt[t]||0) > 0);
  if (checked) {
    if (!state.bugFTypeAll) {
      state.bugFTypeFilter.add(key);
      if (activeTypes.every(t => state.bugFTypeFilter.has(t))) {
        state.bugFTypeAll = true; state.bugFTypeFilter.clear();
      }
    }
  } else {
    if (state.bugFTypeAll) {
      state.bugFTypeFilter = new Set(activeTypes.filter(t => t !== key));
      state.bugFTypeAll = false;
    } else {
      state.bugFTypeFilter.delete(key);
    }
  }
  rebuildBugFilterOpts(); renderBugTable();
}

export function bugDeselectAllType() {
  state.bugFTypeAll = false; state.bugFTypeFilter.clear();
  rebuildBugFilterOpts(); renderBugTable();
}

export function bugOnStatusAllChange(checked) {
  state.bugFStatusAll = checked;
  if (checked) state.bugFStatusFilter.clear();
  rebuildBugFilterOpts(); renderBugTable();
}

export function bugOnStatusChange(key, checked) {
  const allSt = [...new Set(state.bugData.bugs.map(b => b.status))];
  if (checked) {
    if (!state.bugFStatusAll) {
      state.bugFStatusFilter.add(key);
      if (allSt.every(s => state.bugFStatusFilter.has(s))) {
        state.bugFStatusAll = true; state.bugFStatusFilter.clear();
      }
    }
  } else {
    if (state.bugFStatusAll) {
      state.bugFStatusFilter = new Set(allSt.filter(s => s !== key));
      state.bugFStatusAll = false;
    } else {
      state.bugFStatusFilter.delete(key);
    }
  }
  rebuildBugFilterOpts(); renderBugTable();
}

export function bugDeselectAllStatus() {
  state.bugFStatusAll = false; state.bugFStatusFilter.clear();
  rebuildBugFilterOpts(); renderBugTable();
}

// ── Sort ───────────────────────────────────────────────────────────────────────

export function setBugSort(col) {
  if (state.bugSort.col === col) {
    if (state.bugSort.dir === "asc") state.bugSort.dir = "desc";
    else { state.bugSort = { col: null, dir: null }; }
  } else {
    state.bugSort = { col, dir: "asc" };
    state.bugSortCache = null;
  }
  renderBugTable();
}

// ── Chart click ────────────────────────────────────────────────────────────────

export function selectBugChartStatus(status) {
  if (state.bugChartSelected === status) {
    state.bugChartSelected = null; state.bugChartHighlighted = null;
  } else {
    state.bugChartSelected = status; state.bugChartHighlighted = null;
  }
  renderBugTable();
}

export function selectBugDrillType(type) {
  state.bugChartHighlighted = (state.bugChartHighlighted === type) ? null : type;
  renderBugTable();
}

// ── Table render ───────────────────────────────────────────────────────────────

export function renderBugTable() {
  if (!state.bugData) return;
  const search = ($("bugSearch") || {}).value?.toLowerCase() || "";

  const base = state.bugData.bugs.filter(b =>
    (state.bugFTypeAll   || state.bugFTypeFilter.has(b.type)) &&
    (state.bugFStatusAll || state.bugFStatusFilter.has(b.status)) &&
    (!search || b.key.toLowerCase().includes(search) || b.summary.toLowerCase().includes(search))
  );

  const statusCnt = base.reduce((a,b)=>{ a[b.status]=(a[b.status]||0)+1; return a; }, {});
  const typeCnt   = base.reduce((a,b)=>{ a[b.type]  =(a[b.type]  ||0)+1; return a; }, {});
  renderBugCharts(statusCnt, typeCnt, base);

  let filtered = base;
  if (state.bugChartSelected) {
    filtered = base.filter(b => b.status === state.bugChartSelected);
    if (state.bugChartHighlighted) {
      filtered = filtered.filter(b => b.type === state.bugChartHighlighted);
    }
  }

  const countEl = $("bugTrackerCount");
  if (countEl) countEl.textContent = filtered.length;
  const tableCountEl = $("bugTableCount");
  if (tableCountEl) tableCountEl.textContent = `Exibindo ${filtered.length} de ${state.bugData.bugs.length}`;

  const { col, dir } = state.bugSort;
  let sorted;
  if (col && dir) {
    sorted = applySortOrder(filtered, col, dir);
    state.bugSortCache = sorted.map(b => b.key);
  } else if (state.bugSortCache) {
    const order = new Map(state.bugSortCache.map((k, i) => [k, i]));
    sorted = [...filtered].sort((a, b) => (order.get(a.key)??999) - (order.get(b.key)??999));
  } else {
    sorted = filtered;
  }

  const si = c => {
    const active = col === c && dir;
    const icon   = active ? (dir === "asc" ? "↑" : "↓") : "↕";
    return `<span class="sort-icon${active?" active":""}">${icon}</span>`;
  };

  const headEl = $("bugTrackerHead");
  if (headEl) headEl.innerHTML = `
    <th class="sp-sort-th" onclick="setBugSort('type')">Tipo${si("type")}</th>
    <th class="sp-sort-th" onclick="setBugSort('key')">Chave${si("key")}</th>
    <th class="sp-sort-th" onclick="setBugSort('summary')">Título${si("summary")}</th>
    <th class="sp-sort-th" onclick="setBugSort('status')">Status${si("status")}</th>
    <th class="sp-sort-th" onclick="setBugSort('priority')">Prioridade${si("priority")}</th>
    <th class="sp-sort-th" onclick="setBugSort('days_open')">Dias aberto${si("days_open")}</th>
    <th class="sp-sort-th" onclick="setBugSort('assignee')">Responsável${si("assignee")}</th>
    <th>Relacionamentos</th>`;

  const bodyEl = $("bugTrackerBody");
  if (!bodyEl) return;

  if (!sorted.length) {
    bodyEl.innerHTML = `<tr><td colspan="8"><div class="empty">Nenhum resultado.</div></td></tr>`;
    return;
  }

  bodyEl.innerHTML = sorted.map(b => {
    const rels = b.relationships?.length
      ? `<div class="rel-chips">${b.relationships.map(r =>
          `<span class="rel-chip">${jiraLink(r.key, JIRA_BASE_URL)} <span class="rel-chip-type">${r.type}</span></span>`
        ).join("")}</div>`
      : `<span style="color:#94a3b8">—</span>`;
    return `<tr>
      <td>${typePill(b.type)}</td>
      <td>${jiraLink(b.key, JIRA_BASE_URL)}</td>
      <td class="truncate" title="${b.summary}">${b.summary}</td>
      <td>${statusPill(b.status)}</td>
      <td>${priorityPill(b.priority)}</td>
      <td>${daysBadge(b.days_open)}</td>
      <td style="color:#64748b;font-size:12px;white-space:nowrap">${b.assignee}</td>
      <td>${rels}</td>
    </tr>`;
  }).join("");

  const scrollEl = $("bugTableScroll");
  const wrapEl   = $("bugListWrap");
  if (scrollEl && wrapEl) {
    const updateFade = () => {
      const atBottom = scrollEl.scrollHeight - scrollEl.scrollTop <= scrollEl.clientHeight + 4;
      wrapEl.classList.toggle("has-more", scrollEl.scrollHeight > scrollEl.clientHeight && !atBottom);
    };
    scrollEl.onscroll = updateFade;
    requestAnimationFrame(updateFade);
  }
}

// ── Chart render ───────────────────────────────────────────────────────────────

function renderBugCharts(statusCount, typeCount, allBase) {
  const mainTitleEl = $("bugChartMainTitle");
  if (mainTitleEl) mainTitleEl.textContent = state.bugChartSelected ? `Tipo em: ${fmt(state.bugChartSelected)}` : "Bugs & Incidentes";

  if (state.bugChartSelected) {
    const drillBugs   = allBase.filter(b => b.status === state.bugChartSelected);
    const drillTypeCnt = drillBugs.reduce((a,b) => { a[b.type]=(a[b.type]||0)+1; return a; }, {});
    const dKeys  = Object.keys(drillTypeCnt).sort((a,b) => (TYPE_ORDER[a]??99) - (TYPE_ORDER[b]??99));
    const dTotal = dKeys.reduce((s,k) => s + drillTypeCnt[k], 0);

    const dColors  = dKeys.map(k => {
      const base = cc(TYPE_COLORS, k);
      return (state.bugChartHighlighted && k !== state.bugChartHighlighted) ? base+"40" : base;
    });
    const dOffsets = dKeys.map(k => state.bugChartHighlighted === k ? 10 : 0);

    if (state.charts["bugStatusChart"]) state.charts["bugStatusChart"].destroy();
    state.charts["bugStatusChart"] = new Chart($("bugStatusChart"), {
      type: "doughnut",
      data: {
        labels: dKeys.map(fmt),
        datasets: [{ data: dKeys.map(k=>drillTypeCnt[k]), backgroundColor: dColors, borderWidth: 2, borderColor: "#fff", offset: dOffsets }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: "65%",
        plugins: { legend: { display: false } },
        onClick(evt) {
          const pts = state.charts["bugStatusChart"].getElementsAtEventForMode(evt,"nearest",{intersect:true},false);
          if (!pts.length) return;
          selectBugDrillType(dKeys[pts[0].index]);
        },
        onHover(evt) { evt.native.target.style.cursor = "pointer"; },
      },
      plugins: [makeCenterPlugin(
        String(state.bugChartHighlighted ? drillTypeCnt[state.bugChartHighlighted]||0 : dTotal),
        `de ${allBase.length}`
      )],
    });

    renderBugFilterTags();

    const sc    = cc(STATUS_COLORS, state.bugChartSelected);
    const safeK0 = state.bugChartSelected.replace(/'/g,"\\'");
    const legendEl = $("bugStatusLegend");
    if (legendEl) legendEl.innerHTML =
      `<div class="legend-row selected" onclick="selectBugChartStatus('${safeK0}')" style="cursor:pointer">
        <span class="legend-dot" style="background:${sc}"></span>
        <span class="legend-label">${fmt(state.bugChartSelected)}</span>
        <span class="legend-count">${statusCount[state.bugChartSelected]||0}</span>
      </div>
      <div class="sp-sub-legend">` +
      dKeys.map(k => {
        const c    = cc(TYPE_COLORS, k);
        const isSel = state.bugChartHighlighted === k;
        const fade  = state.bugChartHighlighted && !isSel;
        const safeK = k.replace(/'/g,"\\'");
        return `<div class="sp-sub-legend-row${isSel?" selected":""}" style="cursor:pointer" onclick="selectBugDrillType('${safeK}')">
          <span class="legend-dot" style="background:${c};width:8px;height:8px;opacity:${fade?0.35:1}"></span>
          <span class="legend-label" style="opacity:${fade?0.4:1}">${fmt(k)}</span>
          <span class="legend-count">${drillTypeCnt[k]}</span>
        </div>`;
      }).join("") + `</div>`;

  } else {
    const sKeys = Object.keys(statusCount)
      .sort((a,b) => (STATUS_SORT_ORDER[a.toLowerCase()]??99) - (STATUS_SORT_ORDER[b.toLowerCase()]??99));
    const total = sKeys.reduce((s,k) => s + statusCount[k], 0);

    if (state.charts["bugStatusChart"]) state.charts["bugStatusChart"].destroy();
    state.charts["bugStatusChart"] = new Chart($("bugStatusChart"), {
      type: "doughnut",
      data: {
        labels: sKeys.map(fmt),
        datasets: [{ data: sKeys.map(k=>statusCount[k]), backgroundColor: sKeys.map(k=>cc(STATUS_COLORS,k)), borderWidth: 2, borderColor: "#fff" }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: "65%",
        plugins: { legend: { display: false } },
        onClick(evt) {
          const pts = state.charts["bugStatusChart"].getElementsAtEventForMode(evt,"nearest",{intersect:true},false);
          if (!pts.length) return;
          selectBugChartStatus(sKeys[pts[0].index]);
        },
        onHover(evt) { evt.native.target.style.cursor = "pointer"; },
      },
      plugins: [makeCenterPlugin(String(total), "issues")],
    });

    renderBugFilterTags();

    const legendEl = $("bugStatusLegend");
    if (legendEl) legendEl.innerHTML = sKeys.map(k => {
      const c    = cc(STATUS_COLORS, k);
      const safeK = k.replace(/'/g,"\\'");
      return `<div class="legend-row" onclick="selectBugChartStatus('${safeK}')" style="cursor:pointer">
        <span class="legend-dot" style="background:${c}"></span>
        <span class="legend-label">${fmt(k)}</span>
        <span class="legend-count">${statusCount[k]}</span>
      </div>`;
    }).join("");
  }
}
