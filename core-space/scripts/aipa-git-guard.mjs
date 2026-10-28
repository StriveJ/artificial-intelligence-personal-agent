#!/usr/bin/env node
// git guard
// usage:

import { existsSync, statSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pickCmd } from './lib/argv.mjs';
import { checkoutRole, detectTrunk, gitOut, instanceCheckout, mainWorktreePath } from './lib/trunk.mjs';

function arg(n) { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : ''; }

const cmd = pickCmd(process.argv.slice(2), ['--install', 'install', 'status']) || 'status';

const HOOKS_PATH = 'core-space/githooks';
const root = arg('root') || '.';
const trunkArg = arg('trunk');

if (cmd === '--install' || cmd === 'install') {
  const role = checkoutRole(root);
  if (role === 'nogit') {
    console.error("This directory is not a Git repository. Plain-directory instances do not need a branch guard.");
    process.exit(1);
  }

  if (role === 'unknown') {

    console.error("Installation refused: checkout role cannot be determined. Possible causes:");
    console.error("  1. Directory is outside a Git repository (plain-directory instances do not need this guard).");
    console.error("  2. Git cannot read the repository (for example, safe.directory ownership rejection).");
    console.error("  Check manually: git -C <directory> rev-parse --git-dir");
    process.exit(1);
  }
  if (role !== 'main') {
    console.error("Installation refused: this is a linked instance worktree. Install only from the instance root (primary worktree).");
    console.error("  The instance root is the first entry from git worktree list.");
    process.exit(1);
  }

  let trunk = trunkArg || detectTrunk(root).branch;
  if (!trunk) {

    console.error("Trunk is unknown; no configuration written. Confirm and rerun:");
    console.error('  node ' + fileURLToPath(import.meta.url) + ' --install --root ' + root + " --trunk <trunk-branch>");
    process.exit(1);
  }

  gitOut(root, ['config', '--local', 'aipa.trunk', trunk]);
  gitOut(root, ['config', '--local', 'core.hooksPath', HOOKS_PATH]);

  const wroteTrunk = gitOut(root, ['config', '--local', 'aipa.trunk']);
  const wroteHooks = gitOut(root, ['config', '--local', 'core.hooksPath']);
  if (wroteTrunk !== trunk || wroteHooks !== HOOKS_PATH) {

    console.error("Installation failed: configuration is unreadable or unwritten (.git/config may be read-only, locked or invalid).");
    console.error("  Expected aipa.trunk=" + trunk + ', core.hooksPath=' + HOOKS_PATH);
    console.error("  Actual aipa.trunk=" + JSON.stringify(wroteTrunk) + ', core.hooksPath=' + JSON.stringify(wroteHooks));
    process.exit(1);
  }

  const hook = join(root, 'core-space', 'githooks', 'pre-commit');
  let hookWarn = '';
  if (!existsSync(hook)) {
    hookWarn = "Hook file missing; guard layer 3 will not be effective";
  } else if (process.platform !== 'win32' && (statSync(hook).mode & 0o111) === 0) {
    try { chmodSync(hook, statSync(hook).mode | 0o111); }
    catch (error) { console.error("Installation failed: cannot restore hook executable permissions: " + error.message); process.exit(1); }
  }
  if (hookWarn) console.error("Warning: " + hookWarn);

  console.log(JSON.stringify({ status: 'ok', installed: true, root, trunk, hooksPath: HOOKS_PATH, hookWarn }));
} else {
  const check = instanceCheckout(root);
  const hooksPath = gitOut(root, ['config', '--local', 'core.hooksPath']);
  console.log(JSON.stringify({
    status: 'ok',
    root,
    role: check.role,
    branch: check.branch,
    trunk: check.trunk,
    code: check.code,
    ok: check.ok,

    trunkSource: check.trunkSource,

    mainWorktree: mainWorktreePath(root),
    hooksPath,
  }));
}
