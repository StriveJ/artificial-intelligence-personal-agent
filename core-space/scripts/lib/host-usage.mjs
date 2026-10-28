// Read host usage metadata and produce deterministic snapshots, formatted summaries and charts. Missing installations, logs or fields are reported explicitly; estimates are not fabricated as measured usage.
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { shardSources } from './host-merge.mjs';
import { LEGACY_HOST, hostDir, hostIdHint, isValidHostId, readHostId } from './host-id.mjs';
import { dayKey } from './time-boundary.mjs';

export const HOST_USAGE_REL = 'user-space/logs/metrics/host-usage.jsonl';

export const HOST_USAGE_SHARD_REL = 'host-usage.jsonl';

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const round1 = (x) => Number(x.toFixed(1));

const pctOf = (part, total) => (num(total) > 0 ? round1((num(part) / num(total)) * 100) : null);

export const cacheHitPctOf = pctOf;

const kTokens = (n) => (num(n) < 1000 ? `${num(n)} tokens` : `${(num(n) / 1000).toFixed(1)}K`);

function localTs(iso) {
  const d = new Date(String(iso));
  if (Number.isNaN(d.getTime())) return '';
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function parseCodexRollout(text) {
  let cwd = '';
  const points = [];
  for (const line of String(text ?? '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    if (!cwd && line.includes('session_meta')) {
      try { const o = JSON.parse(line); if (o && o.payload && o.payload.cwd) cwd = String(o.payload.cwd); } catch {  }
      continue;
    }
    if (!line.includes('token_count')) continue;
    let o;
    try { o = JSON.parse(line); } catch { continue; }
    const info = o && o.payload && o.payload.info;
    if (!info) continue;
    const total = info.total_token_usage;
    const last = info.last_token_usage;
    if (!total && !last) continue;
    points.push({
      ts: String(o.timestamp || ''),
      input: num(total && total.input_tokens),
      cached: num(total && total.cached_input_tokens),
      output: num(total && total.output_tokens),
      reasoning: num(total && total.reasoning_output_tokens),
      ctx: num(last && last.input_tokens),
      window: num(info.model_context_window) || null,
    });
  }
  points.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
  return { cwd, points };
}

export function parseClaudeLog(text) {
  const points = [];
  for (const line of String(text ?? '').split(/\r?\n/)) {
    if (!line.includes('input_tokens')) continue;
    let o;
    try { o = JSON.parse(line); } catch { continue; }
    const u = (o && o.message && o.message.usage) || (o && o.usage);
    if (!u) continue;
    points.push({
      ts: String(o.timestamp || ''),
      input: num(u.input_tokens),
      cacheRead: num(u.cache_read_input_tokens),
      cacheCreate: num(u.cache_creation_input_tokens),
      output: num(u.output_tokens),
    });
  }
  points.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
  return { points };
}

export function codexDayUsage({ points, day, dayStartHour = 6 }) {
  const dayOf = (p) => dayKey(localTs(p.ts), dayStartHour);
  let before = null, last = null;
  for (const p of points) {
    const d = dayOf(p);
    if (!d) continue;
    if (d < day) before = p;
    else if (d === day) last = p;
  }
  if (!last) return null;

  const base = before || { input: 0, cached: 0, output: 0, reasoning: 0 };
  const inputTokens = Math.max(0, last.input - base.input);
  const cachedTokens = Math.max(0, last.cached - base.cached);
  return {
    date: day,
    host: 'codex',
    points: points.filter((p) => dayOf(p) === day).length,
    ctxTokens: last.ctx,
    ctxWindow: last.window,
    ctxPct: last.window ? round1((last.ctx / last.window) * 100) : null,
    ctxAt: last.ts,
    inputTokens,
    cachedTokens,
    freshTokens: Math.max(0, inputTokens - cachedTokens),
    cacheHitPct: pctOf(cachedTokens, inputTokens),
    outputTokens: Math.max(0, last.output - base.output),
    reasoningTokens: Math.max(0, last.reasoning - base.reasoning),
  };
}

export function claudeDayUsage({ points, day, dayStartHour = 6 }) {
  const picked = points.filter((p) => dayKey(localTs(p.ts), dayStartHour) === day);
  if (!picked.length) return null;
  const sum = (k) => picked.reduce((s, p) => s + num(p[k]), 0);
  const last = picked[picked.length - 1];
  const fresh = sum('input') + sum('cacheCreate');
  const cachedTokens = sum('cacheRead');
  const totalTokens = fresh + cachedTokens;
  return {
    date: day,
    host: 'claude-code',
    points: picked.length,
    ctxTokens: last.input + last.cacheRead + last.cacheCreate,
    ctxWindow: null,
    ctxPct: null,
    freshTokens: fresh,
    inputTokens: totalTokens,
    cachedTokens,
    cacheHitPct: pctOf(cachedTokens, totalTokens),
    outputTokens: sum('output'),
    reasoningTokens: 0,
  };
}

export function upsertUsageRow(rows, row) {
  const rest = (rows || []).filter((r) => !(r && r.date === row.date && r.host === row.host));
  return [...rest, row].sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.host).localeCompare(String(b.host)));
}

export function serializeUsageRows(rows) {
  const lines = (rows || []).filter((r) => r && r.date && r.host).map((r) => JSON.stringify(r));
  return lines.length ? lines.join('\n') + '\n' : '';
}

export function parseUsageRows(text) {
  const out = [];
  for (const line of String(text ?? '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try { const o = JSON.parse(line); if (o && o.date && o.host) out.push(o); } catch {  }
  }
  return out;
}

export function recentUsageRows(rows, days = 14) {
  const dates = [...new Set((rows || []).map((r) => r.date))].sort().slice(-days);
  const keep = new Set(dates);
  return (rows || []).filter((r) => keep.has(r.date));
}

const HOST_LABEL = { codex: 'Codex', 'claude-code': 'Claude Code' };
export const hostLabel = (id) => HOST_LABEL[id] || id;

export const KNOWN_HOSTS = ['codex', 'claude-code'];

const PANELS = [
  { label: "Context Utilization (%)", key: 'ctxPct', digits: 1, scale: 1 },
  { label: "Fresh Daily Input (K tokens, excluding cache)", key: 'freshTokens', digits: 1, scale: 1 / 1000 },
];
const SVG_STYLE = [
  '    <style>',
  '      .t { font: 600 13px system-ui, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; fill: #1f2328; }',
  '      .h { font: 11px system-ui, sans-serif; fill: #6b7280; }',
  '      .e { font: 12px system-ui, sans-serif; fill: #6b7280; }',
  '      .s { font: 10px ui-monospace, Consolas, monospace; fill: #6b7280; }',
  '      .v { font: 600 11px ui-monospace, Consolas, monospace; fill: #2563eb; }',
  '      polyline { fill: none; stroke: #2563eb; stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }',
  '      .d circle { fill: #2563eb; }',
  '      .ax { stroke: rgba(15,23,42,.16); stroke-width: 1; }',
  '      @media (prefers-color-scheme: dark) {',
  '        .t { fill: #e6e8eb; } polyline { stroke: #7cb3ff; } .d circle { fill: #7cb3ff; } .v { fill: #7cb3ff; }',
  '        .ax { stroke: rgba(255,255,255,.18); } .h, .e, .s { fill: #9aa4b2; }',
  '      }',
  '    </style>',
].join('\n');

export function renderHostTrendSvg(rows, host, { days = 14 } = {}) {
  const W = 920, H = 240, PW = 430, PH = 176, GX = 30;
  const mine = recentUsageRows((rows || []).filter((r) => r.host === host), days)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  if (!mine.length) {
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(hostLabel(host))} Usage Trend">
${SVG_STYLE}\n`
      + `      <text x="20" y="40" class="e">No ${esc(hostLabel(host))} usage data yet (collect: aipa-host-usage snapshot --root &lt;instance&gt;)</text>
    </svg>`;
  }
  const dates = mine.map((r) => String(r.date).slice(5));
  const panels = PANELS.map((p, i) => {
    const points = [];
    for (const r of mine) {
      const raw = r[p.key];
      if (raw == null || !Number.isFinite(Number(raw))) continue;
      points.push({ v: Number(raw) * p.scale });
    }
    const x0 = 20 + i * (PW + GX), y0 = 24, w = PW, h = PH;
    const head = `      <text x="${x0}" y="${y0 + 13}" class="t">${esc(p.label)}</text>\n`
      + `      <text x="${x0 + w}" y="${y0 + 13}" class="h" text-anchor="end">↓ Lower uses fewer tokens</text>
`;
    if (points.length < 2) return head + `      <text x="${x0}" y="${y0 + 72}" class="e">Insufficient data (at least 2 days needed)</text>
`;
    const cx = x0, cy = y0 + 24, cw = w, ch = h - 44;
    const vals = points.map((pp) => pp.v);
    let min = Math.min(...vals), max = Math.max(...vals);
    if (max === min) { const pad = Math.abs(max) > 0 ? Math.abs(max) * 0.1 : 1; min -= pad; max += pad; }
    else { const pad = (max - min) * 0.12; min -= pad; max += pad; }
    const px = (i2) => cx + (i2 * cw) / (points.length - 1);
    const py = (v) => cy + ch - ((v - min) / (max - min)) * ch;
    const poly = points.map((pp, i2) => `${px(i2).toFixed(1)},${py(pp.v).toFixed(1)}`).join(' ');
    const dots = points.map((pp, i2) => `<circle cx="${px(i2).toFixed(1)}" cy="${py(pp.v).toFixed(1)}" r="2.6"/>`).join('');
    const lastV = points[points.length - 1].v;
    const labelY = Math.min(Math.max(py(lastV) + 4, cy + 10), cy + ch - 2);
    return head
      + `      <line x1="${cx}" y1="${cy + ch}" x2="${cx + cw}" y2="${cy + ch}" class="ax"/>\n`
      + `      <text x="${cx}" y="${cy + 10}" class="s">${esc(max.toFixed(p.digits))}</text>\n`
      + `      <text x="${cx}" y="${cy + ch - 3}" class="s">${esc(min.toFixed(p.digits))}</text>\n`
      + `      <polyline points="${poly}"/>\n`
      + `      <g class="d">${dots}</g>\n`
      + `      <text x="${cx + cw}" y="${labelY.toFixed(1)}" class="v" text-anchor="end">${esc(lastV.toFixed(p.digits))}</text>\n`
      + `      <text x="${cx}" y="${y0 + h + 11}" class="s">${esc(dates[0])}</text>\n`
      + `      <text x="${cx + cw}" y="${y0 + h + 11}" class="s" text-anchor="end">${esc(dates[dates.length - 1])}</text>\n`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(hostLabel(host))} Usage Trend (last ${mine.length} days)">
${SVG_STYLE}\n${panels}    </svg>`;
}

export function hostUsageLines(rows, day = '') {
  const list = (rows || []).filter((r) => r && r.host && (!day || r.date === day));
  if (!list.length) return ["No host usage yet (run aipa-host-usage snapshot; the same message appears if the host is absent or has no logs)"];
  return list
    .sort((a, b) => num(b.inputTokens) - num(a.inputTokens))
    .map((r) => {
      const ctx = r.ctxTokens
        ? `Context ${kTokens(r.ctxTokens)}${r.ctxWindow ? ` / ${kTokens(r.ctxWindow)} (${r.ctxPct}%)` : "(no window field)"}`
        : "Context unavailable";

      const hit = pctOf(r.cachedTokens, r.inputTokens);
      const cache = hit == null ? "Cache hit unavailable" : `Cache hit ${hit}% (higher uses fewer tokens)`;
      const out = num(r.outputTokens) ? ` | Output ${kTokens(r.outputTokens)}` : '';
      const total = num(r.inputTokens) ? ` | Total input ${kTokens(r.inputTokens)} (including cached resends)` : '';

      const who = r.machine ? `${r.machine} · ` : '';
      return `${who}${hostLabel(r.host)}: ${ctx}|${cache} | New input ${kTokens(r.freshTokens)} (lower uses fewer tokens)${total}${out}`;
    });
}

export function hostUsageRows(rows, day = '') {
  return hostUsageLines(rows, day).map((line) => {
    const i = line.indexOf(': ');
    return i > 0 ? { label: line.slice(0, i), text: line.slice(i + 2) } : { text: line };
  });
}

export function claudeDirName(path) {
  return String(path || '').replace(/[^A-Za-z0-9-]/g, '-');
}

function listFiles(dir, filter, out = []) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) listFiles(p, filter, out);
    else if (filter(e.name)) out.push(p);
  }
  return out;
}

const norm = (p) => String(p || '').replace(/\\/g, '/').toLowerCase();

export function collectHostUsage({ day, dayStartHour = 6, home = homedir(), scopePaths = [], maxAgeDays = 14, now = new Date() }) {
  const rows = [];
  const scope = scopePaths.map(norm).filter(Boolean);
  const cutoff = now.getTime() - maxAgeDays * 86400000;
  const fresh = (p) => { try { return statSync(p).mtimeMs >= cutoff; } catch { return false; } };
  const inScope = (p) => !scope.length || scope.includes(norm(p));

  const codex = { date: day, host: 'codex', sessions: 0, points: 0, ctxTokens: 0, ctxWindow: null, inputTokens: 0, cachedTokens: 0, freshTokens: 0, outputTokens: 0, reasoningTokens: 0 };
  for (const p of listFiles(join(home, '.codex', 'sessions'), (n) => /^rollout-.*\.jsonl$/.test(n)).filter(fresh)) {
    let text = '';
    try { text = readFileSync(p, 'utf8'); } catch { continue; }
    const { cwd, points } = parseCodexRollout(text);
    if (!cwd || !points.length || !inScope(cwd)) continue;
    const row = codexDayUsage({ points, day, dayStartHour });
    if (!row) continue;
    codex.sessions += 1;
    codex.points += row.points;
    codex.inputTokens += row.inputTokens;
    codex.cachedTokens += row.cachedTokens;
    codex.outputTokens += row.outputTokens;
    codex.reasoningTokens += row.reasoningTokens;

    if (row.ctxPct !== null && (codex.ctxPct == null || row.ctxPct > codex.ctxPct)) {
      codex.ctxTokens = row.ctxTokens; codex.ctxWindow = row.ctxWindow; codex.ctxPct = row.ctxPct;
      codex.ctxSource = { session: p.replace(/\\/g,'/').split('/').pop(), at: row.ctxAt, aggregate: 'max-session-last-ratio' };
    } else if (codex.ctxPct == null && row.ctxTokens >= codex.ctxTokens) {
      codex.ctxTokens = row.ctxTokens; codex.ctxWindow = null;
      codex.ctxSource = { session: p.replace(/\\/g,'/').split('/').pop(), at: row.ctxAt, aggregate: 'max-session-last-tokens-window-unknown' };
    }
  }
  if (codex.sessions) {
    codex.cacheHitPct = pctOf(codex.cachedTokens, codex.inputTokens);
    codex.ctxPct = codex.ctxWindow ? round1((codex.ctxTokens / codex.ctxWindow) * 100) : null;

    codex.freshTokens = Math.max(0, codex.inputTokens - codex.cachedTokens);
    rows.push(codex);
  }

  const claudeRoot = join(home, '.claude', 'projects');
  if (existsSync(claudeRoot)) {
    const wanted = new Set(scopePaths.map((p) => claudeDirName(p).toLowerCase()));
    let points = [];
    let sessions = 0;
    for (const e of readdirSync(claudeRoot, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      if (scope.length && !wanted.has(e.name.toLowerCase())) continue;
      for (const p of listFiles(join(claudeRoot, e.name), (n) => n.endsWith('.jsonl')).filter(fresh)) {
        let text = '';
        try { text = readFileSync(p, 'utf8'); } catch { continue; }
        const parsed = parseClaudeLog(text);
        if (!parsed.points.length) continue;
        points = points.concat(parsed.points);
        sessions += 1;
      }
    }
    if (points.length) {
      const row = claudeDayUsage({ points, day, dayStartHour });
      if (row) rows.push({ ...row, sessions });
    }
  }
  return rows.sort((a, b) => String(a.host).localeCompare(String(b.host)));
}

export function resolveUsageStore(root) {
  const id = readHostId(root);
  if (id && isValidHostId(id)) {
    return { hostId: id, path: join(hostDir(root, id), 'host-usage.jsonl'), hint: null };
  }
  return { hostId: null, path: join(root, HOST_USAGE_REL), hint: hostIdHint(root) };
}

export function readOwnUsageRows(root) {
  const p = resolveUsageStore(root).path;
  return existsSync(p) ? parseUsageRows(readFileSync(p, 'utf8')) : [];
}

const tagRows = (rows, machine) => rows.map((r) => ({ ...r, machine }));

const sortRows = (rows) => rows.sort(
  (a, b) => String(a.date).localeCompare(String(b.date))
    || String(a.machine || '').localeCompare(String(b.machine || ''))
    || String(a.host).localeCompare(String(b.host))
);

export function readUsageRows(root) {
  const { hostId } = resolveUsageStore(root);
  const local = tagRows(readOwnUsageRows(root), hostId || LEGACY_HOST);
  if (!hostId) return sortRows(local);
  const legacyPath = join(root, HOST_USAGE_REL);
  const legacy = existsSync(legacyPath) ? parseUsageRows(readFileSync(legacyPath, 'utf8')) : [];
  const keyOf = (r) => `${r.date}\u0000${r.host}`;
  const byKey = new Map();

  for (const r of tagRows(legacy, LEGACY_HOST)) byKey.set(keyOf(r), r);
  for (const r of local) byKey.set(keyOf(r), r);
  return sortRows([...byKey.values()]);
}

export function readAllUsageRows(root) {
  const out = [];
  for (const src of shardSources(root, HOST_USAGE_SHARD_REL, HOST_USAGE_REL)) {
    out.push(...tagRows(parseUsageRows(src.text), src.host));
  }
  const keyOf = (r) => `${r.date}\u0000${r.host}\u0000${r.machine}`;
  const byKey = new Map();
  for (const r of out) byKey.set(keyOf(r), r);
  return sortRows([...byKey.values()]);
}

export function writeUsageRows(root, rows) {
  const p = resolveUsageStore(root).path;
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, serializeUsageRows(rows), 'utf8');
  return p;
}
