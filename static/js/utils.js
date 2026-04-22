// Pure utility functions used across multiple modules.
// No side-effects, no direct DOM mutations (except makeChart which manages Chart.js instances).

import { state } from './state.js';
import { STATUS_COLORS, TYPE_COLORS, FMT_MAP } from './config.js';

// ── DOM shorthand ──────────────────────────────────────────────────────────────

/** getElementById shorthand */
export const $ = id => document.getElementById(id);

/** Safe color lookup with fallback */
export const cc = (map, key, fallback = "#64748b") => map[key] || fallback;


// ── Links ──────────────────────────────────────────────────────────────────────

/** Render a Jira issue key as a clickable link. */
export function jiraLink(key, baseUrl) {
  return `<a class="key-link" href="${baseUrl}${key}" target="_blank">${key}</a>`;
}


// ── Text formatting ────────────────────────────────────────────────────────────

/** Capitalise and apply display-name overrides for Jira statuses / types. */
export function fmt(s) {
  if (!s) return s;
  const key = s.toLowerCase();
  return FMT_MAP[key] ?? (s.charAt(0).toUpperCase() + s.slice(1).toLowerCase());
}

/** Escape HTML special characters to prevent XSS in innerHTML. */
export function escHtml(s) {
  return (s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}


// ── Pills & badges ─────────────────────────────────────────────────────────────

export function statusPill(name) {
  const c = cc(STATUS_COLORS, name, "#475569");
  return `<span class="status-pill" style="background:${c}22;color:${c}">${fmt(name)}</span>`;
}

export function typePill(name) {
  const cls =
    name === "Bug"                 ? "type-bug"     :
    name === "Bug (Experimental)"  ? "type-bug-exp" :
    name === "Incident"            ? "type-incident" : "";
  if (cls) return `<span class="pill ${cls}">${fmt(name)}</span>`;
  const c = cc(TYPE_COLORS, name);
  return `<span class="pill" style="background:${c}22;color:${c}">${fmt(name)}</span>`;
}

export function priorityPill(name) {
  const cls = "p-" + (name || "").toLowerCase().replace(/\s/g, "-");
  return `<span class="pill ${cls}" style="padding:2px 8px">${name}</span>`;
}

export function daysBadge(d) {
  if (d == null) return "—";
  const cls = d > 14 ? "days-hot" : d > 7 ? "days-warm" : "days-ok";
  return `<span class="${cls}">${d}d</span>`;
}


// ── Issue type icons (SVG) ─────────────────────────────────────────────────────

export function issueTypeIcon(type, size = 14) {
  const t = (type || '').toLowerCase();
  if (t.includes('incident') || t.includes('incidente'))
    return `<svg width="${size}" height="${size}" viewBox="0 0 16 16" style="flex-shrink:0">
      <circle cx="8" cy="8" r="8" fill="#F4511E"/>
      <path d="M8.5 3C8.5 3 10.5 5.8 10.5 8.2C10.5 9.6 9.4 10.5 8 10.5C6.6 10.5 5.5 9.6 5.5 8.2 5.5 8.2 5 9 5 10 5 11.9 6.3 13 8 13 9.7 13 11 11.9 11 10 11 7.2 8.5 3 8.5 3Z" fill="white"/></svg>`;
  if (t.includes('bug'))
    return `<svg width="${size}" height="${size}" viewBox="0 0 16 16" style="flex-shrink:0">
      <circle cx="8" cy="8" r="8" fill="#E53935"/>
      <ellipse cx="8" cy="9.2" rx="2.4" ry="2.9" fill="white"/>
      <rect x="6.5" y="4.5" width="3" height="2.4" rx="1.5" fill="white"/>
      <line x1="5.6" y1="7.8" x2="3.5" y2="6.8" stroke="white" stroke-width="1.1" stroke-linecap="round"/>
      <line x1="10.4" y1="7.8" x2="12.5" y2="6.8" stroke="white" stroke-width="1.1" stroke-linecap="round"/>
      <line x1="5.8" y1="10.2" x2="3.8" y2="11.2" stroke="white" stroke-width="1.1" stroke-linecap="round"/>
      <line x1="10.2" y1="10.2" x2="12.2" y2="11.2" stroke="white" stroke-width="1.1" stroke-linecap="round"/></svg>`;
  if (t.includes('epic'))
    return `<svg width="${size}" height="${size}" viewBox="0 0 16 16" style="flex-shrink:0">
      <circle cx="8" cy="8" r="8" fill="#904EE2"/>
      <path d="M9 3L5 9h4l-2 4 6-7H9l1-3z" fill="white"/></svg>`;
  if (t.includes('story') || t.includes('história') || t.includes('historia') || t.includes('melhoria'))
    return `<svg width="${size}" height="${size}" viewBox="0 0 16 16" style="flex-shrink:0">
      <circle cx="8" cy="8" r="8" fill="#2D8A4E"/>
      <path d="M5.5 3.5h5a.5.5 0 01.5.5v8l-3-2-3 2V4a.5.5 0 01.5-.5z" fill="white"/></svg>`;
  return `<svg width="${size}" height="${size}" viewBox="0 0 16 16" style="flex-shrink:0">
    <circle cx="8" cy="8" r="8" fill="#94a3b8"/>
    <rect x="5" y="5" width="6" height="6" rx="1" fill="white"/></svg>`;
}


// ── Chart.js helpers ───────────────────────────────────────────────────────────

/**
 * Create (or replace) a Chart.js chart.
 * Stores the instance in state.charts[id] so it can be destroyed on re-render.
 */
export function makeChart(id, type, labels, data, colors, options = {}) {
  if (state.charts[id]) state.charts[id].destroy();
  state.charts[id] = new Chart($(id), {
    type,
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderWidth: 2,
        borderColor: "#fff",
        borderRadius: type === "bar" ? 6 : 0,
        borderSkipped: false,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: type !== "bar",
          position: "right",
          labels: { boxWidth: 10, font: { size: 11 } },
        },
      },
      scales: type === "bar" ? {
        x: { grid: { color: "#f1f5f9" }, ticks: { precision: 0, font: { size: 11 } } },
        y: { grid: { display: false }, ticks: { font: { size: 11 } } },
      } : {},
      ...options,
    },
  });
  return state.charts[id];
}
