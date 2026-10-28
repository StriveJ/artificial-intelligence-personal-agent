// distill sandbox
export const ALLOWED_PREFIXES = ['user-space/memory/', 'user-space/skills/', 'user-space/projects/'];
export const ALLOWED_EXACT = ['state/distill.json'];

function normalize(relPath) {
  return String(relPath ?? '').replace(/\\/g, '/').replace(/^\.\//, '');
}

export function isAllowedWrite(relPath) {
  const p = normalize(relPath);
  if (!p) return false;
  if (p.includes('..')) return false;
  if (ALLOWED_EXACT.includes(p)) return true;
  return ALLOWED_PREFIXES.some((pre) => p.startsWith(pre) && p.length > pre.length);
}

export function assertInSandbox(relPath) {
  if (!isAllowedWrite(relPath)) {
    throw new Error(
      `Distillation sandbox escape: ${normalize(relPath)} (only ${ALLOWED_PREFIXES.join(' / ')} and ${ALLOWED_EXACT.join(' / ')})`,
    );
  }
  return true;
}

export function auditRow(entry) {
  return {
    ts: entry?.ts_local || '',
    id: entry?.id || '',
    type: entry?.type || '',
    target: normalize(entry?.target),

    bytes: Number(entry?.bytes) || 0,
  };
}

export function auditLine(entry) {
  return JSON.stringify(auditRow(entry));
}
