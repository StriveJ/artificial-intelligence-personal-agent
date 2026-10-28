// dream
import { atomicWriteFile } from './lib/atomic-write.mjs';
import { assertWithin,safeRelativePath } from './lib/safe-path.mjs';
import { readFileSync } from 'node:fs';
import { writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { readMemoryIndex } from './lib/memory-index-store.mjs';
function arg(n){const i=process.argv.indexOf('--'+n);return i>=0?process.argv[i+1]:'';}
const root=arg('root')||'.';
const week=safeRelativePath(arg('week')||'current');
if(week.includes('/'))throw new Error("week cannot contain directory components");
if(existsSync(join(root,'state','sleep-mode.md'))){console.log(JSON.stringify({status:'skipped',reason:'sleep-mode'}));process.exit(0);}
const from=arg('from')||'';
const to=arg('to')||'';

const dailyDir=join(root,'user-space','logs','daily');
let daily=existsSync(dailyDir)?readdirSync(dailyDir).filter(f=>f.endsWith('.md')):[];
if(from||to){
  daily=daily.filter(f=>{
    const m=f.match(/(\d{4}-\d{2}-\d{2})/);
    if(!m)return !from&&!to;
    return (!from||m[1]>=from)&&(!to||m[1]<=to);
  });
}

const archiveDir=join(root,'user-space','memory','archive');
const archive=existsSync(archiveDir)?readdirSync(archiveDir):[];

let relationCount=0;
{
  try{const index=readMemoryIndex(root);for(const e of index.entries||[])relationCount+=(e.relations||[]).length;}catch{}
}

const lines=[
  "# Dream Report",'',
  "## Weekly Log Inventory",
  ...daily.map(f=>`- ${f}`),'',
  "## Archived Entry Inventory",
  ...archive.map(f=>`- ${f}`),'',
  "## Current Relation Statistics",
  `- Total relations: ${relationCount}`,'',
  "## Organization Candidates",'',
  "## Potential Patterns",'',
  "## Evolution Proposal Draft",'',
  "## Next-Day Hints",'',
];
const path=assertWithin(root,join(root,'user-space','logs','dream',week+'-dream.md'),{rejectLinks:true});
if(process.argv.includes('--complete')){
 const payload=JSON.parse(arg('input')||readFileSync(0,'utf8'));
 const names=["Organization Candidates","Potential Patterns","Evolution Proposal Draft","Next-Day Hints"];
 // Existing pending reports and host payloads may still use legacy headings.
 const legacy=['\u6574\u7406\u5019\u9009','\u6f5c\u5728\u6a21\u5f0f','\u8fdb\u5316\u5efa\u8bae\u8349\u7a3f','\u6b21\u65e5\u63d0\u793a'];
 const valueOf=name=>payload.sections?.[name]??payload.sections?.[legacy[names.indexOf(name)]];
 if(!payload.sections||!names.some(n=>typeof valueOf(n)==='string'&&valueOf(n).trim()))throw new Error("Host must provide nonempty semantic sections; an empty skeleton is not completion");
 const previous=existsSync(path)?readFileSync(path,'utf8'):lines.join('\n');
 let filled=previous;
 for(const name of names){const value=valueOf(name);if(value!==undefined){if(typeof value!=='string')throw new Error("Semantic sections must be strings");let start=filled.indexOf('## '+name+'\n');if(start<0)start=filled.indexOf('## '+legacy[names.indexOf(name)]+'\n');const end=filled.indexOf('\n## ',start+3);if(start<0)throw new Error("Dream report is missing section: "+name);filled=filled.slice(0,start)+'## '+name+'\n'+value.trim()+'\n'+(end<0?'':filled.slice(end));}}
 atomicWriteFile(path,filled);console.log(JSON.stringify({status:'host_filled',target:path,semantic_quality:'not_verified',unattended:false}));
}else{
 if(!existsSync(path))atomicWriteFile(path,lines.join('\n'));
 console.log(JSON.stringify({status:'pending_host',target:path,existing:existsSync(path),unattended:false,hint:"Read the inventories in a session and provide semantic sections with --complete --input {sections:{...}}; idle time does not trigger automatic execution"}));
}
