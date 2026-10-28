// Classify framework drift against verified upstream mappings and baselines. Personal-area differences are expected and excluded from export; executable scripts may be misplaced. Personal skill files are normal generated output and receive warnings rather than an export veto.
export const STATES = ['unchanged', 'pending', 'upstream-only', 'adopted', 'diverged'];

const norm = (v) => (v === undefined ? null : v);

export function classify({ base, local, upstream }) {
  const b = norm(base), l = norm(local), u = norm(upstream);
  const bEqL = b === l, bEqU = b === u, lEqU = l === u;
  if (bEqL && bEqU) return 'unchanged';
  if (!bEqL && bEqU) return 'pending';
  if (bEqL && !bEqU) return 'upstream-only';
  if (!bEqL && !bEqU && lEqU) return 'adopted';
  return 'diverged';
}

export { parseChecksums } from './origin-checksums.mjs';

export const FRAMEWORK_PREFIXES = ['core-space/', 'AGENTS.md', '.claude/', '.ide_activation/', '.codebuddy/'];

export function isFrameworkPath(p) {
  const s = String(p ?? '').replace(/\\/g, '/');
  return FRAMEWORK_PREFIXES.some((pre) => (pre.endsWith('/') ? s.startsWith(pre) : s === pre));
}

export function misfiledFrameworkKind(p) {
  const s = String(p ?? '').replace(/\\/g, '/');
  if (s.startsWith('user-space/scripts/')) return 'scripts';
  if (s.startsWith('user-space/skills/') && /\/SKILL\.md$/.test(s)) return 'skills';
  return null;
}

export function isMisfiledFrameworkPath(p) {
  return misfiledFrameworkKind(p) !== null;
}

export const PERSONAL_PLUGIN_ZONE = 'user-space/tasks/';

const EXECUTABLE_EXTENSIONS = ['.mjs', '.js', '.cjs', '.sh', '.bash', '.zsh', '.py', '.ps1'];

export function personalExecutableKind(p) {
  const s = String(p ?? '').replace(/\\/g, '/');
  if (!s.startsWith('user-space/')) return null;
  if (s.startsWith(PERSONAL_PLUGIN_ZONE)) return null;
  const name = s.slice(s.lastIndexOf('/') + 1);
  return EXECUTABLE_EXTENSIONS.some((ext) => name.endsWith(ext)) ? 'executable' : null;
}
