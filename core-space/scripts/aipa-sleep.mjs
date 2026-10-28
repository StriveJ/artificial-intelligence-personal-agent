// sleep
import { writeFileSync, existsSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pickCmd } from './lib/argv.mjs';
function arg(n){const i=process.argv.indexOf('--'+n);return i>=0?process.argv[i+1]:'';}
const root=arg('root')||'.';
const mode=pickCmd(process.argv.slice(2), ['sleep', 'wake']);
const p=join(root,'state','sleep-mode.md');
if(mode==='sleep'){mkdirSync(join(root,'state'),{recursive:true});writeFileSync(p,"# Sleep Mode\n",'utf8');}
else if(mode==='wake'){if(existsSync(p))rmSync(p);}
console.log(mode);
