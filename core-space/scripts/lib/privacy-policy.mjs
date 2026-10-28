// privacy policy
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const HARD_PATTERN = /password|secret|token|api[_-]?key/i;

function scalar(raw) {
  const value = raw.trim();
  if (value.startsWith('"')) return JSON.parse(value);
  if (value.startsWith("'")) {
    if (!value.endsWith("'")) throw new Error("Unterminated privacy-rule quote");
    return value.slice(1, -1).replace(/''/g, "'");
  }
  return value.replace(/\s+#.*$/, '').trim();
}

export function loadPrivacyPolicy(root) {
  let text;
  try { text = readFileSync(join(root, 'user-space', 'privacy.yaml'), 'utf8'); }
  catch (e) { if (e.code === 'ENOENT') return { patterns: [], tags: [], mode: 'ask' }; throw e; }
  const policy = { patterns: [], tags: [], mode: 'ask' };
  let upload = false, list = '';
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || /^\s*#/.test(line)) continue;
    if (/^upload_policy:\s*(?:#.*)?$/.test(line)) { upload = true; continue; }
    if (/^\S/.test(line)) { upload = false; list = ''; continue; }
    if (!upload) continue;
    const key = line.match(/^\s+(mode|block_patterns|block_tags):\s*(.*)$/);
    if (key) {
      list = key[1];
      if (list === 'mode') { policy.mode = scalar(key[2]); list = ''; }
      else if (key[2].trim()) {
        const raw = key[2].trim();
        if (!raw.startsWith('[') || !raw.endsWith(']')) throw new Error("Invalid privacy-rule list format");
        const values = raw.slice(1, -1).split(',').filter(v => v.trim()).map(scalar);
        policy[list === 'block_tags' ? 'tags' : 'patterns'].push(...values);
        list = '';
      }
      continue;
    }
    const item = line.match(/^\s+-\s+(.+)$/);
    if (item && ['block_patterns', 'block_tags'].includes(list)) {
      policy[list === 'block_tags' ? 'tags' : 'patterns'].push(scalar(item[1]));
    } else if (/^\s+\w+:/.test(line)) list = '';
    else throw new Error("Invalid privacy-rule format");
  }
  if (!['ask', 'allow', 'block'].includes(policy.mode)) throw new Error("Invalid privacy-rule mode");
  policy.patterns = policy.patterns.map(p => { if (typeof p !== 'string') throw new Error("Privacy rules must be text"); return new RegExp(p, 'i'); });
  return policy;
}

export function privacyDecision(policy, value, tags = []) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  function blocksText(text) {
    const declaredTags = [...String(text).matchAll(/^[ \t]*tags:[ \t]*\[([^\]]*)\]/gm)].flatMap(m => m[1].split(',').map(t => t.trim().replace(/^["']|["']$/g, '')));
    return HARD_PATTERN.test(text) || policy.patterns.some(p => p.test(text)) || declaredTags.some(t => policy.tags.includes(t)) || /^[ \t]*sensitive:[ \t]*true\b/im.test(text);
  }
  function markedPrivate(v) {
    if (typeof v === 'string') return blocksText(v);
    if (!v || typeof v !== 'object') return false;
    if (v.sensitive === true || (Array.isArray(v.tags) && v.tags.some(t => policy.tags.includes(t)))) return true;
    return Object.values(v).some(markedPrivate);
  }
  if (policy.mode === 'block' || tags.some(t => policy.tags.includes(t)) || blocksText(text) || markedPrivate(value)) return 'block';
  return policy.mode === 'allow' ? 'allow' : 'ask';
}
