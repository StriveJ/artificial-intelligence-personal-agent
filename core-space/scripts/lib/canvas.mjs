// canvas
export const CANVAS_STATUSES = ['todo', 'doing', 'done', 'blocked'];

function normStatus(s) {
  return CANVAS_STATUSES.includes(s) ? s : 'todo';
}

export function renderCanvas({ project, updated, goal = '', steps = [] }) {
  const lines = [
    '---',
    `project: ${project}`,
    `updated: ${updated}`,
    '---',
    '',
    `# Task Canvas: ${project}`,
    '',
    "## Goal",
    goal || "(not set)",
    '',
    '```mermaid',
    'flowchart TD',
  ];
  steps.forEach((s, i) => {
    const mark = s.status === 'doing' ? ' 🔄' : '';
    lines.push(`    ${s.id}[${s.label}${mark}]`);
    if (i > 0) lines.push(`    ${steps[i - 1].id} --> ${s.id}`);
  });
  lines.push('```', '', "## Steps", '', "| id | Step | Status |", '|---|---|---|');
  for (const s of steps) lines.push(`| ${s.id} | ${s.label} | ${normStatus(s.status)} |`);
  lines.push('');
  return lines.join('\n');
}

export function parseCanvas(text) {
  const src = String(text ?? '');
  const fm = src.match(/^---\n([\s\S]*?)\n---/);
  const meta = {};
  if (fm) for (const line of fm[1].split(/\r?\n/)) {
    const kv = line.match(/^([a-z_]+):\s*(.*)$/);
    if (kv) meta[kv[1]] = kv[2].trim();
  }
  const steps = [];
  for (const line of src.split(/\r?\n/)) {
    const m = line.match(/^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*$/);
    if (!m) continue;
    if (m[1] === 'id' || m[1] === '---') continue;
    steps.push({ id: m[1], label: m[2], status: normStatus(m[3]) });
  }

  const goalSec = src.match(/##\s*(?:Goal|\u76ee\u6807)\s*\n([\s\S]*?)(?=\n##|$)/);
  const goal = goalSec ? goalSec[1].trim().replace(/^(?:\(not set\)|\uff08\u672a\u586b\u5199\uff09)$/, '') : '';
  return { project: meta.project || '', updated: meta.updated || '', goal, steps };
}

export function mergeSteps(prev, next) {
  const out = (prev || []).map((s) => ({ ...s }));
  for (const n of next || []) {
    const cur = out.find((s) => s.id === n.id);
    if (cur) {
      cur.label = n.label || cur.label;
      cur.status = normStatus(n.status ?? cur.status);
    } else {
      out.push({ id: n.id, label: n.label || n.id, status: normStatus(n.status) });
    }
  }
  return out;
}
