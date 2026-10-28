// project
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadAliases } from './sceneblock.mjs';

function norm(p) {
  let s = resolve(p).replace(/\\/g, '/');
  if (process.platform === 'win32') s = s.toLowerCase();
  return s.replace(/\/+$/, '');
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function wildcardHit(pattern, branch) {
  if (!pattern.includes('*')) return false;
  const rx = new RegExp('^' + pattern.split('*').map(escapeRe).join('.*') + '$');
  return rx.test(branch);
}

export function matchLine(lines, branch) {
  if (!branch || !lines) return '';
  let best = '';
  let bestExact = false;
  let bestLen = -1;
  for (const [pattern, line] of Object.entries(lines)) {
    const exact = pattern === branch;
    if (!exact && !wildcardHit(pattern, branch)) continue;
    if (!best) { best = line; bestExact = exact; bestLen = pattern.length; continue; }
    if (exact !== bestExact) {
      if (exact) { best = line; bestExact = true; bestLen = pattern.length; }
      continue;
    }
    if (pattern.length > bestLen) { best = line; bestLen = pattern.length; }

  }
  return best;
}

function currentBranch(cwd) {
  try {
    const out = execFileSync('git', ['-C', cwd, 'rev-parse', '--abbrev-ref', 'HEAD'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return out === 'HEAD' ? '' : out;
  } catch { return ''; }
}

function readLines(root, projectId) {
  try {
    const p = join(root, 'user-space', 'projects', projectId, 'lines.yaml');
    if (!existsSync(p)) return {};
    return loadAliases(readFileSync(p, 'utf8'));
  } catch { return {}; }
}

export function resolveProject(cwd, root) {
  const cwdN = norm(cwd);
  const rootN = norm(root);

  let id = '';
  let source = '';
  const projectsDir = join(root, 'user-space', 'projects');
  try {
    if (existsSync(projectsDir)) {
      for (const pid of readdirSync(projectsDir)) {
        const lp = join(projectsDir, pid, 'local_path');
        if (!existsSync(lp)) continue;
        const p = (readFileSync(lp, 'utf8') || '').trim();
        if (!p) continue;
        const pN = norm(p);
        if (cwdN === pN || cwdN.startsWith(pN + '/')) { id = pid; source = 'repo'; break; }
      }
    }
  } catch {  }
  if (!id) {
    if (cwdN === rootN || cwdN.startsWith(rootN + '/')) { id = basename(root); source = 'instance'; }
    else { id = basename(cwd) || 'unknown'; source = 'basename'; }
  }

  const branch = currentBranch(cwd);
  const line = matchLine(readLines(root, id), branch);
  if (line) return { id: line, source: 'branch', branch };
  return { id, source, branch };
}

export function resolveProjectId(cwd, root) {
  return resolveProject(cwd, root).id;
}
