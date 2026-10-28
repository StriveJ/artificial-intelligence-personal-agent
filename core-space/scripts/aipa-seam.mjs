// seam
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
function arg(n){const i=process.argv.indexOf('--'+n);return i>=0?process.argv[i+1]:'';}
const root=arg('root')||'.';
const file=arg('seam')||join(root,'core-space','seam.yaml');
const text=readFileSync(file,'utf8');

const names=[...text.matchAll(/^\s{2}([A-Za-z0-9_-]+):\s*$/gm)].map(m=>m[1]);
console.log(JSON.stringify(names));
