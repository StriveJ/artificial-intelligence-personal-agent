// trait confirm
import { execFileSync } from 'node:child_process';
import { dirname,join } from 'node:path';
import { fileURLToPath } from 'node:url';

try{
 const args=process.argv.slice(2);
 execFileSync(process.execPath,[join(dirname(fileURLToPath(import.meta.url)),'aipa-memory-meta.mjs'),...args,'--type','trait','--confirm'],{stdio:'inherit'});
}catch{process.exitCode=1;}
