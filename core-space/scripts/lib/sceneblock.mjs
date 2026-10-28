// Render derived scene views from authoritative memory and activity. Preserve the manual section across regeneration and accept legacy section names when reading. Scene views never replace the original memory source.
export const SCENE_SECTIONS = ["Current State", "Key Decisions", "Methods and Lessons", "Open Loops", "Assets and Paths", "Provenance"];
export const MANUAL_SECTION = "Manual Additions";
export const MANUAL_PLACEHOLDER = "(manual additions preserved across regeneration)";
export const EMPTY_PLACEHOLDER = "(none yet)";
// Legacy section keys are read aliases only; regenerated framework headings are English.
const LEGACY_SCENE_SECTIONS = ['\u5f53\u524d\u72b6\u6001', '\u5173\u952e\u51b3\u7b56', '\u65b9\u6cd5\u4e0e\u6559\u8bad', '\u672a\u95ed\u73af', '\u8d44\u4ea7\u4e0e\u8def\u5f84', '\u6eaf\u6e90'];
const LEGACY_MANUAL_SECTION = '\u624b\u5de5\u8865\u5145';
const LEGACY_MANUAL_PLACEHOLDER = '\uff08\u53ef\u5728\u91cd\u7b97\u540e\u4fdd\u7559\u7684\u624b\u5de5\u8865\u5145\uff09';

export function normalizeProject(name, aliases = {}) {
  const n = String(name ?? '').trim();
  if (!n || n === '?') return '';
  return aliases[n] || n;
}

export function loadAliases(text) {
  const out = {};
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const s = line.trim();
    if (!s || s.startsWith('#')) continue;
    const m = s.match(/^([^:\s]+):\s*(\S+)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

export function sceneRelPath(project) {
  return `user-space/projects/${project}/scene.md`;
}

export function renderScene({ project, updated, lastActivity = '', sections = {}, manual = '' }) {
  const lines = [
    '---',
    `project: ${project}`,
    `updated: ${updated}`,
    `last_activity: ${lastActivity}`,
    '---',
    '',
    `# Scene: ${project}`,
    '',
  ];
  for (const s of SCENE_SECTIONS) {
    const body = String(sections[s] ?? sections[LEGACY_SCENE_SECTIONS[SCENE_SECTIONS.indexOf(s)]] ?? '').trim();
    lines.push(`## ${s}`, body || EMPTY_PLACEHOLDER, '');
  }
  lines.push(`## ${MANUAL_SECTION}`, String(manual ?? '').trim() || MANUAL_PLACEHOLDER, '');
  return lines.join('\n');
}

export function extractManual(text) {
  const m = String(text ?? '').match(new RegExp(`##\\s*(?:${MANUAL_SECTION}|${LEGACY_MANUAL_SECTION})\\s*\\n([\\s\\S]*?)(?=\\n##|$)`));
  if (!m) return '';
  const body = m[1].trim();
  return [MANUAL_PLACEHOLDER, LEGACY_MANUAL_PLACEHOLDER].includes(body) ? '' : body;
}

export function parseSceneFrontmatter(text) {
  const m = String(text ?? '').match(/^---\n([\s\S]*?)\n---/);
  const out = {};
  if (!m) return out;
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([a-z_]+):\s*(.*)$/);
    if (kv) out[kv[1]] = kv[2].trim();
  }
  return out;
}

export function needsUpdate(sceneText, date) {
  const fm = parseSceneFrontmatter(sceneText || '');
  if (!fm.updated) return true;
  return String(fm.updated) < String(date);
}

export function activityByProject(events, aliases = {}) {
  const map = new Map();
  for (const e of events || []) {
    const p = normalizeProject(e?.project, aliases);
    if (!p) continue;
    const cur = map.get(p) || { project: p, count: 0, lastActivity: '' };
    cur.count += 1;
    const d = String(e.ts_local || '').slice(0, 10);
    if (d > cur.lastActivity) cur.lastActivity = d;
    map.set(p, cur);
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.project.localeCompare(b.project));
}
