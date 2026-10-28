// Render a static, read-only dashboard from local projections. Escape rendered content and preserve privacy disclosures. Snapshot timestamps must remain visible because the page is not live. Copy feedback is local and each item owns its timer; task items use a pulse without changing their background.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { branchOfChannel } from './release-channel.mjs';

import { UPLOAD_SCOPE } from './telemetry-disclosure.mjs';

export function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function freshHint(generatedAt, nowTs, maxAgeHours = 24) {
  const a = Date.parse(String(generatedAt).replace(' ', 'T'));
  const b = Date.parse(String(nowTs).replace(' ', 'T'));
  if (!Number.isFinite(a) || !Number.isFinite(b)) return '';
  const hours = (b - a) / 3600000;
  if (hours <= maxAgeHours) return '';
  return `(data may be stale: ${Math.floor(hours)} hours old; run node core-space/scripts/aipa-dashboard.mjs to refresh)`;
}

function todoClassOf(text) {
  const t = String(text ?? '');
  if (/^(?:\[Completed\]|\u3010\u5df2\u5b8c\u6210\u3011)/.test(t) || /✅/.test(t)) return 'todo-closed';
  if (/^(?:\[In Progress\]|\u3010\u8fdb\u884c\u4e2d\u3011)/.test(t)) return 'todo-doing';
  if (/^(?:\[Roadmap\]|\u3010\u8def\u7ebf\u56fe\u3011)/.test(t)) return 'todo-roadmap';
  if (/^(?:\[Open Loops\]|\u3010\u672a\u95ed\u73af\u3011)/.test(t)) return 'todo-unclosed';
  return '';
}

function renderItem(i) {
  if (i && typeof i === 'object') {
    const label = i.label ? `<b class="k">${escapeHtml(i.label)}</b>` : '';
    const text = i.text ? linkify(escapeHtml(i.text)) : '';
    const value = i.value ? `<span class="num">${linkify(escapeHtml(i.value))}</span>` : '';
    return `        <li>${label}${value}${text ? `<span class="txt">${text}</span>` : ''}</li>`;
  }
  const cls = todoClassOf(i);
  return `        <li${cls ? ` class="${cls}"` : ''}>${linkify(escapeHtml(i))}</li>`;
}

function renderSection(s) {
  const list = s.items || [];
  const wide = Boolean(s.raw) || Boolean(s.kpi);
  let inner;
  if (s.raw) inner = `      <div class="chart">${s.raw}</div>`;
  else if (s.kpi) {
    const cells = s.kpi.map((k) => `        <div class="cell">\n`
      + `          <div class="v num">${escapeHtml(k.value)}</div>\n`
      + `          <div class="l">${escapeHtml(k.label)}</div>\n`
      + (k.hint ? `          <div class="h">${escapeHtml(k.hint)}</div>\n` : '')
      + `        </div>`).join('\n');
    inner = `      <div class="kpi">\n${cells}\n      </div>`;
  } else {
    inner = `      <ul>\n${list.map(renderItem).join('\n') || "        <li class=\"empty\">(none yet)</li>"}\n      </ul>`;
  }
  const count = s.raw ? (s.badge || "chart") : (s.kpi ? (s.badge || `${s.kpi.length} items`) : (list.length || '—'));
  return `    <section${wide ? ' class="wide"' : ''} data-accent="${escapeHtml(s.accent || 'aipa')}">\n`
    + `      <h3>${escapeHtml(s.title)}<span class="count">${escapeHtml(count)}</span></h3>\n${inner}\n    </section>`;
}

function manifestField(text, name) {
  return ((String(text).match(new RegExp('^[ \\t]+' + name + ':[ \\t]*(\\S+)', 'm')) || [])[1]) || '';
}

function footerTextOf(root) {
  let manifestText = '';
  try {
    if (root) manifestText = readFileSync(join(String(root), 'AIPA-MANIFEST.yaml'), 'utf8');
  } catch { manifestText = ''; }
  const grey = branchOfChannel(manifestField(manifestText, 'channel')) === 'beta'
    && (manifestField(manifestText, 'telemetry') || 'off') === 'on';

  return grey
    ? `Read-only dashboard rendered by AIPA from local files. Beta is enabled with consent to redacted diagnostics (reporting: ${UPLOAD_SCOPE}; excludes memory and original content).`
    : "Read-only dashboard rendered by AIPA from local files. No network access or upload.";
}

export function renderDashboard({ generatedAt, sections = [], groups = [], title = "AIPA Memory Dashboard", fontFamily = '', root = '' }) {
  const groupOf = new Map((groups || []).map((g) => [g.id, g]));
  const chips = [];
  const blocks = [];
  let current = null;
  for (const s of sections) {
    const gid = s.group || '';
    if (gid && gid !== current) {
      const g = groupOf.get(gid) || { id: gid, title: gid };
      blocks.push(`  <div class="group" data-accent="${escapeHtml(g.accent || 'aipa')}">`
        + `<span class="dot"></span><h2>${escapeHtml(g.title)}</h2>`
        + (g.hint ? `<span class="hint">${escapeHtml(g.hint)}</span>` : '')
        + `<span class="rule"></span></div>`);
      current = gid;
    }
    blocks.push(renderSection(s));
    if (s.group) { const g = groupOf.get(s.group); if (g) chips.push(g.title); }
  }
  const body = blocks.join('\n');
  const chipHtml = [...new Set(chips)].map((c) => `<span class="chip">${escapeHtml(c)}</span>`).join('');
  const iso = String(generatedAt).replace(' ', 'T');
  const fontDecl = fontFamily ? `"${String(fontFamily).replace(/"/g, '')}", ` : '';

  const footerText = footerTextOf(root);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  :root {
    color-scheme: light dark;
    --font: ${fontDecl}-apple-system, "Segoe UI", "PingFang SC", "HarmonyOS Sans SC", "Microsoft YaHei UI", "Microsoft YaHei", system-ui, sans-serif;
    --mono: ui-monospace, "Cascadia Code", "JetBrains Mono", Menlo, Consolas, monospace;
    --bg: #eef1f7; --card: #ffffff; --card2: #fbfcfe; --tile: #f4f7fc;
    --fg: #16202c; --muted: #5b6675; --faint: #8a94a3;
    --line: rgba(16,32,54,.10); --line-strong: rgba(16,32,54,.18);
    --accent: #2563eb; --accent-soft: rgba(37,99,235,.10);
    --host: #0e7490; --host-soft: rgba(14,116,144,.10);
    --warn: #b45309; --warn-soft: rgba(180,83,9,.12);
    --ok: #047857; --ok-soft: rgba(4,120,87,.10);
    --danger: #c53030; --danger-soft: rgba(197,48,48,.10);
    --shadow: 0 1px 2px rgba(16,32,54,.05), 0 18px 40px -28px rgba(16,32,54,.45);
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg:#080b11; --card:#111722; --card2:#0d131c; --tile:#151d2b;
      --fg:#e8edf5; --muted:#96a3b8; --faint:#6f7d92;
      --line: rgba(255,255,255,.09); --line-strong: rgba(255,255,255,.16);
      --accent:#6ea8ff; --accent-soft: rgba(110,168,255,.14);
      --host:#22d3ee; --host-soft: rgba(34,211,238,.13);
      --warn:#f0b775; --warn-soft: rgba(240,183,117,.13);
      --ok:#34d399; --ok-soft: rgba(52,211,153,.12);
      --danger:#fb7185; --danger-soft: rgba(251,113,133,.14);
      --shadow: 0 1px 2px rgba(0,0,0,.4), 0 18px 44px -30px rgba(0,0,0,.9);
    }
  }
  /* Shared dashboard presentation. */
  :root {
    --r: 14px;                /* Shared dashboard presentation. */
    --t: .16s;                /* Shared dashboard presentation. */
    --shadow-rest: 0 1px 2px rgba(16,32,54,.05), 0 10px 22px -20px rgba(16,32,54,.35);
    --shadow-lift: 0 2px 4px rgba(16,32,54,.06), 0 16px 30px -22px rgba(16,32,54,.45);
    --shadow-tile: 0 1px 2px rgba(16,32,54,.04), 0 6px 14px -12px rgba(16,32,54,.30);
    --shadow-tile-lift: 0 1px 2px rgba(16,32,54,.05), 0 10px 20px -16px rgba(16,32,54,.35);
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --shadow-rest: 0 1px 2px rgba(0,0,0,.35), 0 12px 26px -22px rgba(0,0,0,.85);
      --shadow-lift: 0 2px 4px rgba(0,0,0,.4), 0 18px 34px -24px rgba(0,0,0,.95);
      --shadow-tile: 0 1px 2px rgba(0,0,0,.3), 0 8px 16px -14px rgba(0,0,0,.75);
      --shadow-tile-lift: 0 1px 2px rgba(0,0,0,.35), 0 12px 22px -18px rgba(0,0,0,.85);
    }
  }
  * { box-sizing: border-box; }
  html { scrollbar-width: thin; scrollbar-color: var(--line-strong) transparent; }
  body {
    font-family: var(--font); font-size: 14.5px; margin: 0; padding: 20px 18px 44px;
    background:
      radial-gradient(1000px 380px at 16% -10%, var(--accent-soft), transparent 62%),
      radial-gradient(820px 340px at 92% 2%, var(--host-soft), transparent 64%),
      var(--bg);
    color: var(--fg); line-height: 1.6; -webkit-font-smoothing: antialiased;
  }
  /* Shared dashboard presentation. */
  ::-webkit-scrollbar { width: 10px; height: 10px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--line-strong); border: 2px solid transparent; border-radius: 8px; background-clip: content-box; }
  ::-webkit-scrollbar-thumb:hover { background: var(--faint); background-clip: content-box; }

  .wrap { max-width: 1080px; margin: 0 auto; }
  header { margin-bottom: 2px; }
  h1 { font-size: 21px; margin: 0 0 4px; letter-spacing: .2px; font-weight: 680; line-height: 1.35; }
  .meta { color: var(--muted); font-size: 12.5px; font-family: var(--mono); line-height: 1.5; }
  .meta.warn { color: var(--warn); font-weight: 600; }
  .chips { margin: 8px 0 2px; display: flex; flex-wrap: wrap; gap: 6px; }
  .chip {
    font-size: 11.5px; padding: 3px 10px; border-radius: var(--r); line-height: 1.5;
    background: var(--accent-soft); color: var(--accent); white-space: nowrap;
    font-family: var(--mono); border: 1px solid transparent;
    transition: background-color var(--t) ease, border-color var(--t) ease, color var(--t) ease;
  }
  .chip:hover { border-color: var(--accent); }
  .group { display: flex; align-items: center; gap: 9px; margin: 18px 0 10px; }
  .group .dot { width: 7px; height: 7px; border-radius: var(--r); background: var(--accent); box-shadow: 0 0 0 4px var(--accent-soft); flex: 0 0 auto; }
  .group[data-accent="host"] .dot { background: var(--host); box-shadow: 0 0 0 4px var(--host-soft); }
  .group h2 { font-size: 12px; letter-spacing: .14em; text-transform: uppercase; color: var(--muted); margin: 0; font-weight: 650; }
  .group .hint { font-size: 11.5px; color: var(--faint); }
  .group .rule { flex: 1; height: 1px; background: linear-gradient(90deg, var(--line-strong), transparent 72%); opacity: .5; }
  .grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); }
  section {
    position: relative; overflow: hidden;
    background: linear-gradient(180deg, var(--card), var(--card2));
    border: 1px solid var(--line); border-radius: var(--r); padding: 13px 15px 11px;
    box-shadow: var(--shadow-rest);
    transition: transform var(--t) ease, border-color var(--t) ease, box-shadow var(--t) ease;
  }
  section::before {
    content: ""; position: absolute; inset: 0 0 auto 0; height: 2px;
    background: linear-gradient(90deg, transparent, var(--accent), transparent); opacity: .35;
    transition: opacity var(--t) ease;
  }
  section[data-accent="host"]::before { background: linear-gradient(90deg, transparent, var(--host), transparent); }
  section:hover { transform: translateY(-2px); border-color: var(--line-strong); box-shadow: var(--shadow-lift); }
  section:hover::before { opacity: .6; }
  h3 { font-size: 13.5px; margin: 0 0 9px; display: flex; align-items: baseline; justify-content: space-between; gap: 8px; font-weight: 640; letter-spacing: .2px; line-height: 1.45; }
  .count { font-size: 11px; color: var(--faint); font-weight: 400; font-family: var(--mono); flex: 0 0 auto; }
  ul { margin: 0; padding: 0; list-style: none; }
  /* Shared dashboard presentation. */
  li {
    font-size: 13.5px; padding: 6px 8px; border-top: 1px dashed var(--line);
    display: flex; flex-wrap: wrap; align-items: baseline; gap: 7px;
    overflow-wrap: anywhere; word-break: break-word; cursor: copy; border-radius: var(--r);
    transition: background-color var(--t) ease, box-shadow var(--t) ease, color var(--t) ease;
  }
  li:first-child { border-top: 0; }
  li:nth-child(even) { background: var(--tile); }
  /* Shared dashboard presentation. */
  li:not([class*="todo-"]):hover { background: var(--accent-soft); }
  li.empty { color: var(--faint); }
  /* Shared dashboard presentation. */
  li.copied, li.copied:hover { background: var(--ok-soft); box-shadow: inset 0 0 0 2px var(--ok); }
  li .k { flex: 0 0 auto; font-weight: 640; color: var(--muted); font-size: 12.5px; letter-spacing: .2px; }
  li .num { font-family: var(--mono); font-variant-numeric: tabular-nums; font-weight: 650; }
  li .txt { flex: 1 1 200px; min-width: 0; color: var(--fg); }

  /* Shared dashboard presentation. */
  li.todo-doing::before, li.todo-roadmap::before, li.todo-closed::before, li.todo-unclosed::before {
    content: ""; flex: 0 0 auto; width: 7px; height: 7px; border-radius: var(--r); margin: .52em 1px 0 0;
    transition: box-shadow var(--t) ease, transform var(--t) ease;
  }
  li.todo-doing::before { background: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
  li.todo-roadmap::before { background: var(--warn); box-shadow: 0 0 0 3px var(--warn-soft); }
  li.todo-closed::before { background: var(--ok); box-shadow: 0 0 0 3px var(--ok-soft); }
  li.todo-unclosed::before { background: var(--danger); box-shadow: 0 0 0 3px var(--danger-soft); }
  /* Shared dashboard presentation. */
  li.todo-doing:hover::before { box-shadow: 0 0 0 6px var(--accent-soft); }
  li.todo-roadmap:hover::before { box-shadow: 0 0 0 6px var(--warn-soft); }
  li.todo-closed:hover::before { box-shadow: 0 0 0 6px var(--ok-soft); }
  li.todo-unclosed:hover::before { box-shadow: 0 0 0 6px var(--danger-soft); }
  /* Shared dashboard presentation. */
  li.pulse::before { transform: scale(2.6); }
  li.pulse { color: var(--accent); }                      /* Shared dashboard presentation. */
  li.todo-doing.pulse::before { box-shadow: 0 0 0 10px var(--accent-soft); }
  li.todo-roadmap.pulse::before { box-shadow: 0 0 0 10px var(--warn-soft); }
  li.todo-closed.pulse::before { box-shadow: 0 0 0 10px var(--ok-soft); }
  li.todo-unclosed.pulse::before { box-shadow: 0 0 0 10px var(--danger-soft); }

  .kpi { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 9px; }
  .kpi .cell {
    background: var(--tile); border: 1px solid var(--line); border-radius: var(--r);
    padding: 9px 11px 8px; box-shadow: var(--shadow-tile);
    transition: transform var(--t) ease, border-color var(--t) ease, box-shadow var(--t) ease;
  }
  .kpi .cell:hover { transform: translateY(-1px); border-color: var(--line-strong); box-shadow: var(--shadow-tile-lift); }
  .kpi .v { font-family: var(--mono); font-variant-numeric: tabular-nums; font-size: 21px; line-height: 1.15; font-weight: 660; letter-spacing: -.4px; display: block; }
  .kpi .l { font-size: 11.5px; color: var(--muted); margin-top: 3px; line-height: 1.45; }
  .kpi .h { font-size: 10.5px; color: var(--faint); margin-top: 2px; font-family: var(--mono); line-height: 1.5; overflow-wrap: anywhere; }
  code { font-family: var(--mono); font-size: 12px; background: var(--accent-soft); padding: 1px 5px; border-radius: var(--r); overflow-wrap: anywhere; }
  section.wide { grid-column: 1 / -1; }
  /* Shared dashboard presentation. */
  .chart {
    position: relative; background: var(--tile); border: 1px solid var(--line);
    border-radius: var(--r); padding: 2px 8px 0; overflow: hidden;
  }
  .chart::before {
    content: ""; position: absolute; inset: 0; pointer-events: none;
    background-image: linear-gradient(to bottom, var(--line) 1px, transparent 1px);
    background-size: 100% 26px; opacity: .55;
  }
  .chart svg { display: block; width: 100%; height: auto; position: relative; }
  /* Shared dashboard presentation. */
  .chart svg .t { font: 600 13px var(--font); fill: var(--fg); }
  .chart svg .h { font: 11px var(--font); fill: var(--muted); }
  .chart svg .e { font: 12px var(--font); fill: var(--muted); }
  .chart svg .s { font: 10px var(--mono); fill: var(--muted); }
  .chart svg .v { font: 600 11px var(--mono); fill: var(--accent); }
  .chart svg polyline { fill: none; stroke: var(--accent); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
  .chart svg .d circle { fill: var(--accent); }
  .chart svg .ax { stroke: var(--line-strong); stroke-width: 1; }
  .chart svg .base { fill: var(--accent); opacity: .32; }
  .chart svg .real { fill: var(--accent); }
  .chart svg .track { fill: var(--line); }
  footer { margin-top: 20px; color: var(--faint); font-size: 11.5px; text-align: center; font-family: var(--mono); line-height: 1.7; overflow-wrap: anywhere; }
  @media (max-width: 680px) {
    body { padding: 14px 12px 34px; font-size: 14px; }
    h1 { font-size: 18.5px; }
    .grid { grid-template-columns: 1fr; gap: 10px; }
    .kpi { grid-template-columns: repeat(auto-fit, minmax(124px, 1fr)); }
    .kpi .v { font-size: 19px; }
    section { padding: 12px 12px 10px; }
    li { font-size: 13px; }
    .group .hint { display: none; }
  }
</style>
</head>
<body>
  <div class="wrap">
  <header>
    <h1>${escapeHtml(title)}</h1>
    <div class="meta" id="meta" data-at="${escapeHtml(generatedAt)}">Dashboard generated at ${escapeHtml(generatedAt)}</div>
    <div class="chips">${chipHtml}</div>
  </header>
  <div class="grid">
${body}
  </div>
  <footer>${footerText}Refresh:<code>node core-space/scripts/aipa-dashboard.mjs --root &lt;instance&gt;</code></footer>
  </div>
  <script>
  (function () {
    var el = document.getElementById("meta");
    // Refresh the static snapshot notice and provide local copy feedback.
    // Refresh the static snapshot notice and provide local copy feedback.
    if (el) {
      var raw = el.getAttribute("data-at") || "";
      var at = Date.parse(raw.replace(" ", "T"));
      if (isFinite(at)) {
        var mins = Math.floor((Date.now() - at) / 60000);
        var rel = mins < 1 ? "just now"
          : mins < 60 ? mins + " minutes ago"
          : mins < 1440 ? Math.floor(mins / 60) + " hours ago"
          : Math.floor(mins / 1440) + " days ago";
        el.textContent = "Snapshot time " + raw + " (" + rel + ") - figures reflect that snapshot; this page does not refresh automatically";
        if (mins > 360) el.className = "meta warn";        // Stale snapshots use the warning color.
        if (mins > 1440) el.textContent += "; run node core-space/scripts/aipa-dashboard.mjs --root <instance> to refresh";
      }
    }

    // Refresh the static snapshot notice and provide local copy feedback.
    function copyText(text) {
      if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
      return new Promise(function (resolve, reject) {
        try {
          var ta = document.createElement("textarea");
          ta.value = text;
          ta.setAttribute("readonly", "");
          ta.style.position = "fixed";
          ta.style.top = "-1000px";
          document.body.appendChild(ta);
          ta.select();
          var ok = document.execCommand("copy");
          document.body.removeChild(ta);
          ok ? resolve() : reject(new Error("execCommand copy failed"));
        } catch (e) { reject(e); }
      });
    }
    // Refresh the static snapshot notice and provide local copy feedback.
    // Refresh the static snapshot notice and provide local copy feedback.
    function clearFeedback() {
      var prev = document.querySelectorAll("li.copied, li.pulse");
      for (var i = 0; i < prev.length; i++) {
        prev[i].classList.remove("copied");
        prev[i].classList.remove("pulse");
        if (prev[i].__feedbackTimer) { clearTimeout(prev[i].__feedbackTimer); prev[i].__feedbackTimer = null; }
      }
    }
    function flash(li, cls, ms) {
      clearFeedback();
      li.classList.add(cls);
      li.__feedbackTimer = setTimeout(function () { li.classList.remove(cls); li.__feedbackTimer = null; }, ms);
    }
    var TODO_ITEM = /(^|\s)todo-(doing|roadmap|closed|unclosed)(\s|$)/;

    // Refresh the static snapshot notice and provide local copy feedback.
    // Refresh the static snapshot notice and provide local copy feedback.
    // Refresh the static snapshot notice and provide local copy feedback.
    // Refresh the static snapshot notice and provide local copy feedback.
    function say(text) {
      try {
        var s = window.speechSynthesis;
        if (!s || typeof s.speak !== "function" || typeof window.SpeechSynthesisUtterance !== "function") return false;
        s.cancel();
        var u = new SpeechSynthesisUtterance(text);
        u.lang = "en-US"; u.rate = 1.4; u.pitch = 1; u.volume = .9;
        var vs = typeof s.getVoices === "function" ? s.getVoices() : [];
        for (var i = 0; i < vs.length; i++) { if (/^en/i.test(vs[i].lang || "")) { u.voice = vs[i]; break; } }
        s.speak(u);
        return true;
      } catch (e) { return false; }
    }
    document.addEventListener("click", function (ev) {
      var li = ev.target && ev.target.closest ? ev.target.closest("li") : null;
      if (!li || !document.body.contains(li)) return;
      var text = (li.innerText || li.textContent || "").trim();
      if (!text) return;
      copyText(text).then(function () {
    // Refresh the static snapshot notice and provide local copy feedback.
        if (TODO_ITEM.test(li.className)) flash(li, "pulse", 1000);
        else flash(li, "copied", 1000);
        say("Copied");
      }).catch(function () { /* Clipboard failures are nonfatal. */ });
    });
  })();
  </script>
</body>
</html>
`;
}

export function linkify(escapedText) {
  return String(escapedText ?? '').replace(/([A-Za-z0-9_./-]+\.(?:md|mjs|json|yaml|yml|html|txt|mmd))/g, '<code>$1</code>');
}

export function parseRoadmapOpen(text, limit = 8) {
  const out = [];
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const s = line.trim();
    if (!s.startsWith('|')) continue;
    const cells = s.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
    if (cells.length < 3) continue;
    const [id, name] = cells;
    const status = cells[cells.length - 1];

    if (!/^[A-Za-z]{1,3}\d+$/.test(id)) continue;
    if (status.includes('✅') || status.includes('⏸')) continue;
    if (!status) continue;
    out.push(`${id} ${name} — ${status}`);
  }
  return out.slice(0, limit);
}
