// Read-only five-state framework drift inventory. Use shared sync mappings and upstream baseline digests. Personal data is never a patch candidate; misplaced executable framework files receive visible warnings.
import { readFileSync, existsSync, readdirSync, statSync, lstatSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, relative, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { classify, parseChecksums, isFrameworkPath, misfiledFrameworkKind, personalExecutableKind } from './lib/origin-drift.mjs';
import { SYNC_FILE_MAP, SYNC_DIR_MAP, DERIVED, joinRel } from './lib/origin-sync-map.mjs';

import { branchOfChannel } from './lib/release-channel.mjs';

function arg(n){ const i = process.argv.indexOf('--'+n); return i>=0 ? process.argv[i+1] : ''; }
const root = resolve(arg('root') || '.');
const asJson = process.argv.includes('--json');

const baselinePath = join(root, 'state', 'origin-baseline.txt');
if (!existsSync(baselinePath)) {
  console.error("Missing instance baseline " + baselinePath + ": local changes cannot be identified. Run aipa-pull-origin once to generate a baseline.");
  process.exit(1);
}
const baseline = parseChecksums(readFileSync(baselinePath, 'utf8'));
const cacheDir = join(root, 'state', '.origin-cache');

if (!existsSync(join(cacheDir, '.git'))) {
  console.error("Missing upstream cache " + cacheDir + " (.git not found, possibly an interrupted clone): upstream changes cannot be determined. Run aipa-pull-origin to rebuild the cache.");
  process.exit(1);
}

{
  const readChannel = (p) => { try { return ((readFileSync(p, 'utf8').match(/^[ \t]+channel:[ \t]*(\S+)/m) || [])[1]) || ''; } catch { return ''; } };
  try { execFileSync('git', ['-C', cacheDir, 'fetch', '--all', '--quiet'], { stdio: 'pipe' }); } catch {  }

  const target = 'origin/' + branchOfChannel(readChannel(join(root, 'AIPA-MANIFEST.yaml')) || readChannel(join(cacheDir, 'ORIGIN-MANIFEST.yaml')));
  for (const ref of [...new Set([target, 'origin/HEAD', 'origin/master'])]) {
    try { execFileSync('git', ['-C', cacheDir, 'reset', '--hard', ref, '--quiet'], { stdio: 'pipe' }); break; } catch {}
  }
}

function walk(dir, base = dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === '.git') continue;
    if (dir === base && name === 'state') continue;
    const p = join(dir, name);
    const st = lstatSync(p);
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) walk(p, base, out);
    else out.push(relative(base, p).replace(/\\/g, '/'));
  }
  return out;
}
const localPaths = new Set(walk(root));

const upstreamPaths = new Set(baseline.keys());
for (const p of walk(cacheDir)) upstreamPaths.add(p);

const sha = (txt) => createHash('sha256').update(txt).digest('hex');

const readIf = (p) => { try { return p && statSync(p).isFile() ? readFileSync(p, 'utf8') : null; } catch { return null; } };

const normPath = (p) => String(p ?? '').replace(/\\/g, '/');
const CACHE_SRC = new Map();
for (const { src, dst } of SYNC_FILE_MAP.concat(DERIVED)) CACHE_SRC.set(dst, src);
function upstreamOf(rel) {
  const p = normPath(rel);
  const src = CACHE_SRC.get(p);
  if (src) return join(cacheDir, src);
  for (const { src: s, dst: d } of SYNC_DIR_MAP) {
    if (p.startsWith(d + '/')) return join(cacheDir, joinRel(s, p.slice(d.length + 1)));
  }
  return join(cacheDir, p);
}

const framework = [];
const outOfZone = [];

const IGNORE = [/^AIPA-MANIFEST\.yaml$/, /^user-space\/logs\//, /^user-space\/profile\.yaml$/];
const allPaths = new Set([...localPaths, ...upstreamPaths, ...baseline.keys()]);
for (const p of [...allPaths].sort()) {
  if (IGNORE.some((re) => re.test(p))) continue;
  const localText = readIf(join(root, p));
  const upstreamText = readIf(upstreamOf(p));

  const state = classify({
    base: baseline.get(p) ?? null,
    local: localText === null ? null : sha(localText),
    upstream: upstreamText === null ? null : sha(upstreamText),
  });
  if (isFrameworkPath(p)) framework.push({ path: p, state });

  else if (state === 'pending' || state === 'diverged') {

    const kind = misfiledFrameworkKind(p) ?? personalExecutableKind(p);
    outOfZone.push({
      path: p,
      state,
      warn: kind === 'scripts'

        ? "Potentially misplaced framework script: for framework code, git mv to the corresponding core-space/ path (scripts belong in core-space/scripts/). For personal scripts, move elsewhere under user-space/; this directory is no longer supplied by the framework."

        : (kind === 'skills'
          ? "Public skills belong in core-space/common/skills/. Personal skills use the aipa-contribute.mjs single-artifact path."

          : (kind === 'executable'
            ? "Personal-area executable: if intended for all users, git mv it into core-space/ (scripts in core-space/scripts/, public skills in core-space/common/skills/). Leaving it in user-space/ prevents distribution because pull never overwrites personal data. Personal-purpose tools need no action when outside user-space/scripts/ and are not exported."
            : '')),
    });
  }
}

const report = { root, framework, outOfZone };
if (asJson) console.log(JSON.stringify(report, null, 2));
else {
  console.log("Framework paths (the only contribution candidates):");
  for (const e of framework) console.log(`  [${e.state}] ${e.path}`);
  console.log("Outside the framework (never exported):");

  for (const e of outOfZone) console.log(`  [${e.state}] ${e.path}${e.warn ? '  ⚠ ' + e.warn : ''}`);
}
