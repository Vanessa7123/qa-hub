// App initialisation, project/sprint selection, data loading, metric cards.

import { state } from './state.js';
import { REFRESH_MS } from './config.js';
import { $ } from './utils.js';
import { fetchBoards, fetchSprints, fetchCtData } from './api.js';

// These are imported lazily to avoid circular references; charts/render modules
// import state but never import core.
let _renderFns = {};
export function registerRenderFns(fns) { Object.assign(_renderFns, fns); }

// ── Side navigation ───────────────────────────────────────────────────────────

export function snavClick(e, id) {
  e.preventDefault();
  const el = document.getElementById(id);
  if (!el) return;
  const top = el.getBoundingClientRect().top + window.scrollY - 72;
  window.scrollTo({ top, behavior: 'smooth' });
}

export function initSideNavObserver() {
  const SECTIONS = ['sec-overview','sec-issues','sec-bugs','sec-blocked','sec-cenarios','sec-andamento','sec-automacao','sec-historico'];
  const setActive = id => {
    document.querySelectorAll('.snav-item').forEach(a => {
      a.classList.toggle('active', a.getAttribute('href') === '#' + id);
    });
  };
  const obs = new IntersectionObserver(entries => {
    entries.forEach(entry => { if (entry.isIntersecting) setActive(entry.target.id); });
  }, { rootMargin: '-20% 0px -70% 0px', threshold: 0 });
  const waitAndObserve = () => SECTIONS.forEach(id => { const el = document.getElementById(id); if (el) obs.observe(el); });
  setTimeout(waitAndObserve, 200);
  const contentEl = document.getElementById('content');
  if (contentEl) {
    const mo = new MutationObserver(() => { waitAndObserve(); mo.disconnect(); });
    mo.observe(contentEl, { attributes: true, attributeFilter: ['style'] });
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

export async function init() {
  initSideNavObserver();
  const ctData = await fetchCtData();
  state.ctLocalLinks = ctData.links    || {};
  state.ctComments   = ctData.comments || {};
  await loadBoards();
  await loadSprintList();
  await reloadAll();
  setInterval(() => reloadAll('silent'), REFRESH_MS);
}

export async function loadBoards() {
  try {
    state.boards = await fetchBoards();
    const sel = $("projectSelect");
    sel.innerHTML = state.boards.map(b =>
      `<option value="${b.board_id}" ${b.board_id === state.selectedBoardId ? "selected" : ""}>${b.name}</option>`
    ).join("");
    if (state.boards.length && !state.selectedBoardId) {
      state.selectedBoardId = state.boards[0].board_id;
    }
  } catch(e) {
    console.error("Erro ao carregar projetos:", e);
  }
}

export function showReloadOverlay(msg, sub) {
  const el = $('reloadOverlay');
  $('reloadMsg').textContent = msg || 'Carregando sprint...';
  $('reloadSub').textContent = sub || '';
  el.classList.add('visible');
}
export function hideReloadOverlay() {
  $('reloadOverlay').classList.remove('visible');
}

export async function onProjectChange() {
  state.selectedBoardId = parseInt($("projectSelect").value) || state.selectedBoardId;
  const board = state.boards.find(b => b.board_id === state.selectedBoardId);
  showReloadOverlay(`Carregando ${board ? board.name : 'projeto'}...`, 'Buscando sprints e dados no Jira');
  await loadSprintList();
  await reloadAll(true);
}

export async function reloadAll(trigger) {
  const sprintId = $("sprintSelect").value || null;
  const sprint   = state.sprints.find(s => String(s.id) === String(sprintId));
  const silent   = trigger === 'silent';
  if (!silent) {
    const msg = trigger === true
      ? null
      : (sprint ? `Carregando ${sprint.name}...` : 'Atualizando dados...');
    if (msg) showReloadOverlay(msg, 'Buscando dados no Jira');
  }
  try {
    await Promise.all([
      loadSprintData(sprintId),
      _renderFns.loadBugData?.(),
      loadEnvStatus(),
      _renderFns.loadBugsHistory?.(),
    ]);
  } finally {
    if (!silent) hideReloadOverlay();
  }
  $("lastUpdate").textContent = "Atualizado às " +
    new Date().toLocaleTimeString("pt-BR", {hour:"2-digit",minute:"2-digit"});
}

// ── Sprint list ───────────────────────────────────────────────────────────────

export async function loadSprintList() {
  try {
    state.sprints = await fetchSprints(state.selectedBoardId);
    const sel    = $("sprintSelect");
    const bugSel = $("bugSprintSelect");
    sel.innerHTML = state.sprints.map(s =>
      `<option value="${s.id}" ${s.state==="active"?"selected":""}>${s.name}</option>`
    ).join("");
    bugSel.innerHTML = `<option value="">Sprint atual</option>
      <option value="__all__">Todos os sprints</option>` +
      state.sprints.map(s => `<option value="${s.id}">${s.name}</option>`).join("");
    updateSprintBadge();
  } catch(e) {
    console.error("Erro ao carregar sprints:", e);
  }
}

export function updateSprintBadge() {
  const sel    = $("sprintSelect");
  const sprint = state.sprints.find(s => String(s.id) === sel.value);
  if (!sprint) return;
  const badge = $("sprintStateBadge");
  badge.textContent = sprint.state === "active" ? "ativo" : "encerrado";
  badge.className   = "sprint-state-badge " + (sprint.state === "active" ? "state-active" : "state-closed");
}

export function onSprintChange() {
  updateSprintBadge();
  reloadAll();
}

// ── Sprint dashboard ──────────────────────────────────────────────────────────

export async function loadSprintData(sprintId) {
  const loadingEl = $("sprintSectionLoading");
  if (loadingEl) loadingEl.style.display = "flex";
  try {
    const boardParam = `board_id=${state.selectedBoardId}`;
    const url = sprintId
      ? `/api/sprint?sprint_id=${sprintId}&${boardParam}`
      : `/api/sprint?${boardParam}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(await res.text());
    state.sprintData = await res.json();
    renderMetricCards(state.sprintData);
    _renderFns.closeModal?.();
    _renderFns.initChartFilters?.();
    state.riskSelected = null;
    state.riskFilter   = "";
    state.riskSearch   = "";
    state.riskPage     = 0;
    _renderFns.renderRiskChart?.();
    _renderFns.renderRiskPanel?.();
    _renderFns.renderStoryProgress?.(state.sprintData.planning_subtasks);
    _renderFns.renderAutomation?.(state.sprintData.automation_candidates);
    _renderFns.renderBlockedStories?.(state.sprintData.blocked_stories);
    $("pageLoading").style.display = "none";
    $("content").style.display     = "block";
  } catch(e) {
    $("pageLoading").style.display = "none";
    $("pageError").style.display   = "block";
    $("pageError").innerHTML = `Erro ao carregar sprint:<br><code>${e.message}</code>`;
  } finally {
    if (loadingEl) loadingEl.style.display = "none";
  }
}

// ── Env status ────────────────────────────────────────────────────────────────

export async function loadEnvStatus() {
  try {
    const env   = await (await fetch("/api/env-status")).json();
    const badge = $("envBadge");
    badge.className = "env-badge " + env.status;
    $("envText").textContent = "Ambiente QA — " +
      (env.status === "online" ? "Online" : env.status === "offline" ? "Offline" : "Desconhecido");
  } catch(e) {}
}

// ── Metric cards ──────────────────────────────────────────────────────────────

export function renderMetricCards(d) {
  const tc   = d.test_completion;
  $("tcPct").textContent  = tc.pct + "%";
  $("tcSub").textContent  = `${tc.done} de ${tc.total} casos de teste`;
  $("tcBar").style.width  = tc.pct + "%";
  const barC = tc.pct >= 80 ? "#16a34a" : tc.pct >= 50 ? "#f59e0b" : "#ef4444";
  $("tcBar").style.background = $("tcPct").style.color = barC;

  const storiesPct  = d.stories_total ? Math.round(d.stories_done / d.stories_total * 100) : 0;
  const storiesBarC = storiesPct >= 80 ? "#16a34a" : storiesPct >= 50 ? "#f59e0b" : "#ef4444";
  $("storiesPct").textContent    = storiesPct + "%";
  $("storiesPct").style.color    = storiesBarC;
  $("storiesSub").textContent    = `${d.stories_done} de ${d.stories_total} histórias concluídas`;
  $("storiesBar").style.width      = storiesPct + "%";
  $("storiesBar").style.background = storiesBarC;

  $("bugsMetric").textContent = d.open_bugs.length;
  $("bugsSub").textContent    = "bugs abertos no sprint";

  $("blockedMetric").textContent = d.blocked_stories.length;
  $("blockedSub").textContent    = "stories bloqueadas";
  $("blockedCount").textContent  = d.blocked_stories.length;
}
