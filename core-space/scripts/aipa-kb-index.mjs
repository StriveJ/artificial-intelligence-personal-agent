import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

function arg(n){ const i=process.argv.indexOf('--'+n); return i>=0 ? process.argv[i+1] : ''; }

const root = arg('root') || '.';
const cardsDir = join(root, 'user-space', 'knowledge-base', '_index', 'cards');
const idxPath = join(root, 'user-space', 'knowledge-base', '_index', 'knowledge-index.json');

if(!existsSync(cardsDir)){ console.error('no cards dir'); process.exit(1); }

const get = (meta, k) => {
  const r = meta.match(new RegExp('^' + k + ':\\s*(.*)$', 'm'));
  return r ? r[1].trim().replace(/^"|"$/g, '') : '';
};
const parseList = (s) => (s || '').replace(/^\[|\]$/g, '').split(',').map(x => x.trim()).filter(Boolean);

const entries = [];
for(const file of readdirSync(cardsDir).filter(f => f.endsWith('.card.md'))){
  const text = readFileSync(join(cardsDir, file), 'utf8');
  const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if(!fm) continue;
  const meta = fm[1];
  entries.push({
    id: get(meta, 'kb_id'),
    title: get(meta, 'title'),
    type: get(meta, 'type'),
    tags: parseList(get(meta, 'tags')),
    summary: get(meta, 'summary'),
    original_path: get(meta, 'original_path'),
    status: get(meta, 'status'),
    confirmed: get(meta, 'confirmed') === 'true',
    source: get(meta, 'source'),
    created: get(meta, 'created'),
  });
}

const index = { version: '0.1', last_updated: new Date().toISOString(), entries };
writeFileSync(idxPath, JSON.stringify(index, null, 2), 'utf8');
console.log('indexed');
