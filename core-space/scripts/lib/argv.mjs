// argv
export function pickCmd(argv = [], known = []) {
  const set = known instanceof Set ? known : new Set(known);
  let prevWasFlag = false;
  let fallback = '';
  for (const raw of argv) {
    const t = String(raw);

    if (t.startsWith('-') && t !== '-') {
      if (set.has(t)) return t;
      prevWasFlag = true; continue;
    }
    if (set.has(t)) {
      if (!prevWasFlag) return t;
      if (!fallback) fallback = t;
    }
    prevWasFlag = false;
  }
  return fallback;
}

export function pickPositional(argv = [], { skipFirst = '' } = {}) {
  const list = [...argv];
  let prevWasFlag = false;
  for (const raw of list) {
    const t = String(raw);
    if (t.startsWith('-') && t !== '-') { prevWasFlag = true; continue; }
    if (prevWasFlag) { prevWasFlag = false; continue; }
    if (t === skipFirst) continue;
    return t;
  }
  return '';
}
