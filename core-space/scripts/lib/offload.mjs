// offload
export const DEFAULT_THRESHOLD = 4000;

export function shouldOffload(text, threshold = DEFAULT_THRESHOLD) {
  return String(text ?? '').length > threshold;
}

export function emptyIndex() {
  return { version: '0.1', entries: [] };
}

export function parseIndex(text) {
  try {
    const o = JSON.parse(String(text ?? ''));
    if (o && Array.isArray(o.entries)) return { version: o.version || '0.1', entries: o.entries };
  } catch {  }
  return emptyIndex();
}

export function serializeIndex(index) {
  return `${JSON.stringify({ version: (index && index.version) || '0.1', entries: (index && index.entries) || [] }, null, 2)}\n`;
}

export function addEntry(index, entry) {
  const base = index && Array.isArray(index.entries) ? index : emptyIndex();
  const rest = base.entries.filter((e) => e.id !== entry.id);
  return { version: base.version || '0.1', entries: [...rest, entry] };
}

export function gcIndex(index, cutoffDate) {
  const base = index && Array.isArray(index.entries) ? index : emptyIndex();
  const removed = [];
  const kept = [];
  for (const e of base.entries) {
    if (String(e.at || '').slice(0, 10) < String(cutoffDate).slice(0, 10)) removed.push(e.id);
    else kept.push(e);
  }
  return { index: { version: base.version || '0.1', entries: kept }, removed };
}

export function formatPointer(entry) {
  const kb = ((Number(entry?.bytes) || 0) / 1024).toFixed(1);
  return `[offload ${entry?.id}] ${entry?.summary || ''} (${kb}KB) - retrieve when needed with aipa-offload get ${entry?.id}`;
}
