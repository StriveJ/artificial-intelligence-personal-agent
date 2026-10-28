// Deterministic token-size estimates and reporting, not measured model billing. Compare explicit uncompressed baselines with actual projected content; exclude fixed protocol/profile costs where declared. Keep accounting versions separate and disclose excluded legacy rows. Reports and SVG charts preserve the original numeric definitions.
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { listEventFiles, readEvents } from './event-store.mjs';
import { shardSources } from './host-merge.mjs';
import { MEMORY_WRITES, OFFLOAD_LEDGER, SEARCH_LOG, appendLocalLog, readLocalLog } from './local-log.mjs';
import { hostDir, hostIdHint, isValidHostId, listLocalFiles, readHostId } from './host-id.mjs';
import { dirname, join } from 'node:path';
import { formatPointer } from './offload.mjs';
import { dayKey } from './time-boundary.mjs';
import { dayStartHour as sharedDayStartHour, tsLocal } from './day-clock.mjs';
import { hostname } from 'node:os';
import { VALID_TYPES } from './candidates.mjs';
export const LEDGER_LABELS = { saved: "Context Subledger Saved", extra: "Context Subledger Extra Read", amortized: "Ledger Amortization / Question", fixed: "One Copy of Fixed Material" };

export const METRIC_STORE_REL = 'user-space/logs/metrics/token-metrics.jsonl';

export const OFFLOAD_LEDGER_REL = 'user-space/logs/metrics/offload-ledger.jsonl';
export const SEARCH_LOG_REL = 'state/search-log.jsonl';

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const kb = (n) => `${(num(n) / 1024).toFixed(1)}KB`;
const pct = (percent) => `${Math.round(num(percent))}%`;
const fixed1 = (x) => Number(x.toFixed(4));
const fixedPct = (x) => Number((x * 100).toFixed(1));

function group(baseline, actual) {
  const b = num(baseline), a = num(actual);
  return {
    baselineBytes: b,
    actualBytes: a,
    savedBytes: Math.max(0, b - a),
    savedPct: b > 0 ? fixedPct((b - a) / b) : null,
  };
}

export function computeLedger({ fixed = {}, memory = {}, task = {}, offload = {}, archive = {}, questions = 0 } = {}) {
  const fixedParts = {};
  for (const [k, v] of Object.entries(fixed)) fixedParts[k] = num(v);
  const fixedBytes = Object.values(fixedParts).reduce((a, b) => a + b, 0);

  const memoryFull = num(memory.fullBytes);
  const memoryResident = num(memory.residentBytes);
  const memoryHits = num(memory.hitsBytes);
  const memoryActual = memoryResident + memoryHits;

  const searches = {
    count: num(memory.searchCount),
    empty: num(memory.searchEmptyCount),
    bytes: memoryHits,
  };
  searches.hitPct = searches.count > 0 ? fixedPct((searches.count - searches.empty) / searches.count) : null;
  searches.avgBytes = searches.count > 0 ? Math.round(searches.bytes / searches.count) : 0;

  const groups = {
    memory: group(memoryFull, memoryActual),
    task: group(task.baselineBytes, task.canvasBytes),
    offload: group(offload.addedBytes, offload.pointerBytes),
  };

  const active = Object.values(groups).filter((g) => g.baselineBytes > 0);
  const baselineBytes = active.reduce((s, g) => s + g.baselineBytes, 0);
  const actualBytes = active.reduce((s, g) => s + g.actualBytes, 0);
  const context = {
    baselineBytes,
    actualBytes,
    savedBytes: Math.max(0, baselineBytes - actualBytes),
    savedPct: baselineBytes > 0 ? fixedPct((baselineBytes - actualBytes) / baselineBytes) : null,
  };

  const eventBytes = num(archive.eventBytes);
  const dailyBytes = num(archive.dailyBytes);
  const q = num(questions);
  return {
    fixedBytes,
    fixedParts,
    memory: { fullBytes: memoryFull, residentBytes: memoryResident, hitsBytes: memoryHits, actualBytes: memoryActual, legacyHitRows: num(memory.legacyHitRows) },
    searches,
    task: { baselineBytes: num(task.baselineBytes), canvasBytes: num(task.canvasBytes) },
    offload: {
      addedBytes: num(offload.addedBytes),
      addedEntries: num(offload.addedEntries),
      pointerBytes: num(offload.pointerBytes),
      cumulativeBytes: num(offload.cumulativeBytes),
      stockBytes: num(offload.stockBytes),
      stockEntries: num(offload.stockEntries),
    },
    archive: {
      baselineBytes: eventBytes,
      actualBytes: dailyBytes,
      ratio: eventBytes > 0 && dailyBytes > 0 ? fixed1(eventBytes / dailyBytes) : null,
      distilledBytes: num(archive.distilledBytes),
      distilledEntries: num(archive.distilledEntries),
    },
    groups,
    context,
    questions: q,
    perQuestionBytes: q > 0 && fixedBytes + actualBytes > 0 ? Math.round((fixedBytes + actualBytes) / q) : null,
  };
}

const FIXED_LABEL = { protocol: "protocol", policy: "policy", profile: "profile", privacy: "privacy", overrides: "wording" };

export function ledgerRows(L = {}) {
  const g = L.groups || {};
  const c = L.context || {};
  const a = L.archive || {};
  const o = L.offload || {};
  const m = L.memory || {};
  const rows = [];

  rows.push(c.savedPct != null
    ? {
        style: 'headline',
        label: c.savedPct >= 0 ? LEDGER_LABELS.saved : LEDGER_LABELS.extra,
        value: pct(Math.abs(c.savedPct)),
        text: `Uncompressed reading ${kb(c.baselineBytes)} -> actual reading ${kb(c.actualBytes)}`,
      }
    : { style: 'headline', label: LEDGER_LABELS.saved, text: "unavailable (no comparable material yet)" });

  rows.push(L.perQuestionBytes != null
    ? { label: LEDGER_LABELS.amortized, value: kb(L.perQuestionBytes), text: ` (one copy of fixed material ${kb(L.fixedBytes)} + context subledger ${kb(c.actualBytes)})÷ ${L.questions} questions; fixed material is counted only once in this formula` }
    : { label: LEDGER_LABELS.amortized, text: "unavailable (no questions recorded today)" });

  const fixedParts = Object.entries(L.fixedParts || {})
    .filter(([, v]) => num(v) > 0)
    .sort((x, y) => y[1] - x[1])
    .map(([k, v]) => `${FIXED_LABEL[k] || k} ${kb(v)}`)
    .join(' + ');
  rows.push(L.fixedBytes
    ? { label: LEDGER_LABELS.fixed, value: kb(L.fixedBytes), text: `${fixedParts}; byte size of one file copy, excluding repeated loading` }
    : { label: LEDGER_LABELS.fixed, text: "unavailable" });

  const gm = g.memory || {};
  const hitHeavy = num(m.hitsBytes) > num(m.residentBytes) && num(m.hitsBytes) > 0;
  const legacy = num(m.legacyHitRows) ? `; additionally ${num(m.legacyHitRows)} legacy-definition search records excluded (accounting definition changed today)` : '';
  rows.push({ label: "Memory Loading", text: gm.baselineBytes
    ? `${kb(gm.baselineBytes)} full content -> ${kb(gm.actualBytes)} (resident ${kb(m.residentBytes)} + today's search hits ${kb(m.hitsBytes)}) saved ${pct(gm.savedPct || 0)}${hitHeavy ? " ⚠ Search hits exceed resident memory; retrieval dominates cost. Narrow --top 3 / --chars 800." : ''}${legacy}`
    : "unavailable" });

  const s = L.searches || {};
  const legacyNote = num(m.legacyHitRows) ? `Additionally ${num(m.legacyHitRows)} legacy-definition records excluded` : '';
  rows.push({ label: "Search", text: num(s.count) > 0
    ? `Today: ${s.count} calls (zero hits: ${num(s.empty)}; hit rate ${pct(s.hitPct == null ? 0 : s.hitPct)}) | Total injected ${kb(s.bytes)} | Average per call ${kb(s.avgBytes)}${legacyNote ? `; ${legacyNote}` : ''}`
    : (legacyNote ? `Today: 0 records under the new definition (${legacyNote})` : "No searches today (memory loading consists only of resident content)") });

  const gt = g.task || {};
  rows.push({ label: "Task Status", text: gt.baselineBytes
    ? `${kb(gt.baselineBytes)} recent events -> ${kb(gt.actualBytes)} canvas; saved ${pct(gt.savedPct || 0)}`
    : "unavailable" });

  const go = g.offload || {};
  rows.push({ label: "Context Offloading", text: go.baselineBytes
    ? `Today: ${o.addedEntries} entries ${kb(o.addedBytes)} -> pointers only ${kb(o.pointerBytes)}; saved ${pct(go.savedPct || 0)}; cumulative ${kb(o.cumulativeBytes)}; retained ${o.stockEntries} entries ${kb(o.stockBytes)} (GC after 7 days)`
    : `Not triggered today (4000-character threshold not reached); cumulative ${kb(o.cumulativeBytes)}; retained ${o.stockEntries} entries ${kb(o.stockBytes)} (GC after 7 days)` });

  rows.push({ label: "Archive Compression", text: a.ratio != null
    ? `${kb(a.baselineBytes)} events -> ${kb(a.actualBytes)} daily report; compressed ${a.ratio.toFixed(1)}×${a.distilledEntries ? ` -> distilled ${a.distilledEntries} entries ${kb(a.distilledBytes)}` : ''}`
    : "unavailable (no daily report generated today)" });

  rows.push({ label: "How to Read", text: "The subledger compares only memory, task status and offloading. Amortization is not actual single-turn cost. All units are bytes; the baseline is an AIPA internal uncompressed comparison, not measured host tokens or total cost. The two accounting methods must not be added or multiplied." });
  return rows;
}

export function ledgerLines(L = {}) {
  return ledgerRows(L).map((r) => {
    if (!r.value) return `${r.label}: ${r.text}`;

    return r.style === 'headline' ? `${r.label} ${r.value}: ${r.text}` : `${r.label} ${r.value} (${r.text})`;
  });
}

export function snapshotOf(L, date, { capturedAt = '', kind = 'capture' } = {}) {
  return {
    date: String(date),
    v: 3,
    capturedAt: String(capturedAt || ''),
    kind: String(kind || ''),
    fixedParts: L.fixedParts || {},
    fixedBytes: num(L.fixedBytes),
    memoryFullBytes: num(L.memory && L.memory.fullBytes),
    memoryResidentBytes: num(L.memory && L.memory.residentBytes),
    memoryHitsBytes: num(L.memory && L.memory.hitsBytes),
    memoryActualBytes: num(L.memory && L.memory.actualBytes),
    searchCount: num(L.searches && L.searches.count),
    searchEmptyCount: num(L.searches && L.searches.empty),
    searchHitPct: L.searches && L.searches.hitPct != null ? L.searches.hitPct : null,
    taskBaselineBytes: num(L.task && L.task.baselineBytes),
    taskActualBytes: num(L.task && L.task.canvasBytes),
    offloadAddedEntries: num(L.offload && L.offload.addedEntries),
    offloadAddedBytes: num(L.offload && L.offload.addedBytes),
    offloadPointerBytes: num(L.offload && L.offload.pointerBytes),
    offloadCumulativeBytes: num(L.offload && L.offload.cumulativeBytes),
    offloadStockEntries: num(L.offload && L.offload.stockEntries),
    offloadStockBytes: num(L.offload && L.offload.stockBytes),
    archiveBaselineBytes: num(L.archive && L.archive.baselineBytes),
    archiveActualBytes: num(L.archive && L.archive.actualBytes),
    archiveRatio: L.archive && L.archive.ratio != null ? L.archive.ratio : null,
    distilledEntries: num(L.archive && L.archive.distilledEntries),
    distilledBytes: num(L.archive && L.archive.distilledBytes),
    questions: num(L.questions),
    contextBaselineBytes: num(L.context && L.context.baselineBytes),
    contextActualBytes: num(L.context && L.context.actualBytes),
    contextSavedPct: L.context && L.context.savedPct != null ? L.context.savedPct : null,
    perQuestionBytes: L.perQuestionBytes == null ? null : num(L.perQuestionBytes),
  };
}

export function ledgerFromSnapshot(s = {}) {
  return {
    ...computeLedger({
    fixed: s.fixedParts && Object.keys(s.fixedParts).length ? s.fixedParts : (num(s.fixedBytes) ? { protocol: num(s.fixedBytes) } : {}),
    memory: {
      fullBytes: s.memoryFullBytes,
      residentBytes: s.memoryResidentBytes,
      hitsBytes: s.memoryHitsBytes,
      searchCount: s.searchCount,
      searchEmptyCount: s.searchEmptyCount,
    },
    task: { baselineBytes: s.taskBaselineBytes, canvasBytes: s.taskActualBytes },
    offload: {
      addedBytes: s.offloadAddedBytes,
      addedEntries: s.offloadAddedEntries,
      pointerBytes: s.offloadPointerBytes,
      cumulativeBytes: s.offloadCumulativeBytes,
      stockBytes: s.offloadStockBytes,
      stockEntries: s.offloadStockEntries,
    },
    archive: {
      eventBytes: s.archiveBaselineBytes,
      dailyBytes: s.archiveActualBytes,
      distilledBytes: s.distilledBytes,
      distilledEntries: s.distilledEntries,
    },
    questions: s.questions,
    }),

    capturedAt: String(s.capturedAt || ''),
  };
}

export function parseSnapshots(text) {
  const out = [];
  for (const line of String(text ?? '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const o = JSON.parse(line);
      if (o && typeof o === 'object' && o.date) out.push(o);
    } catch {  }
  }
  return out;
}

export function serializeSnapshots(list) {
  const lines = (list || []).filter((o) => o && o.date).map((o) => JSON.stringify(o));
  return lines.length ? lines.join('\n') + '\n' : '';
}

export function upsertSnapshot(list, record) {
  const rest = (list || []).filter((o) => o && o.date && o.date !== record.date);
  return [...rest, record].sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

export function readMergedSnapshots(root) {
  const shards = [];
  for (const src of shardSources(root, 'token-metrics.jsonl', METRIC_STORE_REL)) {
    shards.push({ host: src.host, snapshots: parseSnapshots(src.text) });
  }
  return [...mergeSnapshotRows(shards).values()];
}

export function recentSnapshots(list, days = 14) {
  return [...(list || [])]
    .filter((o) => o && o.date)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .slice(-days);
}

const SUM_FIELDS = [
  'searchCount', 'searchEmptyCount', 'memoryHitsBytes',
  'taskBaselineBytes', 'taskActualBytes',
  'offloadAddedEntries', 'offloadAddedBytes', 'offloadPointerBytes',
  'offloadCumulativeBytes', 'offloadStockEntries', 'offloadStockBytes',
  'distilledEntries', 'distilledBytes',
];

const SINGLE_FIELDS = [
  'questions',
  'fixedBytes',
  'memoryFullBytes', 'memoryResidentBytes',
  'archiveBaselineBytes', 'archiveActualBytes',
];

export function mergeSnapshotRows(shards) {
  const acc = new Map();   // date → { sum, single, sources, kind }
  for (const { host, snapshots } of shards || []) {
    for (const s of snapshots || []) {
      if (!s || !s.date) continue;
      const date = String(s.date);
      let cur = acc.get(date);
      if (!cur) {
        cur = {
          sum: { ...s },
          single: Object.fromEntries(SINGLE_FIELDS.map((k) => [k, num(s[k])])),
          sources: {},
          kind: String(s.kind || ''),
        };
        acc.set(date, cur);
      } else {
        for (const k of SUM_FIELDS) cur.sum[k] = num(cur.sum[k]) + num(s[k]);
        for (const k of SINGLE_FIELDS) cur.single[k] = Math.max(cur.single[k], num(s[k]));

        const parts = { ...(cur.sum.fixedParts || {}) };
        for (const [k, v] of Object.entries(s.fixedParts || {})) parts[k] = Math.max(num(parts[k]), num(v));
        cur.sum.fixedParts = parts;
      }
      cur.sources[host] = String(s.capturedAt || '');
    }
  }

  const out = new Map();
  for (const [date, cur] of [...acc.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const capturedAt = Object.values(cur.sources).filter(Boolean).sort().slice(-1)[0] || '';
    const row = snapshotOf(
      ledgerFromSnapshot({ ...cur.sum, ...cur.single }),
      date,
      { capturedAt, kind: cur.kind },
    );
    row.sources = cur.sources;
    out.set(date, row);
  }
  return out;
}

const DAYS = 14;

const PANELS = [
  { label: LEDGER_LABELS.amortized + ' (KB)', pick: (s) => (s.perQuestionBytes == null ? null : num(s.perQuestionBytes) / 1024), digits: 1 },
  { label: "Memory Loading (KB)", pick: (s) => num(s.memoryActualBytes) / 1024, digits: 1 },
  { label: "Task Status (KB)", pick: (s) => num(s.taskActualBytes) / 1024, digits: 1 },
  { label: LEDGER_LABELS.fixed + ' (KB)', pick: (s) => (num(s.fixedBytes) ? num(s.fixedBytes) / 1024 : null), digits: 1 },
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
  '      .base { fill: #c7d2fe; } .real { fill: #2563eb; } .track { fill: rgba(15,23,42,.10); }',
  '      @media (prefers-color-scheme: dark) {',
  '        .t { fill: #e6e8eb; } polyline { stroke: #7cb3ff; } .d circle { fill: #7cb3ff; } .v { fill: #7cb3ff; }',
  '        .ax { stroke: rgba(255,255,255,.18); } .h, .e, .s { fill: #9aa4b2; }',
  '        .base { fill: #33406b; } .real { fill: #7cb3ff; } .track { fill: rgba(255,255,255,.10); }',
  '      }',
  '    </style>',
].join('\n');

function panelSvg({ x0, y0, w, h, points, label, digits, dates }) {
  const head = `      <text x="${x0}" y="${y0 + 13}" class="t">${esc(label)}</text>\n`
    + `      <text x="${x0 + w}" y="${y0 + 13}" class="h" text-anchor="end">↓ Lower uses fewer tokens</text>
`;
  if (points.length < 2) return head + `      <text x="${x0}" y="${y0 + 62}" class="e">Insufficient data (at least 2 daily snapshots needed)</text>
`;
  const cx = x0, cy = y0 + 24, cw = w, ch = h - 24;
  const vals = points.map((p) => p.v);
  let min = Math.min(...vals), max = Math.max(...vals);
  if (max === min) { const pad = Math.abs(max) > 0 ? Math.abs(max) * 0.1 : 1; min -= pad; max += pad; }
  else { const pad = (max - min) * 0.12; min -= pad; max += pad; }
  const px = (i) => cx + (i * cw) / (points.length - 1);
  const py = (v) => cy + ch - ((v - min) / (max - min)) * ch;
  const poly = points.map((p, i) => `${px(i).toFixed(1)},${py(p.v).toFixed(1)}`).join(' ');
  const dots = points.map((p, i) => `<circle cx="${px(i).toFixed(1)}" cy="${py(p.v).toFixed(1)}" r="2.6"/>`).join('');
  const last = points[points.length - 1];
  const labelY = Math.min(Math.max(py(last.v) + 4, cy + 10), cy + ch - 2);
  return head
    + `      <line x1="${cx}" y1="${cy + ch}" x2="${cx + cw}" y2="${cy + ch}" class="ax"/>\n`
    + `      <text x="${cx}" y="${cy + 10}" class="s">${esc(max.toFixed(digits))}</text>\n`
    + `      <text x="${cx}" y="${cy + ch - 3}" class="s">${esc(min.toFixed(digits))}</text>\n`
    + `      <polyline points="${poly}"/>\n`
    + `      <g class="d">${dots}</g>\n`
    + `      <text x="${cx + cw}" y="${labelY.toFixed(1)}" class="v" text-anchor="end">${esc(last.v.toFixed(digits))}</text>\n`
    + `      <text x="${cx}" y="${y0 + h + 11}" class="s">${esc(dates[0])}</text>\n`
    + `      <text x="${cx + cw}" y="${y0 + h + 11}" class="s" text-anchor="end">${esc(dates[dates.length - 1])}</text>\n`;
}

export function renderTrendSvg(snapshots, { days = DAYS } = {}) {
  const list = recentSnapshots(snapshots, days);

  const W = 920, H = 404, PW = 430, PH = 150, GX = 30, GY = 46;
  if (!list.length) {
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Token Savings Trend">
${SVG_STYLE}\n`
      + `      <text x="20" y="40" class="e">No snapshots yet (collect at start/end of each workday; trends require 2 days)</text>
    </svg>`;
  }
  const dates = list.map((s) => String(s.date).slice(5));
  const panels = PANELS.map((p, i) => {
    const points = [];
    for (const s of list) { const v = p.pick(s); if (v == null || !Number.isFinite(v)) continue; points.push({ v }); }
    const col = i % 2, row = Math.floor(i / 2);
    return panelSvg({ x0: 20 + col * (PW + GX), y0: 34 + row * (PH + GY), w: PW, h: PH, points, label: p.label, digits: p.digits, dates });
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Token Savings Trend (last ${list.length} days)">
${SVG_STYLE}\n${panels}    </svg>`;
}

export function renderFunnelSvg(L = {}) {
  const W = 920, ROW = 46, HEAD = 34, FOOT = 30;
  const rows = [
    ["Memory Loading", L.groups && L.groups.memory],
    ["Task Status", L.groups && L.groups.task],
    ["Context Offloading", L.groups && L.groups.offload],
  ].filter(([, g]) => g && g.baselineBytes > 0);
  const H = HEAD + ROW * (rows.length + 1) + FOOT;
  if (!rows.length) {
    return `<svg viewBox="0 0 ${W} ${Math.max(H, 110)}" width="100%" role="img" aria-label="Token Savings Comparison">
${SVG_STYLE}\n`
      + `      <text x="20" y="40" class="e">No comparison yet (not enough memory, task events or tool output to compress)</text>
    </svg>`;
  }
  const LABEL_W = 108, BAR_X = 128, BAR_W = 600, TEXT_X = 746;
  const max = Math.max(...rows.map(([, g]) => g.baselineBytes), L.context ? L.context.baselineBytes : 0);
  const barW = (bytes) => Math.max(1, (num(bytes) / max) * BAR_W);
  const out = [];
  out.push(`      <text x="20" y="22" class="t">Uncompressed reading vs actual reading (both enter context; shorter uses fewer tokens)</text>`);
  rows.forEach(([label, g], i) => {
    const y = HEAD + i * ROW;
    out.push(`      <text x="20" y="${y + 20}" class="s">${esc(label)}</text>`);
    out.push(`      <rect x="${BAR_X}" y="${y + 4}" width="${BAR_W}" height="11" rx="5" class="track"/>`);
    out.push(`      <rect x="${BAR_X}" y="${y + 4}" width="${barW(g.baselineBytes).toFixed(1)}" height="11" rx="5" class="base"/>`);
    out.push(`      <rect x="${BAR_X}" y="${y + 20}" width="${barW(g.actualBytes).toFixed(1)}" height="11" rx="5" class="real"/>`);
    out.push(`      <text x="${TEXT_X}" y="${y + 15}" class="s">Uncompressed ${esc(kb(g.baselineBytes))}</text>`);
    out.push(`      <text x="${TEXT_X}" y="${y + 31}" class="v">Actual ${esc(kb(g.actualBytes))}  Saved ${esc(pct(g.savedPct || 0))}</text>`);
  });
  const y = HEAD + rows.length * ROW;
  const c = L.context || {};
  out.push(`      <text x="20" y="${y + 20}" class="t">Total</text>`);
  out.push(`      <rect x="${BAR_X}" y="${y + 4}" width="${BAR_W}" height="11" rx="5" class="track"/>`);
  out.push(`      <rect x="${BAR_X}" y="${y + 4}" width="${barW(c.baselineBytes).toFixed(1)}" height="11" rx="5" class="base"/>`);
  out.push(`      <rect x="${BAR_X}" y="${y + 20}" width="${barW(c.actualBytes).toFixed(1)}" height="11" rx="5" class="real"/>`);
  out.push(`      <text x="${TEXT_X}" y="${y + 15}" class="s">Uncompressed ${esc(kb(c.baselineBytes))}</text>`);
  out.push(`      <text x="${TEXT_X}" y="${y + 31}" class="v">Actual ${esc(kb(c.actualBytes))}  Saved ${esc(pct(c.savedPct || 0))}</text>`);
  out.push(`      <text x="20" y="${y + ROW + 16}" class="h">Method: baseline estimates uncompressed reading (AIPA's internal comparison, not measured host tokens); fixed cost ${esc(kb(L.fixedBytes))} is not compressible and is excluded.</text>`);
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Token Savings Comparison">
${SVG_STYLE}\n${out.join('\n')}\n    </svg>`;
}

// ---------------- IO ----------------

export function pickCanvas(root, project = '') {
  const files = listLocalFiles(root, 'canvas', join('state', 'canvas'), '.mmd');
  if (!files.length) return '';
  if (project) {
    const hit = files.find((f) => f.name === `${project}.mmd`);
    if (hit) return hit.path;
  }
  const byTime = files.map((f) => ({ f, t: statSync(f.path).mtimeMs })).sort((a, b) => b.t - a.t);
  return byTime[0].f.path;
}

export function appendOffloadLedger(root, entry) {
  const row = {
    at: String(entry.at || '').slice(0, 10),
    id: entry.id,
    project: entry.project || '',
    bytes: num(entry.bytes),
    summary: entry.summary || '',
  };

  if (entry.type) row.type = String(entry.type);
  if (entry.entries != null) row.entries = num(entry.entries);
  return appendLocalLog(root, OFFLOAD_LEDGER, row);
}

export const isOffloadPut = (row) => String((row && row.type) || '') !== 'gc';

export function offloadStockAsOf(root, day) {
  const target = String(day || '');
  if (!target) return { entries: 0, bytes: 0, rows: 0 };
  let entries = 0;
  let bytes = 0;
  let rows = 0;
  for (const row of readOffloadLedger(root)) {
    const at = String(row.at || '').slice(0, 10);
    if (!at || at > target) continue;
    rows += 1;
    if (isOffloadPut(row)) {
      entries += 1;
      bytes += num(row.bytes);
    } else {
      entries -= row.entries != null ? num(row.entries) : 1;
      bytes -= num(row.bytes);
    }
  }
  return { entries: Math.max(0, entries), bytes: Math.max(0, bytes), rows };
}

export function readOffloadLedger(root) {

  return readLocalLog(root, OFFLOAD_LEDGER, { tsKey: 'at' }).filter((o) => o && o.at);
}

function sumBytes(files, root, dir) {
  let total = 0;
  for (const f of files) total += Buffer.byteLength(readFileSync(join(root, dir, f), 'utf8'), 'utf8');
  return total;
}

export function countQuestions(root, day) {
  if (!day) return 0;
  const dsh=sharedDayStartHour(root);
  return readEvents(root).filter(e => e.type==='user_message' && dayKey(e.ts_local || '', dsh)===String(day)).length;
}

export function canvasBytesAsOf(root, day, project = '') {
  if (!day) return 0;
  const dsh = sharedDayStartHour(root);
  let bytes = 0;
  let lastTs = '';

  for (const o of readLocalLog(root, MEMORY_WRITES)) {
    if (!o || o.type !== 'canvas') continue;
    if (project && String(o.id) !== `canvas:${project}`) continue;
    const ts = String(o.ts || '');
    if (!ts || dayKey(ts, dsh) > String(day)) continue;
    if (ts <= lastTs) continue;
    lastTs = ts;
    bytes = num(o.bytes);
  }
  return bytes;
}

export function collectFromRoot(root, { project = '', date = '', canvasBytes: canvasOverride = null, stock: stockOverride = null } = {}) {
  const bytesOf = (rel) => (existsSync(join(root, rel)) ? Buffer.byteLength(readFileSync(join(root, rel), 'utf8'), 'utf8') : 0);

  const absBytes = (abs) => (existsSync(abs) ? Buffer.byteLength(readFileSync(abs, 'utf8'), 'utf8') : 0);
  const dayStartHour = sharedDayStartHour(root);
  const now = new Date();
  const p = (x) => String(x).padStart(2, '0');
  const nowTs = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())} ${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`;
  const day = date || dayKey(nowTs, dayStartHour);

  const fixed = {
    protocol: bytesOf('core-space/activation.md'),
    policy: bytesOf('core-space/policy.md'),
    profile: bytesOf('user-space/profile.yaml'),
    privacy: bytesOf('user-space/privacy.yaml'),
    overrides: bytesOf('user-space/overrides.yaml'),
  };

  const memDir = join(root, 'user-space', 'memory');
  const memFiles = existsSync(memDir) ? readdirSync(memDir).filter((f) => f.endsWith('.md')) : [];
  const memoryFull = sumBytes(memFiles, root, 'user-space/memory');
  const memoryResident = bytesOf('user-space/memory/context.md') + bytesOf('user-space/memory/instructions.md');
  let hitsBytes = 0, legacyHitRows = 0, searchCount = 0, searchEmpty = 0;
  for (const o of readLocalLog(root, SEARCH_LOG)) {
    {
        if (String(o.ts || '').slice(0, 10) !== day) continue;

        if (num(o.v) >= 2) { hitsBytes += num(o.bytes); searchCount += 1; if (num(o.hits) === 0) searchEmpty += 1; }
        else legacyHitRows += 1;
    }
  }

  const canvasPath = pickCanvas(root, project);
  const canvasBytes = canvasOverride != null
    ? num(canvasOverride)
    : (canvasPath ? Buffer.byteLength(readFileSync(canvasPath, 'utf8'), 'utf8') : 0);
  const resumeText = (() => { try { return readFileSync(join(root, 'state', 'resume-prompt.md'), 'utf8'); } catch { return ''; } })();
  const i = resumeText.search(/Recent events:|\u6700\u8fd1\u4e8b\u4ef6\uff1a/);
  const taskBaseline = i >= 0 ? Buffer.byteLength(resumeText.slice(i), 'utf8') : 0;

  const ledger = readOffloadLedger(root);

  const putRows = ledger.filter(isOffloadPut);
  const todayEntries = putRows.filter((e) => String(e.at).slice(0, 10) === day);
  let index = { entries: [] };
  try { index = JSON.parse(readFileSync(join(root, 'state', 'offload', 'index.json'), 'utf8')); } catch { index = { entries: [] }; }
  const indexStock = (index.entries || []).filter((e) => e);
  const pointerBytes = todayEntries.reduce((s, e) => s + Buffer.byteLength(formatPointer(e), 'utf8'), 0);

  const dayEventFiles = listEventFiles(root).filter((f) => f.day === String(day));

  let distilledBytes = 0, distilledEntries = 0;
  for (const o of readLocalLog(root, MEMORY_WRITES)) {
    if (VALID_TYPES.includes(o.type) && dayKey(String(o.ts || ''), dayStartHour) === day) { distilledEntries += 1; distilledBytes += num(o.bytes); }
  }
  const questions = countQuestions(root, day);

  return computeLedger({
    fixed,
    memory: { fullBytes: memoryFull, residentBytes: memoryResident, hitsBytes, legacyHitRows, searchCount, searchEmptyCount: searchEmpty },
    task: { baselineBytes: taskBaseline, canvasBytes },
    offload: {
      addedBytes: todayEntries.reduce((s, e) => s + num(e.bytes), 0),
      addedEntries: todayEntries.length,
      pointerBytes,
      cumulativeBytes: putRows.reduce((s, e) => s + num(e.bytes), 0),
      stockBytes: stockOverride ? num(stockOverride.bytes) : indexStock.reduce((s, e) => s + num(e.bytes), 0),
      stockEntries: stockOverride ? num(stockOverride.entries) : indexStock.length,
    },
    archive: {
      eventBytes: dayEventFiles.reduce((s, f) => s + absBytes(f.path), 0),
      dailyBytes: bytesOf(join('user-space', 'logs', 'daily', `DAILY-NOTE_${day}.md`)),
      distilledBytes,
      distilledEntries,
    },
    questions,
  });
}

export function renderLedger(root, day, { project = '' } = {}) {
  const target = String(day || '');
  if (!target) return { ...collectFromRoot(root, { project }), source: 'live', fallbacks: [] };
  const snap = readSnapshots(root).find((s) => s && String(s.date) === target) || null;

  const hasEvents = listEventFiles(root).some((f) => f.day === target);

  if (!hasEvents && !snap) {
    return { ...collectFromRoot(root, { project, date: target }), source: 'empty', fallbacks: [] };
  }

  if (!hasEvents) {
    return { ...ledgerFromSnapshot(snap), source: 'snapshot', capturedAt: snap.capturedAt || '', fallbacks: [] };
  }

  const fallbacks = [];
  const liveCanvas = canvasBytesAsOf(root, target, project);
  let canvasBytes = liveCanvas;
  if (liveCanvas <= 0 && num(snap && snap.taskActualBytes) > 0) {
    canvasBytes = num(snap.taskActualBytes);
    fallbacks.push("Canvas");
  }
  const liveStock = offloadStockAsOf(root, target);
  let stock = liveStock;

  if (liveStock.rows === 0 && num(snap && snap.offloadStockBytes) > 0) {
    stock = { entries: num(snap.offloadStockEntries), bytes: num(snap.offloadStockBytes) };
    fallbacks.push("Inventory");
  }
  return {
    ...collectFromRoot(root, { project, date: target, canvasBytes, stock }),
    source: 'live',
    capturedAt: (snap && snap.capturedAt) || '',
    fallbacks,
  };
}

export function resolveMetricStore(root) {
  const id = readHostId(root);
  if (id && isValidHostId(id)) {
    return { hostId: id, path: join(hostDir(root, id), 'token-metrics.jsonl'), hint: null };
  }
  return { hostId: null, path: join(root, METRIC_STORE_REL), hint: hostIdHint(root) };
}

export function writeSnapshot(root, date, ledger, { capturedAt = '', kind = 'capture' } = {}) {
  const path = resolveMetricStore(root).path;
  const prev = existsSync(path) ? parseSnapshots(readFileSync(path, 'utf8')) : [];

  const list = upsertSnapshot(prev, snapshotOf(ledger, date, { capturedAt: capturedAt || tsLocal(new Date()), kind }));
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, serializeSnapshots(list), 'utf8');
  return { path, snapshots: list };
}

export function readSnapshots(root) {
  const { hostId, path } = resolveMetricStore(root);
  const local = existsSync(path) ? parseSnapshots(readFileSync(path, 'utf8')) : [];
  if (!hostId) return local;
  const legacyPath = join(root, METRIC_STORE_REL);
  const legacy = existsSync(legacyPath) ? parseSnapshots(readFileSync(legacyPath, 'utf8')) : [];
  const byDate = new Map();
  for (const r of legacy) byDate.set(String(r.date), r);
  for (const r of local) byDate.set(String(r.date), r);
  return [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

export function periodSummary(snapshots, { days = 0, month = '', year = '' } = {}) {
  let list = [...(snapshots || [])].filter((s) => s && s.date).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  if (month) list = list.filter((s) => String(s.date).startsWith(`${month}-`));
  else if (year) list = list.filter((s) => String(s.date).startsWith(`${year}-`));
  else if (days > 0) list = list.slice(-days);

  const label = month ? `${month} (monthly)` : year ? `${year} (annual)` : `Last ${days} days`;
  if (!list.length) return { label, days: 0, lines: [`Token Savings Summary (${label}): no snapshots`] };

  const pick = (k) => list.map((s) => s[k]).filter((v) => v != null && Number.isFinite(Number(v))).map(Number);
  const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
  const savedPct = pick('contextSavedPct');
  const perQ = pick('perQuestionBytes');
  const fixed = pick('fixedBytes');
  const ratio = pick('archiveRatio');
  const fmtKb = (n) => (n == null ? "unavailable" : kb(n));
  const pctTxt = (n) => (n == null ? "unavailable" : `${n.toFixed(1)}%`);

  const lines = [];
  lines.push(`Token Savings Summary (${label}, ${list.length} days with snapshots)`);
  if (savedPct.length) {
    lines.push(`Context savings ratio: average ${pctTxt(avg(savedPct))} (best ${pctTxt(Math.max(...savedPct))} / worst ${pctTxt(Math.min(...savedPct))})`);
    const first = savedPct[0], last = savedPct[savedPct.length - 1];
    if (savedPct.length >= 3) lines.push(`Trend: ${first.toFixed(1)}% → ${last.toFixed(1)}% (${last >= first ? "improving" : "worsening"})`);
  } else lines.push("Context savings ratio: unavailable");
  if (perQ.length) lines.push(`${LEDGER_LABELS.amortized}: ${fmtKb(avg(perQ))} (best ${fmtKb(Math.min(...perQ))} / worst ${fmtKb(Math.max(...perQ))}; legacy ledger formula excludes repeated per-turn loading)`);
  if (fixed.length) lines.push(`${LEDGER_LABELS.fixed}: ${fmtKb(fixed[0])} → ${fmtKb(fixed[fixed.length - 1])} (one file-size copy of protocol and profile)`);
  if (ratio.length) lines.push(`Archive compression: average ${(ratio.reduce((a, b) => a + b, 0) / ratio.length).toFixed(1)}×`);
  const searches = list.reduce((s, x) => s + num(x.searchCount), 0);
  const empties = list.reduce((s, x) => s + num(x.searchEmptyCount), 0);
  if (searches) lines.push(`Search: ${searches} calls, ${empties} zero-hit calls (${((empties / searches) * 100).toFixed(0)}%)`);
  const offload = list.reduce((s, x) => s + num(x.offloadAddedBytes), 0);
  if (offload) lines.push(`Offloading: total ${kb(offload)}`);
  return { label, days: list.length, lines };
}

export function searchInsights(root, { days = 7, today = '' } = {}) {
  const allRows = readLocalLog(root, SEARCH_LOG);
  if (!allRows.length) return { days, rows: 0, queries: 0, empty: [], repeated: [], expandOnly: 0, lowScore: [], avgTopScore: null };
  const cutoff = (() => {
    if (!today) return '';
    const d = new Date(`${today}T00:00:00`);
    d.setDate(d.getDate() - (days - 1));
    const p = (x) => String(x).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  })();
  const rows = allRows.filter((o) => {
    if (num(o.v) < 2) return false;
    if (cutoff && String(o.ts || '').slice(0, 10) < cutoff) return false;
    return true;
  });
  const empty = rows.filter((r) => num(r.hits) === 0).map((r) => String(r.q || ''));
  const byQ = new Map();
  for (const r of rows) {
    const q = String(r.q || '');
    if (!q) continue;
    byQ.set(q, (byQ.get(q) || 0) + 1);
  }
  const repeated = [...byQ.entries()].filter(([, n]) => n > 1).map(([q, n]) => ({ q, count: n })).sort((a, b) => b.count - a.count);
  const scored = rows.filter((r) => num(r.hits) > 0 && num(r.topScore) > 0);
  const avgTopScore = scored.length ? Number((scored.reduce((s, r) => s + num(r.topScore), 0) / scored.length).toFixed(2)) : null;
  return {
    days,
    rows: rows.length,
    queries: byQ.size,
    empty,
    repeated,
    expandOnly: rows.filter((r) => num(r.hits) > 0 && String(r.via || '').includes('expand') && !String(r.via || '').startsWith('q+')).length,
    lowScore: scored.filter((r) => num(r.topScore) <= 1).map((r) => String(r.q || '')).slice(0, 5),
    avgTopScore,
  };
}

export function searchInsightLines(ins) {

  const win = `Last ${num(ins && ins.days) > 0 ? ins.days : 7} days`;
  if (!ins || !ins.rows) return [`Search quality: ${win}: no search records under the new accounting definition`];
  const lines = [`Search quality (${win}, ${ins.rows} calls / ${ins.queries} distinct queries): average first-result score ${ins.avgTopScore == null ? "unavailable" : ins.avgTopScore}`];
  lines.push(ins.empty.length
    ? `Queries absent from memory: ${ins.empty.length} calls -> these are memory gaps; persist the answers in memory:${ins.empty.slice(0, 3).map((q) => `"${q}"`).join(' ')}`
    : "Queries absent from memory: 0 (all searches matched existing memories)");
  lines.push(ins.repeated.length
    ? `Repeated questions: ${ins.repeated.length} -> distill them or persist their conclusions:${ins.repeated.slice(0, 3).map((x) => `"${x.q}"×${x.count}`).join(' ')}`
    : "Repeated questions: 0");
  if (ins.expandOnly) lines.push(`Expansion-only matches: ${ins.expandOnly} calls -> query wording differs from memory; consider adding keywords`);
  if (ins.lowScore.length) lines.push(`First-result score <=1 (weak relevance): ${ins.lowScore.length} calls: ${ins.lowScore.slice(0, 3).map((q) => `"${q}"`).join(' ')}`);
  return lines;
}

export const hostName = () => hostname();
