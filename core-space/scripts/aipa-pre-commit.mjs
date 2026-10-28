#!/usr/bin/env node
// pre commit
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gitOut, instanceCheckout } from './lib/trunk.mjs';

const PROTECTED = [/^user-space\//, /^state\//];

export function decide({ role, branch, trunk, trunkSource, code, staged }) {
  const books = (staged || []).filter((p) => PROTECTED.some((re) => re.test(p)));

  if (code === 'nogit') return { block: false, reason: '' };

  if (books.length === 0) return { block: false, reason: '' };
  if (code === 'trunk-unknown') {

    const why = role === 'unknown'
      ? "Cannot determine checkout role (outside a repository or repository unreadable); branch check not performed."
      : "Trunk is unknown; branch check not performed.";
    return {
      block: false,
      reason: `${why}Run node core-space/scripts/aipa-git-guard.mjs --install --root <instance> to configure it.`,
    };
  }
  if (role === 'linked') {
    return {
      block: true,
      reason:
        `Commit refused: this is a linked instance worktree, but accounting belongs in the primary worktree.
` +
        `  Staged accounting files: ${books.slice(0, 5).join(', ')}${books.length > 5 ? ` and others; total ${books.length}` : ''}\n` +
        `  Accounting must be written only to the instance root (primary worktree).`,
    };
  }
  if (branch !== trunk) {
    const guess = trunkSource && trunkSource !== 'config-aipa-trunk'
      ? `
  Note: trunk was inferred from ${trunkSource} rather than explicitly configured. If incorrect, run:` +
        `
      node core-space/scripts/aipa-git-guard.mjs --install --root <instance> --trunk <actual-trunk>`
      : '';
    return {
      block: true,
      reason:
        `Commit refused: current branch is ${branch}, while accounting belongs on trunk ${trunk}.\n` +
        `  Staged accounting files: ${books.slice(0, 5).join(', ')}${books.length > 5 ? ` and others; total ${books.length}` : ''}\n` +
        `  Options: (1) git checkout ${trunk} before committing; (2) git worktree add for topic work (accounting writes back to trunk).
` +
        `  To deliberately commit here: git commit --no-verify` +
        guess,
    };
  }
  return { block: false, reason: '' };
}

const isMain = process.argv.includes('--from-hook')
  || (Boolean(process.argv[1]) && resolve(process.argv[1]) === fileURLToPath(import.meta.url));
if (isMain) {
  const root = gitOut(process.cwd(), ['rev-parse', '--show-toplevel']);
  if (!root) {

    console.error("[aipa] Cannot determine repository root (outside repository, Git unavailable or repository unreadable); branch check not performed");
    process.exit(0);
  }

  //   "user-space/projects/aipa/business/plan-\350\220\275\345\234\260\347\254\254\344\270\200\346\255\245.md"

  const staged = gitOut(root, ['diff', '--cached', '--name-only', '-z'])
    .split('\0').filter(Boolean);

  const check = instanceCheckout(root);
  const { block, reason } = decide({ ...check, staged });

  if (block) { console.error(reason); process.exit(1); }
  if (reason) console.error('[aipa] ' + reason);
  process.exit(0);
}
