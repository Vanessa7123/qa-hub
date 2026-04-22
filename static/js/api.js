// All HTTP calls to the Flask backend.
//
// Each function returns parsed JSON or throws on error.
// State mutations are the caller's responsibility — this module is side-effect free.

// ── Boards & sprints ───────────────────────────────────────────────────────────

export async function fetchBoards() {
  const res = await fetch("/api/boards");
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function fetchSprints(boardId) {
  const res = await fetch(`/api/sprints?board_id=${boardId}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}


// ── Sprint dashboard ───────────────────────────────────────────────────────────

export async function fetchSprintData(boardId, sprintId = null) {
  const params = sprintId
    ? `sprint_id=${sprintId}&board_id=${boardId}`
    : `board_id=${boardId}`;
  const res = await fetch(`/api/sprint?${params}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}


// ── Environment health check ───────────────────────────────────────────────────

export async function fetchEnvStatus() {
  const res = await fetch("/api/env-status");
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}


// ── Bug tracker ────────────────────────────────────────────────────────────────

/**
 * @param {number} boardId
 * @param {string|null} sprintId  – pass null for the active sprint
 * @param {string} scope          – "sprint" (default) | "all"
 */
export async function fetchBugData(boardId, sprintId = null, scope = "sprint") {
  let url;
  if (scope === "all") {
    url = `/api/bugs?scope=all&board_id=${boardId}`;
  } else if (sprintId) {
    url = `/api/bugs?sprint_id=${sprintId}&board_id=${boardId}`;
  } else {
    url = `/api/bugs?board_id=${boardId}`;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function fetchBugsHistory(boardId) {
  const res = await fetch(`/api/bugs-history?board_id=${boardId}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}


// ── Issue search (for linking bugs / related items to CTs) ────────────────────

export async function searchIssues(q, boardId) {
  const res = await fetch(
    `/api/bugs/search?q=${encodeURIComponent(q)}&board_id=${boardId}`
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}


// ── CT (test case) updates ─────────────────────────────────────────────────────

export async function updateCtStatus(subtaskKey, ctId, newStatus) {
  const res = await fetch("/api/ct/status", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ subtask_key: subtaskKey, ct_id: ctId, new_status: newStatus }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "Erro ao atualizar status");
  return data;
}

export async function updateCtBugs(subtaskKey, ctId, bugKeys) {
  const res = await fetch("/api/ct/bugs", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ subtask_key: subtaskKey, ct_id: ctId, bug_keys: bugKeys }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "Erro ao atualizar bugs");
  return data;
}


// ── CT local data (links + comments) — persisted server-side ──────────────────

export async function fetchCtData() {
  const res = await fetch("/api/ct/data");
  if (!res.ok) return { links: {}, comments: {} };
  return res.json();
}

export async function saveCtData(links, comments) {
  await fetch("/api/ct/data", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ links, comments }),
  });
}
