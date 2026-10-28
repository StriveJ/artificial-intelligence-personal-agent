// warmup
export const DEFAULT_MAX_THRESHOLD = 20;

export function emptyState() {
  return { version: '0.1', projects: {} };
}

export function ensureEntry(state, project, now = '') {
  if (!state.projects) state.projects = {};
  let entry = state.projects[project];
  if (!entry) {
    entry = {
      count: 0,
      threshold: 1,
      warm: false,
      pending: false,
      runs: 0,
      created: now,
      updated: now,
      cursor_ts: now,
    };
    state.projects[project] = entry;
  }
  return entry;
}

export function checkWarmup(state, project, now = '', max = DEFAULT_MAX_THRESHOLD) {
  const e = ensureEntry(state, project, now);
  const base = { project, count: e.count, threshold: e.threshold, runs: e.runs };

  if (e.warm) return { decision: 'skip', reason: 'warm', ...base, warm: true };
  if (e.pending) return { decision: 'pending', reason: 'awaiting-judge', ...base, warm: false };

  e.count += 1;
  e.updated = now || e.updated;

  if (e.count >= e.threshold) {
    e.pending = true;
    return {
      decision: 'due',
      reason: 'warmup',
      project,
      count: e.count,
      threshold: e.threshold,
      runs: e.runs,
      cursor_ts: e.cursor_ts,
      warm: false,
    };
  }

  return { decision: 'skip', reason: 'not-due', ...base, count: e.count, warm: false };
}

export function doneWarmup(state, project, now = '', max = DEFAULT_MAX_THRESHOLD) {
  const e = ensureEntry(state, project, now);
  if (!e.pending) {
    return {
      status: 'noop',
      reason: 'not-pending',
      project,
      count: e.count,
      threshold: e.threshold,
      runs: e.runs,
      warm: e.warm,
    };
  }

  e.pending = false;
  e.count = 0;
  e.runs += 1;
  e.cursor_ts = now || e.cursor_ts;
  e.updated = now || e.updated;

  if (e.threshold >= max) e.warm = true;
  else e.threshold = Math.min(e.threshold * 2, max);

  return {
    status: 'ok',
    project,
    count: e.count,
    threshold: e.threshold,
    runs: e.runs,
    warm: e.warm,
  };
}

export function statusOf(state, project) {
  const e = state.projects && state.projects[project];
  if (!e) return null;
  return { project, ...e };
}
