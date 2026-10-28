// kb ingest
import { mkdirSync, readFileSync, writeFileSync, readdirSync, copyFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, basename, relative, resolve, sep, isAbsolute } from 'node:path';
import { todayKey } from './lib/day-clock.mjs';
import { assertWithin, safeRelativePath } from './lib/safe-path.mjs';

function arg(n){ const i=process.argv.indexOf('--'+n); return i>=0 ? process.argv[i+1] : ''; }

const root = resolve(arg('root') || '.');
const file = arg('file');
const type = arg('type') || '';
const to = arg('to') ? safeRelativePath(arg('to')) : '';
const today = arg('today') || todayKey(root);

if(!file){ console.error("Missing --file"); process.exit(1); }
if(type && !['self','external'].includes(type)){ console.error("--type accepts only self|external"); process.exit(1); }
if (!/^\d{4}-\d{2}-\d{2}$/.test(today) || Number.isNaN(Date.parse(today + 'T00:00:00Z')) || new Date(today + 'T00:00:00Z').toISOString().slice(0, 10) !== today) {
  console.error("--today must be a valid YYYY-MM-DD date"); process.exit(1);
}

const kbDir = join(root, 'user-space', 'knowledge-base');
const cardsDir = join(kbDir, '_index', 'cards');
assertWithin(root, kbDir, { rejectLinks: true });
assertWithin(root, cardsDir, { rejectLinks: true });

const srcAbs = resolve(file);
if(!existsSync(srcAbs)){ console.error(`File not found: ${file}`); process.exit(1); }
const srcRel = relative(kbDir, srcAbs);
const alreadyInside = srcRel !== '' && !isAbsolute(srcRel) && srcRel !== '..' && !srcRel.startsWith('..' + sep);
const dest = alreadyInside ? assertWithin(kbDir, srcAbs) : assertWithin(kbDir, join(kbDir, type || 'inbox', to, safeRelativePath(basename(srcAbs))));
assertWithin(root, dest, { rejectLinks: true });
const data = readFileSync(srcAbs);
const hash = createHash('sha256').update(data).digest('hex').slice(0,16);

for(const card of (existsSync(cardsDir) ? readdirSync(cardsDir) : []).filter(f=>f.endsWith('.card.md'))){
  const m = readFileSync(assertWithin(cardsDir, join(cardsDir, card)), 'utf8').match(/source_hash:\s*([a-f0-9]+)/);
  if(m && m[1] === hash){ console.log(`Already exists: ${card}`); process.exit(0); }
}

let originalPath;
if(alreadyInside){
  originalPath = relative(kbDir, srcAbs).split(sep).join('/');
} else {
  const area = type || 'inbox';
  const destDir = join(kbDir, area, to);
  if(existsSync(dest)){
    const destHash = createHash('sha256').update(readFileSync(dest)).digest('hex').slice(0,16);
    if(destHash !== hash){ console.error(`Destination has the same filename with different content: ${dest}`); process.exit(1); }
  }
  mkdirSync(destDir, { recursive: true });
  copyFileSync(srcAbs, dest);
  originalPath = [area, to, basename(srcAbs)].filter(Boolean).join('/');
}

const ymd = today.replace(/-/g, '');
let max = 0;
mkdirSync(cardsDir, { recursive: true });
for(const card of readdirSync(cardsDir).filter(f=>f.endsWith('.card.md'))){
  const m = card.match(/^kb-(\d{8})-(\d{3})\.card\.md$/);
  if(m && m[1] === ymd) max = Math.max(max, parseInt(m[2], 10));
}
const kbId = `kb-${ymd}-${String(max+1).padStart(3,'0')}`;

let title = basename(srcAbs).replace(/\.[^.]+$/, '');
if(/\.(md|markdown)$/i.test(srcAbs)){
  const line = data.toString('utf8').split(/\r?\n/).find(l => l.trim().startsWith('# '));
  if(line) title = line.replace(/^#\s+/, '').trim();
}

const cardType = type === 'self' ? 'self_written' : (type === 'external' ? 'external' : '');
const card = `---
kb_id: ${kbId}
title: ${title}
type: ${cardType}
tags: []
source: ""
original_path: ${originalPath}
media: text
summary: ""
outline: []
key_points: []
status: inbox
confirmed: false
sensitive: false
source_hash: ${hash}
created: ${today}
updated: ${today}
---
`;

writeFileSync(assertWithin(cardsDir, join(cardsDir, `${kbId}.card.md`)), card, 'utf8');
console.log(kbId);
