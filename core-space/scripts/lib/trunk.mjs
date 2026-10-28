// trunk
import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';

export function gitOut(cwd, args) {
  const r = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
  if (r.error || r.status !== 0) return '';
  return String(r.stdout || '').trim();
}

//   2. refs/remotes/origin/HEAD --short → origin/master
//   3. git config --get init.defaultBranch

export function detectTrunk(root, git = gitOut) {
  const explicit = git(root, ['config', '--local', 'aipa.trunk']);
  if (explicit) return { branch: explicit, source: 'config-aipa-trunk' };

  const originHead = git(root, ['symbolic-ref', 'refs/remotes/origin/HEAD', '--short']);
  if (originHead.startsWith('origin/')) {
    return { branch: originHead.slice('origin/'.length), source: 'origin-head' };
  }

  const initDefault = git(root, ['config', '--get', 'init.defaultBranch']);
  if (initDefault) return { branch: initDefault, source: 'init-default-branch' };

  return { branch: '', source: 'unknown' };
}

function normPath(p) {
  let s = String(p || '');
  try { s = realpathSync.native(s); } catch {  }
  s = s.replace(/\\/g, '/').replace(/\/+$/, '');
  if (process.platform === 'win32') s = s.toLowerCase();
  return s;
}

export function mainWorktreePath(root, git = gitOut) {
  const out = git(root, ['worktree', 'list', '--porcelain']);
  if (!out) return '';
  const line = out.split('\n').find((l) => l.startsWith('worktree '));
  return line ? line.slice('worktree '.length).trim() : '';
}

export function checkoutRole(root, git = gitOut) {
  if (!git(root, ['rev-parse', '--git-dir'])) {

    return git(root, ['--version']) ? 'unknown' : 'nogit';
  }
  const main = mainWorktreePath(root, git);

  if (!main) return 'unknown';
  return normPath(main) === normPath(root) ? 'main' : 'linked';
}

export function instanceCheckout(root, git = gitOut) {
  const role = checkoutRole(root, git);
  const branch = role === 'nogit' ? '' : git(root, ['rev-parse', '--abbrev-ref', 'HEAD']);

  if (role === 'nogit') return { ok: true, role, branch: '', trunk: '', trunkSource: 'unknown', code: 'nogit' };
  if (role === 'linked') return { ok: false, role, branch, trunk: '', trunkSource: 'unknown', code: 'linked-worktree' };

  if (role === 'unknown') return { ok: true, role, branch, trunk: '', trunkSource: 'unknown', code: 'trunk-unknown' };

  const { branch: trunk, source: trunkSource } = detectTrunk(root, git);
  if (!trunk) return { ok: true, role, branch, trunk: '', trunkSource, code: 'trunk-unknown' };  // fail-open
  if (branch !== trunk) return { ok: false, role, branch, trunk, trunkSource, code: 'not-trunk' };
  return { ok: true, role, branch, trunk, trunkSource, code: 'ok' };
}
