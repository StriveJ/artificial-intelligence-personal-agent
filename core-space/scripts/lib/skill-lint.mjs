// skill lint
export const REQUIRED_FRONTMATTER = ['name', 'description', 'scope'];
export const VERSION_RE = /^\d+\.\d+\.\d+$/;

export function parseFrontmatter(text) {
  const m = String(text ?? '').match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const out = {};
  if (!m) return out;
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_]+):\s*(.*)$/);
    if (kv) out[kv[1]] = kv[2].trim();
  }
  return out;
}

export function lintSkill(text) {
  const fm = parseFrontmatter(text);
  const body = String(text ?? '');
  const errors = [];
  const warnings = [];

  for (const key of REQUIRED_FRONTMATTER) {
    if (!fm[key]) errors.push(`frontmatter missing ${key}`);
  }
  if (!fm.version) errors.push("frontmatter missing version");
  else if (!VERSION_RE.test(fm.version)) errors.push(`version is not semantic (expected e.g. 1.0.0; received ${fm.version})`);

  if (!/##\s*[^\n]*(?:Boundaries|Trigger Boundaries|Not Applicable|\u89e6\u53d1\u8fb9\u754c|\u8fb9\u754c|\u4e0d\u9002\u7528)[^\n]*\n/i.test(body)) {
    errors.push("Missing Boundaries section (state when the skill must not be used)");
  }
  if (!/##\s*[^\n]*(?:Verification|Acceptance Criteria|\u9a8c\u6536\u6807\u51c6|\u9a8c\u8bc1)[^\n]*\n/i.test(body)) {
    errors.push("Missing Verification section (how to establish correctness)");
  }
  if (!/##\s*[^\n]*(?:Dependencies|\u4f9d\u8d56)[^\n]*\n/i.test(body)) warnings.push("Missing Dependencies section (explicitly state when there are none)");

  return { name: fm.name || '', scope: fm.scope || '', version: fm.version || '', errors, warnings };
}
