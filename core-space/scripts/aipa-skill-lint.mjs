#!/usr/bin/env node
// skill lint
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lintSkill } from './lib/skill-lint.mjs';
import { discoverSkills } from './lib/skill-discovery.mjs';

function arg(n) { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : ''; }
const root = arg('root') || '.';
const asJson = process.argv.includes('--json');
const strict = process.argv.includes('--strict');

const dirs = [
  join(root, 'user-space', 'skills'),
  join(root, 'core-space', 'mentors'),
  join(root, 'core-space', 'common', 'skills'),
];
const files = dirs.flatMap(d => discoverSkills(d).map(s => join(s.dir, 'SKILL.md'))).sort();
const report = files.map((f) => {
  const rel = f.replace(/\\/g, '/').replace(root.replace(/\\/g, '/') + '/', '');
  return { file: rel, ...lintSkill(readFileSync(f, 'utf8')) };
});
const errors = report.filter((r) => r.errors.length);
const warnings = report.filter((r) => r.warnings.length);

if (asJson) {
  console.log(JSON.stringify({ status: errors.length ? 'issues' : 'ok', total: report.length, withErrors: errors.length, withWarnings: warnings.length, report }, null, 2));
} else {
  console.log(`Scanned ${report.length} SKILL.md files: ${errors.length} with errors, ${warnings.length} with warnings
`);
  for (const r of report) {
    if (!r.errors.length && !r.warnings.length) continue;
    console.log(`${r.file}`);
    for (const e of r.errors) console.log(`  ✖ ${e}`);
    for (const w of r.warnings) console.log(`  ! ${w}`);
  }
  if (!errors.length && !warnings.length) console.log("All conform to the specification ✓");
}
process.exit(strict && errors.length ? 1 : 0);
