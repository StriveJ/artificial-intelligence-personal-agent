// Read only the response-language scalar from overrides. This reader never writes user files.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertWithin } from './safe-path.mjs';
import { normalizeResponseLanguage } from './language.mjs';
import { loadPrivacyPolicy, privacyDecision } from './privacy-policy.mjs';

export function readResponseLanguage(root, { forModel = false } = {}) {
  const path = assertWithin(root, join(root, 'user-space', 'overrides.yaml'), { rejectLinks: true });
  let text;
  try { text = readFileSync(path, 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return 'auto'; throw error; }
  let inDisplay = false, seenDisplay = false, found;
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim() || raw.trimStart().startsWith('#')) continue;
    if (/^display:[ \t]*(?:#.*)?$/.test(raw)) {
      if (seenDisplay) throw new Error('Duplicate display configuration');
      seenDisplay = inDisplay = true;
      continue;
    }
    if (/^display:/.test(raw)) throw new Error('display must be a block mapping');
    if (/^\S/.test(raw)) inDisplay = false;
    if (!inDisplay) continue;
    const match = raw.match(/^  language:[ \t]*(.*)$/);
    if (!match) {
      if (/^\s+language:/.test(raw)) throw new Error('display.language requires two-space indentation');
      continue;
    }
    if (found !== undefined) throw new Error('Duplicate display.language configuration');
    const scalar = match[1].replace(/[ \t]+#.*$/, '').trim();
    if (!scalar) throw new Error('display.language must be auto or a valid BCP 47 language tag');
    if (scalar.startsWith('"')) {
      try { found = JSON.parse(scalar); }
      catch { throw new Error('Invalid quoted display.language'); }
    } else if (scalar.startsWith("'")) {
      if (!/^'[^']*'$/.test(scalar)) throw new Error('Invalid quoted display.language');
      found = scalar.slice(1, -1);
    } else found = scalar;
  }
  const language = normalizeResponseLanguage(found === undefined ? 'auto' : found);
  if (forModel && privacyDecision(loadPrivacyPolicy(root), {
    id: 'file:user-space/overrides.yaml', kind: 'response-language',
    source: { path: 'user-space/overrides.yaml' }, language,
  }) === 'block') throw Object.assign(new Error('Privacy policy blocks the response-language preference'), {code:'required_context_private'});
  return language;
}
