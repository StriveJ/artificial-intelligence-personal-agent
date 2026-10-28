// git staging
import { execFileSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

export function isOwnRepository(root) {
  try {
    const top = execFileSync('git', ['-C', root, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    return relative(realpathSync(resolve(root)), realpathSync(top)) === '';
  } catch { return false; }
}
export function assertEmptyStaging(root, { requireRepository = false } = {}) {
  if (!isOwnRepository(root)) {
    if (requireRepository || existsSync(join(root, '.git'))) throw new Error("Requires an accessible instance Git root; parent repository is not allowed");
    return;
  }
  const staged = execFileSync('git', ['-C', root, 'diff', '--cached', '--name-only', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
  if (staged.length) throw new Error("Existing staged content detected. Commit or unstage it yourself before running this command; AIPA will not include it in an automatic commit.");
}
