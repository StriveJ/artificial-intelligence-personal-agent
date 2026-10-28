// value check
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
function arg(n){const i=process.argv.indexOf('--'+n);return i>=0?process.argv[i+1]:'';}
const text=arg('text')||'';
const root=arg('root')||'.';
const policy=arg('policy')||join(root,'core-space/policy.md');
const src=readFileSync(policy,'utf8');
// A sentence terminator in policy prose is not part of the literal match phrase.
const phrase=m=>m[1].trim().replace(/[.\u3002]$/u,'');
const forbidden=[...src.matchAll(/(?:Forbidden|\u7981\u6b62)[:\uFF1A]\s*([^\n]+)/gi)].map(phrase).filter(Boolean);
const suspicious=[...src.matchAll(/(?:Suspicious|\u53ef\u7591)[:\uFF1A]\s*([^\n]+)/gi)].map(phrase).filter(Boolean);
if(forbidden.some(x=>text.includes(x))){console.log('conflict');process.exit(0);}
if(suspicious.some(x=>text.includes(x))){console.log('suspicious');process.exit(0);}
console.log('ok');
