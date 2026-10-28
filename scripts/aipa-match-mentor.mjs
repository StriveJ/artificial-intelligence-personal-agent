// match mentor
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseIndustryMap, canonicalIndustry } from '../core-space/scripts/lib/industry-map.mjs';

function arg(name) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? process.argv[i + 1] : '';
}

const baseDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
function parseMentor(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_]+):\s*(.*)$/);
    if (m) {
      const v = m[2].trim();
      if (m[1] === 'tech_stack') out[m[1]] = v.replace(/^\[|\]$/g, '').split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
      else out[m[1]] = v;
    }
  }
  return out;
}
function industryMatch(ind, mentorInd, map) {
  ind=canonicalIndustry(ind);mentorInd=canonicalIndustry(mentorInd);
  if (ind === mentorInd) return 1.0;
  for (const items of Object.values(map)) {
    const canonical=items.map(canonicalIndustry);
    if (canonical.includes(ind) && canonical.includes(mentorInd)) return 0.6;
  }
  return 0;
}
const industry = arg('industry');
const userTech = (arg('tech') || '').split(',').map(s => s.trim()).filter(Boolean);
const role = arg('role');
const mentorsDir = arg('mentors') || join(baseDir, 'core-space/mentors');
let map;
try { map = parseIndustryMap(readFileSync(arg('map') || join(baseDir, 'industry-map.yaml'), 'utf8')); }
catch (error) { console.error("Cannot read industry mapping: " + error.message); process.exit(1); }
const results = [];
const canonicalTech=value=>value==='\u5d4c\u5165\u5f0fLinux'?'embedded Linux':value;
for (const id of readdirSync(mentorsDir)) {
  const p = join(mentorsDir, id, 'mentor.yaml');
  let m; try { m = parseMentor(readFileSync(p, 'utf8')); } catch { continue; }
  const overlap = (m.tech_stack || []).filter(x => userTech.map(canonicalTech).includes(canonicalTech(x))).length;
  const techScore = userTech.length ? overlap / userTech.length : 0;
  const canonicalRole=value=>value==='\u4ece\u4e1a\u8005'?'professional':String(value||'').toLowerCase();
  const roleScore = role && canonicalRole(m.role) === canonicalRole(role) ? 1.0 : 0;
  const score = industryMatch(industry, m.industry, map) * 0.4 + techScore * 0.35 + roleScore * 0.25;
  results.push({ mentor_id: m.mentor_id || id, name: m.name || id, score: Math.round(score * 100) / 100 });
}
results.sort((a, b) => b.score - a.score);
const top = results.filter(r => r.score >= 0.7).slice(0, 3);
console.log(JSON.stringify({ top }));
