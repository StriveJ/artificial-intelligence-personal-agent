// Render a profile proposal from cited evidence at the canonical draft path. profile.yaml remains authoritative and requires explicit user confirmation; this module never writes it.
import { daysBetween } from './signal-core.mjs';

export const DRAFT_SECTIONS = ["Suggested Additions", "Suggested Changes", "Suggested Removal or Reduced Weight", "Stable Characteristics (Trait Candidates)", "Evidence Index"];
const LEGACY_DRAFT_SECTIONS = ['\u5efa\u8bae\u65b0\u589e', '\u5efa\u8bae\u4fee\u6539', '\u5efa\u8bae\u5220\u9664/\u964d\u6743', '\u7a33\u5b9a\u7279\u5f81\uff08traits \u5019\u9009\uff09', '\u4f9d\u636e\u7d22\u5f15'];
export const EMPTY_PLACEHOLDER = "(none yet)";
export const DRAFT_PATH = 'user-space/projects/aipa/persona-draft.md';

export const PROFILE_PATH = 'user-space/profile.yaml';
export const DEFAULT_MAX_AGE_DAYS = 30;

export function renderDraft({ date, sections = {} }) {
  const lines = [
    `# Profile Draft (${date} generated)`,
    '',
    "> This file is a **proposal**. The user must confirm the draft before changes enter user-space/profile.yaml; the script never edits the profile automatically.",
    "> Each suggestion should cite its scene-block or memory evidence for individual review.",
    '',
  ];
  for (const s of DRAFT_SECTIONS) {
    const body = String(sections[s] ?? sections[LEGACY_DRAFT_SECTIONS[DRAFT_SECTIONS.indexOf(s)]] ?? '').trim();
    lines.push(`## ${s}`, body || EMPTY_PLACEHOLDER, '');
  }
  return lines.join('\n');
}

export function parseProfile(text) {
  const out = {};
  const lines = String(text ?? '').split(/\r?\n/);
  let inGaps = false;
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    const kv = line.match(/^\s{2}([a-z_]+):\s*(.*)$/);
    if (kv) {
      const [, key, val] = kv;
      inGaps = false;
      if (val.startsWith('[')) {
        out[key] = val.replace(/^\[|\]$/g, '').split(',').map(s => s.trim()).filter(Boolean);
      } else if (val) {
        out[key] = val.trim();
      } else {
        out[key] = [];
        if (key === 'knowledge_gaps') inGaps = true;
      }
      continue;
    }
    if (inGaps) {
      const item = line.match(/^\s{4}-\s*(.*)$/);
      if (item) out.knowledge_gaps.push(item[1].trim().replace(/^["']|["']$/g, ''));
    }
  }
  return out;
}

export function needsRegenerate({ draftDate = '', nowDate, maxAgeDays = DEFAULT_MAX_AGE_DAYS }) {
  if (!draftDate) return true;
  return daysBetween(String(draftDate).slice(0, 10), String(nowDate).slice(0, 10)) > maxAgeDays;
}
