// summarize
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pickCmd } from './lib/argv.mjs';
function arg(name){ const i=process.argv.indexOf('--'+name); return i>=0 ? process.argv[i+1] : ''; }
const root=arg('root')||'.';
const mode=pickCmd(process.argv.slice(2), ['day', 'month', 'year']);
const date=arg('date')||'';
if(mode==='day'){
  mkdirSync(join(root,'user-space','logs','daily'),{recursive:true});
  writeFileSync(join(root,'user-space','logs','daily',`DAILY-NOTE_${date}.md`), `# DAILY-NOTE ${date}
## Work
## Life
## Daily Summary (AI-generated; editable)
`, 'utf8');
}else if(mode==='month'){
  const month=date.slice(0,7);
  mkdirSync(join(root,'user-space','logs','monthly'),{recursive:true});
  writeFileSync(join(root,'user-space','logs','monthly',`MONTHLY-REVIEW_${month}.md`), `# MONTHLY-REVIEW ${month}
## Trend Analysis
## Specification Revisions
## Skill Evolution Inventory
`, 'utf8');
}else if(mode==='year'){
  const year=date.slice(0,4);
  mkdirSync(join(root,'user-space','logs','yearly'),{recursive:true});
  writeFileSync(join(root,'user-space','logs','yearly',`YEARLY-REVIEW_${year}.md`), `# YEARLY-REVIEW ${year}
## Annual Trends
## Growth Review
`, 'utf8');
}
