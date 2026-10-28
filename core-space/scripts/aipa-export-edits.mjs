// Export only reviewed framework changes as Origin-path patch series. Resolve divergence and misplaced scripts before any write. Personal paths never enter public materials; disclose counts only. Reject missing commits, quoted patch paths and empty human evidence. Rewrite patch headers only after the commit separator, never hunk bodies. Use the authoritative sync mapping for reverse path mapping. Snapshot and staging guards protect unrelated user changes.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';

import { SYNC_FILE_MAP, SYNC_DIR_MAP, DERIVED, DERIVED_DSTS, joinRel } from './lib/origin-sync-map.mjs';

import { misfiledFrameworkKind } from './lib/origin-drift.mjs';

import { versionOf } from './lib/semver.mjs';
import { assertEmptyStaging } from './lib/git-staging.mjs';
import { publicContentViolations } from './lib/public-content.mjs';

function arg(n){ const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : ''; }
const root = resolve(arg('root') || '.');
const outDir = arg('out');
const slug = arg('slug') || 'contribution';
const prepareOnly = process.argv.includes('--prepare');
const info = (...args) => (prepareOnly ? console.error : console.log)(...args);
if (!outDir && !prepareOnly) { console.error("Missing --out <directory>"); process.exit(1); }
try { assertEmptyStaging(root, { requireRepository: true }); }
catch (error) { console.error("Export refused: " + error.message); process.exit(1); }

const git = (args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' });
const gitTry = (args) => { try { return git(args); } catch { return ''; } };

const status = execFileSync('node', [join(root, 'core-space', 'scripts', 'aipa-contribute-status.mjs'), '--root', root, '--json'], { encoding: 'utf8' });
const r = JSON.parse(status);

const diverged = r.framework.filter((e) => e.state === 'diverged');
if (diverged.length) {
  console.error("Export refused: both sides changed these paths differently; resolve them manually first:");
  for (const e of diverged) console.error('  ' + e.path);
  process.exit(1);
}

const stray = (r.outOfZone || []).filter((e) => misfiledFrameworkKind(e.path) === 'scripts');
if (stray.length) {
  console.error("Export refused: suspected framework scripts in the personal area. Out-of-zone paths:");
  for (const e of stray) console.error('  ' + e.path);

  console.error("If this is framework code, git mv it to the corresponding core-space/ path. Framework files belong there and will be classified for export.");
  console.error("If this is a personal script, move it elsewhere under user-space/. user-space/scripts/ is no longer supplied by the framework and is treated as potentially misplaced.");
  console.error("(Other user-space/** changes are personal data. Differences from upstream are expected; they are neither exported nor export blockers.)");
  console.error("(user-space/skills/**/SKILL.md is excluded from this gate: framework-generated personal skills trigger warnings only, without blocking export.)");
  process.exit(1);
}

const normPath = (p) => String(p ?? '').replace(/\\/g, '/');

const SRC_OF_DST = new Map();
for (const { src, dst } of SYNC_FILE_MAP.concat(DERIVED)) SRC_OF_DST.set(normPath(dst), normPath(src));

function originPathOf(rel) {
  const p = normPath(rel);
  const file = SRC_OF_DST.get(p);
  if (file) return 'product/' + file;
  for (const { src, dst } of SYNC_DIR_MAP) {
    if (p.startsWith(dst + '/')) return 'product/' + joinRel(src, p.slice(dst.length + 1));
  }
  return 'product/' + p;
}

function toOriginPatch(text) {
  const out = [];
  let seenMsgSep = false;
  let section = 'preamble';
  for (const line of text.split('\n')) {
    if (section === 'preamble' && /^---\r?$/.test(line)) seenMsgSep = true;
    if (seenMsgSep && /^diff --git /.test(line)) section = 'header';
    else if (seenMsgSep && /^@@/.test(line)) section = 'body';
    if (section !== 'header') { out.push(line); continue; }
    let m;
    if ((m = /^diff --git a\/([^\t ]+) b\/([^\t ]+)$/.exec(line))) out.push(`diff --git a/${originPathOf(m[1])} b/${originPathOf(m[2])}`);
    else if ((m = /^--- a\/([^\t ]+)$/.exec(line))) out.push(`--- a/${originPathOf(m[1])}`);
    else if ((m = /^\+\+\+ b\/([^\t ]+)$/.exec(line))) out.push(`+++ b/${originPathOf(m[1])}`);
    else if ((m = /^(rename|copy) (from|to) ([^\t ]+)$/.exec(line))) out.push(`${m[1]} ${m[2]} ${originPathOf(m[3])}`);

    else if (/^(diff --git|---|\+\+\+|rename|copy) /.test(line) && line.includes('"')) {
      console.error("Export refused: quoted patch-header paths cannot be safely rewritten yet: " + line);
      process.exit(1);
    } else out.push(line);
  }
  return out.join('\n');
}

const pendingAll = r.framework.filter((e) => e.state === 'pending').map((e) => e.path);
if (!pendingAll.length) {
  console.error("Export refused: no pending framework changes in the five-state inventory.");
  process.exit(1);
}

let ignored = [];
try {
  ignored = execFileSync('git', ['-C', root, '-c', 'core.quotepath=false', 'check-ignore', '--stdin'],
    { encoding: 'utf8', input: pendingAll.join('\n') + '\n' }).split(/\r?\n/).filter(Boolean);
} catch {  }
const pending = pendingAll.filter((p) => !ignored.includes(p));
if (ignored.length) {
  console.log("Note: these pending paths are ignored by .gitignore and cannot enter a commit or patch. Keep private files local; remove the ignore rule first only for genuine framework changes:");
  for (const p of ignored) console.log('  ' + p);
}

if (!pending.length) {
  console.error("Export refused: no exportable pending paths (none pending, or all ignored).");
  process.exit(1);
}
const managed = (p) => SYNC_FILE_MAP.some((m) => m.dst === p)
  || SYNC_DIR_MAP.some((m) => p.startsWith(m.dst + '/'))
  || DERIVED_DSTS.includes(p);
const newUpstream = pending.filter((p) => !managed(p));
if (newUpstream.length) {
  console.log("Note: these pending paths have no sync mapping or upstream counterpart. Export adds new upstream files; explain their purpose in CONTRIBUTION.md:");
  for (const p of newUpstream) console.log('  ' + p);
}

const entries = gitTry(['-c', 'core.quotepath=false', 'status', '--porcelain', '-z', '-uall']).split('\0').filter(Boolean);
const changed = [];
for (let i = 0; i < entries.length; i++) {
  const e = entries[i], xy = e.slice(0, 2), p = e.slice(3);
  if (!p) continue;
  changed.push(p);
  if (xy[0] === 'R' || xy[1] === 'R') { i++; if (entries[i]) changed.push(entries[i]); }
}
const pendingSet = new Set(pending);
const dirty = new Set([...new Set(changed)].filter((p) => pendingSet.has(p)));

const syncAnchor = gitTry(['log', '--format=%H', '-1', '--grep=^chore(sync):']).trim();
const rootCommit = gitTry(['log', '--format=%H', '--max-parents=0', '-1']).trim();
const anchor = syncAnchor || rootCommit;
const hasCommitIn = (p, base) => !!gitTry(['log', '--format=%H', '-n', '1', base + '..HEAD', '--', p]).trim();

const covered = [], widened = [];
for (const p of pending) (dirty.has(p) || (anchor && hasCommitIn(p, anchor)) ? covered : widened).push(p);
const stuck = widened.filter((p) => !rootCommit || !hasCommitIn(p, rootCommit));
if (stuck.length) {
  console.error("Export refused: these pending paths have no touching commit in instance history and would be omitted from the patch series:");
  for (const p of stuck) console.error('  ' + p);
  process.exit(1);
}
if (widened.length) {
  info("Note: these paths have no commit after the sync anchor. Their patches will use full instance history; other paths use only commits after the anchor:");
  for (const p of widened) info('  ' + p);
}

function sectionOf(text, name) {
  const legacy = {'Feature Overview':'\u529f\u80fd\u4ecb\u7ecd','Testing and Validation':'\u6d4b\u8bd5\u4e0e\u9a8c\u8bc1'};
  const hit = new RegExp('^##(?!#)[ \\t]*(?:' + name + (legacy[name] ? '|' + legacy[name] : '') + ')[ \\t]*\\r?$', 'm').exec(text);
  if (!hit) return '';
  const rest = text.slice(hit.index + hit[0].length);
  const next = rest.search(/^##(?!#)/m);
  return (next < 0 ? rest : rest.slice(0, next)).trim();
}

function notExportedBlock(outOfZone) {
  const personal = outOfZone.filter((e) => normPath(e.path).startsWith('user-space/'));
  const others = outOfZone.filter((e) => !normPath(e.path).startsWith('user-space/'));
  return [
    "### Not Exported",
    '',
    "The table above lists **what is included**. This section declares **what is excluded**. Patches contain only pending framework paths (set P).",
    "Changes outside the framework are **never included**. The following disclosure makes omissions explicit:",
    "Maintainers can distinguish deliberate exclusions from possible oversights.",
    '',
    "- **Entries outside `user-space/`** (paths listed below): they are outside set P and never exported.",
    "  These are the most likely framework changes omitted by mistake (set P excludes instance-root files).",
    "  For each entry, ask whether all users need it. If yes, git mv it into the corresponding core-space/ path and export again.",
    "- **Entries in `user-space/**`** (count only): personal filenames and project names are themselves private.",
    "  Only the count is disclosed; paths are omitted. Excluding personal data is intentional and usually needs no action.",
    "  An item intended for everyone may instead be framework code placed in the wrong area.",
    "  Run aipa-contribute-status to review its personal-area executable warnings.",
    '',
    "Excluded entries outside `user-space/` (" + others.length + "):",
    ...(others.length ? others.map((e) => '- `' + e.path + '` (' + e.state + ')') : ["(none)"]),
    '',
    "Excluded `user-space/**` entries: " + personal.length + " (paths omitted; personal-area paths are private and are not published with this file)",
    '',
  ];
}

function contributionTemplate({ files, anchorTag, anchor, version, exportedAt, outOfZone }) {
  return [
    "# Contribution",
    '',
    "> Generated by `aipa-export-edits`. The Machine-filled section is computed by the tool.",
    "> **Feature Overview and Testing and Validation must be filled in by a human.** Export rejects either empty section.",
    '',
    "**Requirements**",
    '',
    "- **Feature Overview**: describe the change, motivation, affected scripts/protocols/skills/gates and any breaking changes.",
    "- **Testing and Validation**: include **commands actually run in the instance and observed output**, in at least one code block.",
    "  Claims such as \"tested\" or \"works\" are insufficient. Framework test suites are not distributed with instances.",
    "  Provide end-to-end evidence from actual instance scripts; maintainers run the full suite after applying the patch.",
    '',
    "## Machine-filled",
    '',
    "- Exported at: " + exportedAt,
    "- Instance framework version: " + (version || "(version unavailable in AIPA-MANIFEST.yaml)"),
    "- Sync anchor: " + (anchorTag || "(instance has never synced; no anchor tag)") + "(commit " + String(anchor).slice(0, 12) + ')',

    "- Boundary compliance: passed. No suspected misplaced framework scripts under user-space/scripts/**."
    + "  Classification uses misfiledFrameworkKind in core-space/scripts/lib/origin-drift.mjs; no framework path is diverged."
    + "  Other user-space/** data is excluded. Personal skills under user-space/skills/**/SKILL.md warn without blocking.",
    '',
    "Changed files (" + files.length + "). \"Origin destination\" identifies the actual target file in the Origin repository.",
    "Patch paths are rewritten accordingly. Apply in a fork with git am <patch>. Use git am --keep-cr <patch> only after verifying that both target and patch content use CRLF.",
    '',
    "| Instance path | Origin destination |",
    '|---|---|',
    ...files.map((f) => '| `' + f.from + '` | `' + f.to + '` |'),
    '',
    ...notExportedBlock(outOfZone),
    "## Feature Overview",
    '',
    "## Testing and Validation",
    '',
  ].join('\n');
}

const docPath = join(root, 'CONTRIBUTION.md');

const inspected = pending.filter(p => existsSync(join(root,p))).map(p => readFileSync(join(root,p),'utf8'));
if (covered.length) inspected.push(git(['format-patch','--stdout',anchor+'..HEAD','--',...covered]));
if (widened.length) inspected.push(git(['format-patch','--stdout',rootCommit+'..HEAD','--',...widened]));
if (dirty.size) inspected.push(git(['diff','HEAD','--',...dirty]));
if (existsSync(docPath)) inspected.push(readFileSync(docPath,'utf8'));
const problems = [...new Set(inspected.flatMap(publicContentViolations))];
if (problems.length) { console.error("Preparation or export refused: proposed public content matched " + problems.join(', ') + "; clean the content and patch history before retrying. No patches generated."); process.exit(1); }
const prepared = (status, next) => {
  console.log(JSON.stringify({ status, document: docPath, frameworkPaths: pending.map(p => ({instance:p,origin:originPathOf(p)})), next, remoteState:'unknown' },null,2));
  process.exit(0);
};
if (!existsSync(docPath)) {
  let version = '';
  try { version = versionOf(readFileSync(join(root, 'AIPA-MANIFEST.yaml'), 'utf8')); } catch {  }
  const anchorTag = gitTry(['tag', '--points-at', anchor]).split(/\r?\n/).map((t) => t.trim()).find((t) => /^v\d/.test(t)) || '';
  writeFileSync(docPath, contributionTemplate({
    files: pending.map((p) => ({ from: p, to: originPathOf(p) })),
    anchorTag,
    anchor,
    version,
    exportedAt: new Date().toISOString(),

    outOfZone: r.outOfZone || [],
  }), 'utf8');
  console.error("CONTRIBUTION.md skeleton generated in the instance root with machine fields filled.");
  console.error("Fill Feature Overview and Testing and Validation, then rerun. Empty sections still block export.");
  if (prepareOnly) prepared('needs_description', "Fill CONTRIBUTION.md with the feature overview, actual validation commands and output. Review public materials, then run aipa-export-edits --out <directory>.");
  process.exit(1);
}
const doc = readFileSync(docPath, 'utf8');
const intro = sectionOf(doc, "Feature Overview");
const tested = sectionOf(doc, "Testing and Validation");
if (prepareOnly && (!intro || !tested || !/```/.test(tested))) prepared('needs_description', "Complete the feature overview and actual command/output code block; no changes committed or patches generated.");
if (!intro) { console.error("Export refused: Feature Overview in CONTRIBUTION.md is empty"); process.exit(1); }
if (!tested) { console.error("Export refused: Testing and Validation in CONTRIBUTION.md is empty"); process.exit(1); }
if (!/```/.test(tested)) { console.error("Export refused: Testing and Validation must include commands and output in at least one code block; claims such as \"tested\" are insufficient"); process.exit(1); }
if (prepareOnly) prepared('ready_to_export', "Materials prepared. Review public content before exporting patches, applying to the Origin fork dev branch and opening a PR. Nothing exported, submitted, merged or published yet.");

mkdirSync(outDir, { recursive: true });

const toLedger = [...dirty].concat(changed.includes('CONTRIBUTION.md') ? ['CONTRIBUTION.md'] : []);
if (toLedger.length) {
  git(['add', '--', ...toLedger]);
  git(['-c', 'user.name=AIPA', '-c', 'user.email=aipa@local', 'commit', '-q', '-m',
    `edit(framework): ${slug}\n\nAIPA-Framework-Edit: ${slug}`]);
}

const patchOf = (base, paths, startNumber) => {
  const args = ['-c', 'core.quotepath=false', 'format-patch', '--output-directory', resolve(outDir)];
  if (startNumber) args.push('--start-number', String(startNumber));
  args.push(base + '..HEAD', '--', ...paths);
  const files = git(args).trim().split(/\r?\n/).filter(Boolean);
  for (const f of files) {
    const abs = resolve(f);
    writeFileSync(abs, toOriginPatch(readFileSync(abs, 'utf8')), 'utf8');
  }
  return files.join('\n');
};
const countOf = (s) => s.split(/\r?\n/).filter(Boolean).length;
let written = covered.length ? patchOf(anchor, covered) : '';
if (widened.length) {
  const extra = patchOf(rootCommit, widened, countOf(written) + 1);
  written = [written, extra].filter(Boolean).join('\n');
}

writeFileSync(join(outDir, 'CONTRIBUTION.md'), doc, 'utf8');
const stamp = new Date().toISOString().slice(0, 10);
try { git(['tag', '-f', 'exported-' + stamp]); } catch {  }
console.log("Export complete: " + pending.length + " paths, " + countOf(written) + " patches written to " + resolve(outDir));

console.log("Origin destinations (patch paths already rewritten):");
for (const p of pending) console.log('  ' + p + '  →  ' + originPathOf(p));
