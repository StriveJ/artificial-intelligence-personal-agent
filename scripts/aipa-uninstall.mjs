// uninstall
import { rmSync, existsSync } from 'node:fs';
function arg(n){const i=process.argv.indexOf('--'+n);return i>=0?process.argv[i+1]:'';}
const root=arg('root');
if(!root){console.error('missing --root');process.exit(1);}
const confirm=arg('confirm');
const deep=process.argv.includes('--deep');
if(confirm!=='yes'){console.error('confirm');process.exit(1);}
if(!existsSync(root)){console.error('not found');process.exit(1);}
if (deep) { console.error("--deep is not implemented; nothing deleted. Inventory external caches, schedulers and connected projects first, then follow a separate cleanup checklist."); process.exit(1); }
rmSync(root,{recursive:true,force:true});
console.log(`AIPA directory destroyed: ${root}`);
console.log("Destruction report: specified directory removed. External caches, schedulers, connected projects and remote copies were not verified or cleaned.");
