// Pure keyword scoring with discounted host/model query expansion. Literal matches outrank expansion-only matches; the via field distinguishes their provenance. No embedding dependency is required.
export const EXPAND_FACTOR = 0.6;

export function scoreEntry(entry, terms) {
  const title = String(entry?.title || '').toLowerCase();
  const body = String(entry?.body || '').toLowerCase();
  const tags = (entry?.tags || []).map((x) => String(x).toLowerCase());
  let s = 0;
  for (const term of terms || []) {
    const t = String(term || '').toLowerCase();
    if (!t) continue;
    if (tags.includes(t)) s += 3;
    if (title.includes(t)) s += 2;
    if (body.includes(t)) s += 1;
  }
  return s;
}

export function parseExpand(text) {
  const out = [];
  for (const raw of String(text ?? '').split(/[,\s]+/)) {
    const t = raw.trim();
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

export function mergeScores({ base = 0, expand = 0 }) {
  const score = Math.round((base + expand * EXPAND_FACTOR) * 100) / 100;
  const via = base > 0 && expand > 0 ? 'q+expand' : base > 0 ? 'q' : expand > 0 ? 'expand' : '';
  return { score, via };
}
