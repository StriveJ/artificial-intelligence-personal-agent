// Parse Markdown into searchable entries without I/O. Each level-two heading owns its body; each distilled bracketed bullet is a separate entry even inside a section. Loose bullets become independent entries. Stable identity uses the complete source identity plus duplicate ordinal, not the truncated display title.
const DISTILL_ITEM = /^-\s*\[[^\]]+\]\s/;
export function parseMemorySections(markdown, { withIdentity = false } = {}) {
  const entries = [];
  let current = null;
  const flush = () => {
    if (current) {
      const body = current.body.trim();
      if (body) entries.push({ title: current.title, body, identityKey: current.identityKey });
      current = null;
    }
  };
  for (const raw of (markdown || '').split(/\r?\n/)) {
    const h2 = raw.match(/^##\s+(.*)$/);
    if (h2) {
      flush();
      current = { title: h2[1].trim(), body: '', identityKey: 'heading:' + h2[1].trim() };
    } else if (DISTILL_ITEM.test(raw)) {

      flush();
      const text = raw.replace(/^-\s*/, '').trim();
      current = { title: text.slice(0, 60), body: text, identityKey: 'item:' + text };
    } else if (current) {
      current.body += (current.body ? '\n' : '') + raw;
    } else {
      const bullet = raw.match(/^\s*-\s+(.*)$/);
      if (bullet) {
        const text = bullet[1].trim();
        if (text) entries.push({ title: text.slice(0, 60), body: text, identityKey: 'item:' + text });
      }
    }
  }
  flush();
  const counts = new Map();
  return entries.map(({identityKey, ...entry}) => {
    const ordinal = (counts.get(identityKey) || 0) + 1; counts.set(identityKey, ordinal);
    return withIdentity ? {...entry, identity: [identityKey, ordinal]} : entry;
  });
}
