// Pure proactive-signal helpers. Rank similar questions, identify stale projects and extract pending work without rewriting user content. Retain native-language stop words and legacy task markers as escaped aliases alongside canonical English forms.
export const DAY_QUOTA = 5;
export const SCENE_CAP = { session: 2, turn: 1 };
export const STALE_DAYS = 7;
export const SCAN_DAYS = 60;

export function emptyState(day) {
  return { version: '0.1', date: day, count_today: 0, muted: false, muted_at: '', snooze: {}, last_scan_at: '' };
}

export function rollDay(state, day) {
  if (state.date !== day) {
    state.date = day;
    state.count_today = 0;
  }
  return state;
}

export function mergeStates(states, day) {
  const out = emptyState(day);
  let count = 0;
  let anyMuted = false;
  let mutedAt = '';
  let mutedValue = false;
  for (const s of states || []) {
    if (!s) continue;

    const one = rollDay({ ...s, snooze: { ...(s.snooze || {}) } }, day);
    count += Number(one.count_today) || 0;
    if (one.muted === true) anyMuted = true;
    const t = String(one.muted_at || '');
    if (t && t > mutedAt) { mutedAt = t; mutedValue = one.muted === true; }
    if (String(one.last_scan_at || '') > String(out.last_scan_at || '')) out.last_scan_at = String(one.last_scan_at || '');
    for (const [id, until] of Object.entries(one.snooze)) {
      if (!(id in out.snooze) || String(until) > String(out.snooze[id])) out.snooze[id] = until;
    }
  }
  out.count_today = count;
  out.muted = mutedAt ? mutedValue : anyMuted;
  out.muted_at = mutedAt;
  return out;
}

export function quotaLeft(state, scene, cap = SCENE_CAP) {
  const sceneCap = cap[scene] ?? DAY_QUOTA;
  return Math.max(0, Math.min(DAY_QUOTA - (state.count_today || 0), sceneCap));
}

export function isMuted(state) {
  return state.muted === true;
}

export function snoozeActive(state, id, nowDate) {
  const until = state.snooze && state.snooze[id];
  return Boolean(until) && String(until) > String(nowDate);
}

export function askKey(date, line) {
  return `ask:${date}#${line}`;
}

export function staleKey(project, subject) {
  return `stale:${project}:${shortHash(subject)}`;
}

export function shortHash(s) {
  let h = 5381;
  for (const ch of String(s ?? '')) h = ((h * 33) ^ ch.codePointAt(0)) >>> 0;
  return h.toString(16).padStart(8, '0').slice(0, 8);
}

const STOP = new Set([
  '\u7684', '\u4e86', '\u662f', '\u5728', '\u548c', '\u6709', '\u6211', '\u4f60', '\u4ed6', '\u8fd9', '\u90a3', '\u5c31', '\u90fd', '\u4e5f', '\u4e0d',
  '\u5417', '\u5462', '\u5427', '\u554a', '\u600e\u4e48', '\u5982\u4f55', '\u4e3a\u4ec0\u4e48', '\u4ec0\u4e48', '\u53ef\u4ee5', '\u9700\u8981', '\u4e00\u4e2a', '\u8fd9\u4e2a', '\u90a3\u4e2a',
  '\u4e00\u4e0b', '\u73b0\u5728', '\u8fd8\u662f', '\u7136\u540e', '\u5982\u679c', '\u56e0\u4e3a', '\u6240\u4ee5',
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'to', 'of', 'and', 'or', 'for', 'how', 'what', 'why', 'it', 'in', 'on', 'at',
]);

// ICU word boundaries add native-script words without replacing legacy Latin/Han tokens.
// This is lexical matching, not translation or a claim of equal quality in every language.
const nativeWords = new Intl.Segmenter('und', { granularity: 'word' });

export function tokenize(text) {
  const s = String(text || '').toLowerCase();
  const out = [];
  for (const m of s.matchAll(/[a-z0-9_+.-]{2,}/g)) {
    if (!STOP.has(m[0])) out.push(m[0]);
  }
  for (const m of s.matchAll(/[\u4e00-\u9fa5]+/g)) {
    const w = m[0];
    if (w.length === 1) {
      if (!STOP.has(w)) out.push(w);
      continue;
    }
    for (let i = 0; i < w.length - 1; i++) {
      const g = w.slice(i, i + 2);
      if (!STOP.has(g)) out.push(g);
    }
  }
  for (const { segment, isWordLike } of nativeWords.segment(s)) {
    if (!isWordLike || !/[^\x00-\x7f]/.test(segment) || !/\p{L}/u.test(segment) || /\p{Script=Han}/u.test(segment)) continue;
    if (!STOP.has(segment)) out.push(segment);
  }
  return out;
}

export function extractAsks(dailyText, date) {
  const out = [];
  const lines = String(dailyText || '').split(/\r?\n/);
  lines.forEach((ln, i) => {
    const m = ln.match(/^-\s*\[(\d{2}:\d{2})\]\s*([^·:]+)·\s*user_message:\s*(.+)$/);
    if (!m) return;
    const text = m[3].trim();
    if (!text) return;
    out.push({ date, line: i + 1, time: m[1], project: m[2].trim(), text });
  });
  return out;
}

export function extractAssistantNotes(dailyText, date) {
  const out = [];
  const lines = String(dailyText || '').split(/\r?\n/);
  lines.forEach((ln, i) => {
    const m = ln.match(/^-\s*\[(\d{2}:\d{2})\]\s*([^·:]+)·\s*assistant_message:\s*(.+)$/);
    if (!m) return;
    const text = m[3].trim();
    if (!text) return;
    out.push({ date, line: i + 1, time: m[1], project: m[2].trim(), text });
  });
  return out;
}

export function scoreAsk(queryTokens, askTokens) {
  if (!queryTokens || !askTokens || !queryTokens.length || !askTokens.length) return 0;
  const q = new Set(queryTokens);
  const a = new Set(askTokens);
  let inter = 0;
  for (const t of q) if (a.has(t)) inter += 1;
  return inter / Math.sqrt(q.size * a.size);
}

export function rankAsks(asks, query, limit = 3) {
  const qt = tokenize(query);
  return (asks || [])
    .map((a) => ({ ...a, score: Number(scoreAsk(qt, tokenize(a.text)).toFixed(3)) }))
    .filter((a) => a.score > 0)
    .sort((x, y) => y.score - x.score || (x.date < y.date ? 1 : -1))
    .slice(0, limit);
}

export function daysBetween(fromDate, toDate) {
  const a = Date.parse(`${fromDate}T00:00:00Z`);
  const b = Date.parse(`${toDate}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86400000);
}

const TODO_KEYWORDS = ["unimplemented", '\u672a\u5b9e\u73b0', "unfinished", '\u672a\u5b8c\u6210', "unresolved", '\u672a\u89e3\u51b3', "not started", '\u672a\u5f00\u59cb', "pending", '\u5f85\u529e', "to do", '\u5f85\u505a', "to complete", '\u5f85\u8865', "on hold", '\u6401\u7f6e', "deferred", '\u6682\u7f13', 'todo'];
const DONE_PREFIX = /^(?:done|completed|resolved|\u5df2|\u5b8c\u6210|\u89e3\u51b3|✅)/i;

export function extractTodoItems(text, limit = 8) {
  const out = [];
  let inPendingSection = false;
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    if (out.length >= limit) break;
    const line = raw.trim();
    if (!line) continue;

    const heading = line.match(/^#{2,6}\s+(.*)$/);
    if (heading) {
      const title = heading[1].replace(/✅/g, '').trim();
      inPendingSection = TODO_KEYWORDS.some((k) => title.toLowerCase().includes(k));
      if (inPendingSection && title) out.push(title);
      continue;
    }

    const bullet = line.match(/^[-*]\s+(.*)$/);
    if (!bullet) continue;
    const body = bullet[1].trim();
    if (/^\[x\]/i.test(body)) continue;
    if (/^\[\s\]/.test(body)) {
      const content = body.replace(/^\[\s\]\s*/, '').trim();
      if (content) out.push(content);
      continue;
    }
    const status = body.match(/^\*\*(?:Status|\u72b6\u6001)\*\*[:\uFF1A]\s*(.*)$/i);
    if (status) {
      if (!DONE_PREFIX.test(status[1].trim())) out.push(body);
      continue;
    }
    if (inPendingSection || TODO_KEYWORDS.some((k) => body.toLowerCase().includes(k))) out.push(body);
  }
  return out.slice(0, limit);
}

export function findStaleProjects(dailyIndex, { nowDate, staleDays = STALE_DAYS } = {}) {
  const last = new Map();
  for (const e of dailyIndex || []) {
    if (!e || !e.project || !e.date) continue;
    const cur = last.get(e.project);
    if (!cur || e.date > cur) last.set(e.project, e.date);
  }
  const out = [];
  for (const [project, lastAt] of last) {
    const days = daysBetween(lastAt, nowDate);
    if (days > staleDays) out.push({ project, lastAt, days });
  }
  return out.sort((a, b) => b.days - a.days);
}
