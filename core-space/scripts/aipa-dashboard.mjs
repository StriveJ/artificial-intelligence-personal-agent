#!/usr/bin/env node
// dashboard
import {clockTimestamp as businessTimestamp} from './lib/day-clock.mjs';

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { freshHint, renderDashboard } from './lib/dashboard.mjs';
import { parseRoadmapOpen } from './lib/dashboard.mjs';
import { kb, ledgerRows, LEDGER_LABELS, periodSummary, readMergedSnapshots, renderFunnelSvg, renderLedger, renderTrendSvg, searchInsightLines, searchInsights } from './lib/token-metrics.mjs';
import { cacheHitPctOf, hostLabel, hostUsageRows, readAllUsageRows, renderHostTrendSvg } from './lib/host-usage.mjs';
import { extractTodoItems } from './lib/signal-core.mjs';
import { listLocalFiles } from './lib/host-id.mjs';
import { readMergedSignal } from './lib/signal-store.mjs';
import { parseCanvas } from './lib/canvas.mjs';
import { parseProfile,DRAFT_PATH } from './lib/profile-draft.mjs';
import { parseSceneFrontmatter } from './lib/sceneblock.mjs';
import { crashGuard } from './lib/error-sink.mjs';
import { todayKey } from './lib/day-clock.mjs';

function arg(n) { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : ''; }
function tsLocal(d){return businessTimestamp(root,d);}
const root = arg('root') || '.';
crashGuard(root, 'aipa-dashboard');
const nowTs = arg('now') || tsLocal(new Date());

const today = todayKey(root, { ts: nowTs });
const project = arg('project') || '';

const outArg = arg('out');
const outPath = outArg
  ? (isAbsolute(outArg) ? outArg : join(root, outArg))
  : join(root, 'user-space', 'logs', 'dashboard.html');
const readText = (p) => { try { return readFileSync(p, 'utf8'); } catch { return ''; } };
const bullets = (text, limit = 12) => text.split(/\r?\n/).map((s) => s.trim()).filter((s) => s.startsWith('- ')).slice(-limit).map((s) => s.replace(/^-\s+/, ''));

const dailyDir = join(root, 'user-space', 'logs', 'daily');
const dailyFiles = existsSync(dailyDir)
  ? readdirSync(dailyDir).filter((f) => /^DAILY-NOTE_\d{4}-\d{2}-\d{2}\.md$/.test(f)).sort().slice(-3).reverse()
  : [];
const dailyItems = dailyFiles.map((f) => {
  const text = readText(join(dailyDir, f));
  const sum = text.match(/##\s*(?:Daily Summary|\u4eca\u65e5\u603b\u7ed3)[\s\S]*?(?=\n##|$)/);
  const first = sum ? sum[0].split(/\r?\n/).map((s) => s.trim()).filter((s) => s && !s.startsWith('#') && !s.startsWith('>')).slice(0, 1)[0] : '';
  return `${f.slice(11, 21)} ${(first || '').slice(0, 120)}`;
});

const memDir = join(root, 'user-space', 'memory');
const memFiles = existsSync(memDir) ? readdirSync(memDir).filter((f) => f.endsWith('.md')).sort() : [];
const memoryItems = [];
for (const f of memFiles) {
  const bs = bullets(readText(join(memDir, f)), 8);
  if (bs.length) memoryItems.push(`[${f.replace('.md', '')}]${bs.join(' / ').slice(0, 260)}`);
}

const projDir = join(root, 'user-space', 'projects');
const sceneItems = [];
if (existsSync(projDir)) {
  for (const p of readdirSync(projDir)) {
    const f = join(projDir, p, 'scene.md');
    if (!existsSync(f)) continue;
    const text = readText(f);
    const fm = parseSceneFrontmatter(text);
    const open = (text.match(/##\s*(?:Open Loops|\u672a\u95ed\u73af)\s*\n([\s\S]*?)(?=\n##|$)/) || [])[1] || '';
    const firstOpen = open.split(/\r?\n/).map((s) => s.trim()).filter((s) => s.startsWith('- '))[0] || '';
    sceneItems.push(`${p} (updated ${fm.updated || '-'}, last activity ${fm.last_activity || '-'})${firstOpen ? "  Open loops: " + firstOpen.replace(/^-\s+/, '').slice(0, 80) : ''}`);
  }
}

const profile = parseProfile(readText(join(root, 'user-space', 'profile.yaml')));
const draftText = readText(join(root,DRAFT_PATH));
const draftDate = (draftText.match(/^# (?:Profile Draft \(|\u753b\u50cf\u8349\u6848\uff08)(\d{4}-\d{2}-\d{2})(?: generated\)| \u751f\u6210\uff09)/m) || [])[1] || '';
const profileItems = [
  profile.name ? `Identity: ${profile.name} · ${profile.role || ''} · ${profile.industry || ''}` : "Identity: (not set)",
  profile.tech_stack ? `Technology stack: ${profile.tech_stack.join(', ')}` : '',
  profile.knowledge_gaps ? `Knowledge gaps: ${(profile.knowledge_gaps || []).join('; ').slice(0, 160)}` : '',
  draftDate ? `Profile draft: ${draftDate} generated (review pending; see the draft header for adoption status)` : "Profile draft: (none yet)",
].filter(Boolean);

const remDir = join(root, 'user-space', 'reminders');
const remItems = existsSync(remDir)
  ? readdirSync(remDir).filter((f) => f.endsWith('.json')).slice(0, 8).map((f) => {
    try { const o = JSON.parse(readText(join(remDir, f))); return `${o.title || f}  Events ${o.event_at || '-'}  Status ${o.status || '-'}`; } catch { return f; }
  })
  : [];

const signal = readMergedSignal(root, today);
const signalItems = [`Shown today: ${signal.count_today || 0}; muted: ${signal.muted ? "on" : "off"}; snoozed: ${Object.keys(signal.snooze || {}).length}`];

const canvasItems = listLocalFiles(root, 'canvas', join('state', 'canvas'), '.mmd').map((f) => `Task canvas: ${f.name}`);

const errorLines = readText(join(root, 'state', 'errors.log')).split(/\r?\n/).filter(Boolean).length;
const offload = (() => { try { return JSON.parse(readText(join(root, 'state', 'offload', 'index.json'))); } catch { return null; } })();
const skillCount = (() => {
  let n = 0;
  const walk = (dir) => { if (!existsSync(dir)) return; for (const f of readdirSync(dir)) { const p = join(dir, f); try { if (readdirSync(p)) walk(p); } catch { if (f === 'SKILL.md') n += 1; } } };
  walk(join(root, 'user-space', 'skills')); walk(join(root, 'core-space', 'common', 'skills')); walk(join(root, 'core-space', 'mentors'));
  return n;
})();
const healthItems = [
  `Script failures: ${errorLines}`,
  `Skills: ${skillCount}`,
];

const todoItems = buildTodos();

const ledger = renderLedger(root, today, { project });
const tokenRows = ledgerRows(ledger);
const ledgerKpi = [
  ledger.context.savedPct != null
    ? { value: `${Math.abs(Math.round(ledger.context.savedPct))}%`, label: ledger.context.savedPct >= 0 ? LEDGER_LABELS.saved : LEDGER_LABELS.extra, hint: `${kb(ledger.context.baselineBytes)} → ${kb(ledger.context.actualBytes)}` }
    : { value: "unavailable", label: LEDGER_LABELS.saved, hint: "No comparable material yet" },
  ledger.perQuestionBytes != null
    ? { value: kb(ledger.perQuestionBytes), label: LEDGER_LABELS.amortized, hint: `Count one copy of fixed material, divided by ${ledger.questions} questions` }
    : { value: "unavailable", label: LEDGER_LABELS.amortized, hint: "No questions recorded today" },
  ledger.fixedBytes
    ? { value: kb(ledger.fixedBytes), label: LEDGER_LABELS.fixed, hint: `Protocol ${kb(ledger.fixedParts.protocol || 0)}; repeated loading excluded` }
    : { value: "unavailable", label: LEDGER_LABELS.fixed, hint: "Fixed-material files unavailable" },
];
const trendSnapshots = readMergedSnapshots(root);
const trendSvg = renderTrendSvg(trendSnapshots);
const funnelSvg = renderFunnelSvg(ledger);

const weekLines = periodSummary(trendSnapshots, { days: 7 }).lines;
const insightLines = searchInsightLines(searchInsights(root, { days: 7, today }));

const usageRows = readAllUsageRows(root);
const todayUsage = usageRows.filter((r) => r.date === today);
const usageMachines = [...new Set(todayUsage.map((r) => r.machine))].sort();
const kpiOf = (rows) => {
  const sumOf = (k) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
  const top = rows.slice().sort((a, b) => (b.ctxTokens || 0) - (a.ctxTokens || 0))[0];
  return [
    top && top.ctxPct != null
      ? { value: `${top.ctxPct}%`, label: "Context Utilization", hint: `${kb(top.ctxTokens)} / ${kb(top.ctxWindow)}` }
      : { value: "unavailable", label: "Context Utilization", hint: "Host did not provide a context-window field" },
    { value: `${(cacheHitPctOf(sumOf('cachedTokens'), sumOf('inputTokens')) ?? 0).toFixed(1)}%`, label: "Cache Hit", hint: "Higher uses fewer tokens (cached reads cost about one order of magnitude less)" },
    { value: `${(sumOf('freshTokens') / 1e6).toFixed(2)}M`, label: "Fresh Input Tokens", hint: `Total input ${(sumOf('inputTokens') / 1e6).toFixed(1)}M (including cached resends)` },
  ];
};
const USAGE_CAVEAT = { label: "Method", text: "This section uses measured host counters: Codex token_count from ~/.codex/sessions and Claude Code message.usage from ~/.claude/projects; only numeric fields are parsed. Ledger savings above are AIPA internal comparisons. These different sources must not be added or multiplied. Each device has its own row without aggregation because context utilization is an instantaneous per-device value." };

const usageTrends = [...new Set(usageRows.map((r) => `${r.machine}\u0000${r.host}`))]
  .map((k) => { const [machine, host] = k.split('\u0000'); return { machine, host }; })
  .sort((a, b) => String(a.machine).localeCompare(String(b.machine)) || String(a.host).localeCompare(String(b.host)));

const groups = [
  { id: 'aipa', title: "AIPA Ledger · Internal Comparison", hint: "Internal byte accounting; baseline assumes no compression" },
  { id: 'host', title: "Measured Host Usage · Codex / Claude Code", hint: "Token counters recorded by the host, without attribution" },
  { id: 'memory', title: "Memory and Projects", hint: "Long-term memory / scene blocks / profile" },
  { id: 'ops', title: "Operations and Health", hint: "Reminders / signals / failure records" },
];
const sections = [
  { title: "Pending Work", items: todoItems },
  { group: 'aipa', title: "Token Savings Ledger", kpi: ledgerKpi, badge: `Collected at ${nowTs.slice(11, 16)}` },
  { group: 'aipa', title: "Token Savings Detail", items: tokenRows },
  { group: 'aipa', title: "Token Savings Comparison", raw: funnelSvg, badge: "Uncompressed vs Actual" },
  { group: 'aipa', title: "Token Savings Trend", raw: trendSvg, badge: trendSnapshots.length ? `Last ${Math.min(trendSnapshots.length, 14)} days` : "No snapshots" },
  { group: 'aipa', title: "Last 7 Days", items: weekLines },
  { group: 'aipa', title: "Search Quality", items: insightLines, badge: "Improvement Candidates" },

  ...(usageMachines.length
    ? usageMachines.flatMap((m) => {
        const rows = todayUsage.filter((r) => r.machine === m);
        return [
          { group: 'host', title: `Actual Usage · ${m}`, kpi: kpiOf(rows), accent: 'host', badge: usageMachines.length > 1 ? "Separate per device · No aggregation" : "Measured host usage" },
          { group: 'host', title: `Host Details · ${m}`, items: hostUsageRows(rows, today), accent: 'host' },
        ];
      })
    : [{ group: 'host', title: "Actual Usage · Unavailable", kpi: [{ value: "unavailable", label: "Host Usage", hint: "Collect with aipa-host-usage snapshot" }], accent: 'host' }]),
  ...usageTrends.map(({ machine, host }) => ({ group: 'host', accent: 'host',
    title: `Usage Trend · ${machine} · ${hostLabel(host)}`,
    raw: renderHostTrendSvg(usageRows.filter((r) => r.machine === machine), host),
    badge: "Measured host usage" })),
  { group: 'host', title: "Method", items: [USAGE_CAVEAT], accent: 'host' },
  { group: 'memory', title: "Latest Daily Report", items: dailyItems.length ? dailyItems : ["(no daily reports yet)"] },
  { group: 'memory', title: "Long-Term Memory", items: memoryItems },
  { group: 'memory', title: "Project Scene Blocks", items: sceneItems },
  { group: 'memory', title: "Profile and Draft", items: profileItems },
  { group: 'ops', title: "Reminders and Signals", items: [...remItems, ...signalItems, ...canvasItems] },
  { group: 'ops', title: "Health Summary", items: healthItems },
];

function buildTodos() {
  const out = [];

  for (const f of listLocalFiles(root, 'canvas', join('state', 'canvas'), '.mmd')) {
    const c = parseCanvas(readText(f.path));
    for (const s of c.steps.filter((x) => x.status === 'doing' || x.status === 'todo')) {
      out.push(`[In Progress]${s.label} (canvas ${c.project || f.name} · ${s.status})`);
    }
  }
  const roadmap = readText(join(root, 'user-space', 'projects', 'aipa', 'upgrade', 'roadmap.md'));
  for (const r of parseRoadmapOpen(roadmap, 6)) out.push(`[Roadmap]${r}`);
  for (const t of extractTodoItems(readText(join(root, 'user-space', 'todo.md')), 5)) {
    if (/resolved|completed|\u5df2\u89e3\u51b3|\u5df2\u5b8c\u6210|✅/i.test(t)) continue;
    if (/^\*\*(?:Background|Description|See also|\u80cc\u666f|\u8bf4\u660e|\u8be6\u89c1)/i.test(t)) continue;
    out.push(`[todo.md]${t.slice(0, 100)}`);
  }
  if (existsSync(projDir)) {
    for (const p of readdirSync(projDir)) {
      const f = join(projDir, p, 'scene.md');
      if (!existsSync(f)) continue;
      const open = (readText(f).match(/##\s*(?:Open Loops|\u672a\u95ed\u73af)\s*\n([\s\S]*?)(?=\n##|$)/) || [])[1] || '';
      const first = open.split(/\r?\n/).map((s) => s.trim()).find((s) => s.startsWith('- '));
      if (first) out.push(`[Open Loops]${p}: ${first.replace(/^-\s+/, '').slice(0, 90)}`);
    }
  }
  return out;
}
mkdirSync(dirname(outPath), { recursive: true });

const html = renderDashboard({ generatedAt: nowTs, sections, groups, fontFamily: arg('font') || '', root });
writeFileSync(outPath, html, 'utf8');
console.log(JSON.stringify({ status: 'ok', out: outPath.replace(/\\/g, '/'), sections: sections.length, bytes: Buffer.byteLength(html, 'utf8') }));
