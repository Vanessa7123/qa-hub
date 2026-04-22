// Entry point — imports all modules, exposes global handlers, boots the app.
//
// HTML inline event handlers (onclick="...") need functions on window because
// ES modules are scoped. We assign every public function here so the static
// HTML and dynamically-generated HTML can both call them.

import {
  init, snavClick, onProjectChange, onSprintChange,
  reloadAll, loadSprintData, registerRenderFns,
} from './core.js';

import { generateReport, generateStoryReport } from './report.js';

import {
  openCtModal, closeCtModal, onCtModalBackdropClick,
  openModal, openBugsModal, openStoriesModal,
  closeModal, onModalBackdropClick,
  toggleMs,
  deselectAllCsStatus, deselectAllCsType, deselectAllCsAssignee,
  onCsStatusAllChange, onCsStatusChange,
  onCsTypeAllChange, onCsTypeChange,
  onCsAssigneeAllChange, onCsAssigneeChange,
  clearCsFilter, removeCsStatusTag, removeCsTypeTag,
  onCtTypeChange, clearCtFilter, removeCtTypeTag,
  copyIssueKeys, closeSidePanel, setSidePanelSort,
  selectStatusSegment, selectTypeAndStatus, selectDrillDownStatus,
  openTypeModal,
  closeRiskPanel, openRiskPanel, setRiskSort,
  riskFilterChange, riskSearchChange, riskPagePrev, riskPageNext,
  renderRiskChart, renderRiskPanel,
  initChartFilters,
} from './charts.js';

import {
  openWorkflowModal, closeWorkflowModal, onWorkflowModalBackdropClick,
  selectCt, selectCtById, deselectCt,
  renderCtDetail,
  changeCtStatus, toggleCtStatusDrop,
  searchCtBugs, linkCtBugByIdx, unlinkCtBug,
  searchCtRelated, linkCtRelByIdx, unlinkCtRel,
  addCtComment, deleteCtComment,
  startEditCtComment, saveCtCommentEdit, cancelCtCommentEdit,
  promptCtUser, setCtUser,
} from './ct-detail.js';

import {
  setScSort, toggleScDrop, closeScDrop,
  toggleScFilterVal, clearScFilter as clearScFilterFn,
  clearAllScFilters, scSearchChange,
  renderScenarioTable,
  openScenarioModal, closeScenarioModal, onScenarioModalBackdropClick,
} from './scenarios.js';

import { bhToggle, loadBugsHistory, renderBugsHistory } from './bug-history.js';

import {
  loadBugData, onBugSprintChange,
  renderBugTable, rebuildBugFilterOpts,
  setBugSort, selectBugChartStatus, selectBugDrillType,
  bugOnTypeAllChange, bugOnTypeChange, bugDeselectAllType,
  bugOnStatusAllChange, bugOnStatusChange, bugDeselectAllStatus,
  removeBugTypeTag, removeBugStatusTag,
} from './bug-tracker.js';

import { renderAutomation, renderBlockedStories, toggleBlockedStory, toggleBsExpand } from './blocked.js';
import { renderStoryProgress } from './story-progress.js';

// ── Register render callbacks (used by core.js to avoid circular imports) ─────

registerRenderFns({
  loadBugData,
  loadBugsHistory,
  closeModal,
  initChartFilters,
  renderRiskChart,
  renderRiskPanel,
  renderStoryProgress,
  renderAutomation,
  renderBlockedStories,
});

// ── Expose all public functions on window (for HTML onclick/onchange) ──────────

Object.assign(window, {
  // Core
  onProjectChange, onSprintChange, reloadAll, snavClick,

  // Report
  generateReport, generateStoryReport,

  // CT modal
  openCtModal, closeCtModal, onCtModalBackdropClick,

  // Issue modal
  openModal, openBugsModal, openStoriesModal,
  closeModal, onModalBackdropClick,

  // Chart filters
  toggleMs,
  deselectAllCsStatus, deselectAllCsType, deselectAllCsAssignee,
  onCsStatusAllChange, onCsStatusChange,
  onCsTypeAllChange, onCsTypeChange,
  onCsAssigneeAllChange, onCsAssigneeChange,
  clearCsFilter, removeCsStatusTag, removeCsTypeTag,
  onCtTypeChange, clearCtFilter, removeCtTypeTag,

  // Side panel
  copyIssueKeys, closeSidePanel, setSidePanelSort,
  selectStatusSegment, selectTypeAndStatus, selectDrillDownStatus,
  openTypeModal,

  // Risk panel
  closeRiskPanel, openRiskPanel, setRiskSort,
  riskFilterChange, riskSearchChange, riskPagePrev, riskPageNext,

  // Workflow modal
  openWorkflowModal, closeWorkflowModal, onWorkflowModalBackdropClick,

  // CT detail
  selectCt, selectCtById, deselectCt,
  changeCtStatus, toggleCtStatusDrop,
  searchCtBugs, linkCtBugByIdx, unlinkCtBug,
  searchCtRelated, linkCtRelByIdx, unlinkCtRel,
  addCtComment, deleteCtComment,
  startEditCtComment, saveCtCommentEdit, cancelCtCommentEdit,
  promptCtUser, setCtUser,

  // Scenario modal
  setScSort, toggleScDrop, closeScDrop,
  toggleScFilterVal, clearScFilter: clearScFilterFn,
  clearAllScFilters, scSearchChange,
  openScenarioModal, closeScenarioModal, onScenarioModalBackdropClick,

  // Bug history
  bhToggle, renderBugsHistory,

  // Bug tracker
  onBugSprintChange, renderBugTable,
  setBugSort, selectBugChartStatus, selectBugDrillType,
  bugOnTypeAllChange, bugOnTypeChange, bugDeselectAllType,
  bugOnStatusAllChange, bugOnStatusChange, bugDeselectAllStatus,
  removeBugTypeTag, removeBugStatusTag,

  // Blocked stories
  toggleBlockedStory, toggleBsExpand,
});

// ── Boot ──────────────────────────────────────────────────────────────────────

init();
