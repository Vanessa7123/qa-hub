// Central mutable state for the entire application.
//
// All modules import this object and read/write its properties directly.
// Keeping state in one place makes it easy to see what data flows where
// and avoids hidden global variables scattered across files.
//
// Usage:
//   import { state } from './state.js';
//   state.selectedBoardId = 514;
//   const data = state.sprintData;

export const state = {

  // ── Boards & sprint selection ──────────────────────────────────────────────
  boards:          [],     // list of {board_id, project, name} from /api/boards
  selectedBoardId: null,   // set after boards are loaded (first board is default)
  sprints:         [],     // list of {id, name, state} from /api/sprints
  selectedSprintId: null,

  // ── Sprint dashboard data ──────────────────────────────────────────────────
  sprintData: null,        // full response from /api/sprint

  // ── Bug tracker data ───────────────────────────────────────────────────────
  bugData: null,           // full response from /api/bugs

  // ── Chart instances (Chart.js) ─────────────────────────────────────────────
  charts: {},              // { chartId: Chart instance }

  // ── Issues chart filters (status / type / assignee) ───────────────────────
  csStatusFilter:       new Set(),  // statuses explicitly selected (empty = show all)
  csAllSelected:        true,       // true = "Todos" mode
  csTypeFilter:         new Set(),  // types explicitly selected (empty = show all)
  csTypeAllSelected:    true,
  csHighlightedStatus:  null,       // status highlighted via drill-down (null = none)
  csAssigneeFilter:     new Set(),  // selected assignees (empty = all)
  csAssigneeAllSelected: true,

  // ── Type chart filter ──────────────────────────────────────────────────────
  ctTypeFilter: new Set(),          // issue types to show in type chart (empty = all)

  // ── Side panel ────────────────────────────────────────────────────────────
  sidePanelIssues:    [],
  sidePanelSort:      { col: null, dir: null },
  sidePanelSortCache: null,         // frozen order after 3rd click on same column

  // ── Risk panel ────────────────────────────────────────────────────────────
  riskSelected: null,
  riskPage:     0,
  riskFilter:   "",                 // story key filter
  riskSearch:   "",                 // free-text search on scenario name
  riskSortCol:  null,               // "story"|"category"|"criticality"|"id"|"summary"
  riskSortDir:  "asc",

  // ── Story progress (CT detail) ─────────────────────────────────────────────
  storyCharts: {},                  // { storyKey: Chart instance }
  storyCts:    {},                  // { storyKey: planning subtask data }

  // ── CT detail & bug linking ────────────────────────────────────────────────
  selectedCt:       null,           // { ct, subtaskKey, storyKey }
  ctBugResults:     [],
  ctBugSearchTimer: null,
  ctBugSearchSeq:   0,
  ctRelResults:     [],
  ctRelSearchTimer: null,
  ctRelSearchSeq:   0,
  workflowExpanded: false,

  // Persisted server-side (loaded on init via /api/ct/data)
  ctLocalLinks: {},   // { "storyKey/ctId": { linked_bugs: [], related_items: [] } }
  ctComments:   {},   // { "storyKey/ctId": [{id, text, createdAt, updatedAt}] }

  // ── Scenario table filters ─────────────────────────────────────────────────
  scStoryKey:    null,
  scCritFilter:  new Set(),   // criticality filter (empty = all)
  scStatusFilter: new Set(),  // CT status filter (empty = all)
  scCatFilter:   new Set(),   // category filter (empty = all)
  scSearch:      "",
  scSortCol:     null,
  scSortDir:     "asc",
  scOpenDrop:    null,        // "crit"|"status"|"cat"|null
  scAllStatusVals: [],
  scAllCritVals:   [],
  scAllCatVals:    [],

  // ── Blocked stories ────────────────────────────────────────────────────────
  blockedExpanded: new Set(), // set of expanded story keys

  // ── Bug tracker filters ────────────────────────────────────────────────────
  bugFTypeAll:       true,
  bugFTypeFilter:    new Set(),
  bugFStatusAll:     true,
  bugFStatusFilter:  new Set(),
  bugChartSelected:  null,   // status clicked in chart
  bugChartHighlighted: false,
  bugSort:           { col: null, dir: null },
  bugSortCache:      null,

  // ── Bug history chart ──────────────────────────────────────────────────────
  bugsHistory:   [],
  bhTotalAberto: 0,
  bhShowBugs:    true,
  bhShowInc:     true,
  bhShowAcum:    true,
  bhMainChart:   null,
  bhTrendChart:  null,
};
