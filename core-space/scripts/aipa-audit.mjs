import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
function arg(name){ const i=process.argv.indexOf('--'+name); return i>=0 ? process.argv[i+1] : ''; }
const root=arg('root')||'.';
const message=arg('message')||'';
mkdirSync(join(root,'state'),{recursive:true});
appendFileSync(join(root,'state','audit.log'), `[${new Date().toISOString()}] ${message}\n`, 'utf8');
console.log('logged');
