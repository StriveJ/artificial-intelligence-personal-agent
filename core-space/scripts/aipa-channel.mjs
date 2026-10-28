// channel
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { TELEMETRY_DISCLOSURE } from './lib/telemetry-disclosure.mjs';

function arg(n){const i=process.argv.indexOf('--'+n);return i>=0?process.argv[i+1]:'';}
const root=resolve(arg('root')||'.');
const set=arg('set');
const hasTelemetry=process.argv.includes('--telemetry');
const manifestPath=join(root,'AIPA-MANIFEST.yaml');
if(!existsSync(manifestPath)){ console.error("Missing "+manifestPath); process.exit(1); }

if(set&&hasTelemetry){
  console.error("--set and --telemetry cannot be used together. Run two commands:");
  console.error("  aipa-channel --root <instance> --set beta");
  console.error("  aipa-channel --root <instance> --telemetry on");
  process.exit(1);
}
const m=readFileSync(manifestPath,'utf8');

if(set){
  if(set!=='stable'&&set!=='beta'){ console.error("--set accepts only stable or beta"); process.exit(1); }

  const nv=/^([ \t]*)channel:[ \t]*\S*/m.test(m)
    ? m.replace(/^([ \t]*)channel:[ \t]*\S*/m,`$1channel: ${set}`)
    : m.replace(/^([ \t]*)version:[ \t]*\S+/m,(line)=>`${line}\n${line.match(/^[ \t]*/)[0]}channel: ${set}`);

  if(!/^[ \t]+channel:[ \t]*\S+/m.test(nv)||!/^[ \t]+version:[ \t]*\S+/m.test(nv)){
    console.error("Invalid manifest structure (channel/version indentation missing); write cancelled"); process.exit(1);
  }

  if(set==='beta'&&(((m.match(/^[ \t]+telemetry:[ \t]*(\S+)/m)||[])[1])||'off')!=='on'){
    console.error("Beta enrollment requires explicit consent to send redacted diagnostics. Run in order:");
    console.error("  aipa-channel --root <instance> --telemetry on");
    console.error("  aipa-channel --root <instance> --set beta");
    for(const l of TELEMETRY_DISCLOSURE) console.error(l);
    process.exit(1);
  }
  writeFileSync(manifestPath,nv,'utf8');
  console.log(set);
  process.exit(0);
}

const telemetry=arg('telemetry');
if(hasTelemetry){
  if(telemetry!=='on'&&telemetry!=='off'){ console.error("--telemetry accepts only on or off"); process.exit(1); }

  const nv=/^([ \t]*)telemetry:[ \t]*\S*/m.test(m)
    ? m.replace(/^([ \t]*)telemetry:[ \t]*\S*/m,`$1telemetry: ${telemetry}`)
    : m.replace(/^([ \t]*)version:[ \t]*\S+/m,(line)=>`${line}\n${line.match(/^[ \t]*/)[0]}telemetry: ${telemetry}`);
  if(!/^[ \t]+telemetry:[ \t]*\S+/m.test(nv)){ console.error("Invalid manifest structure; write cancelled"); process.exit(1); }

  if(telemetry==='on'){
    process.stdout.on('error',(e)=>{ console.error("Disclosure could not be written to stdout ("+(e&&e.code||e)+"); consent not recorded: "+manifestPath+" unchanged."); process.exit(1); });
    console.log("Redacted diagnostic reporting enabled (required for beta enrollment). Content and purpose:");
    for(const l of TELEMETRY_DISCLOSURE) console.log(l);
    await new Promise((done)=>{ process.stdout.write('',done); });
  }
  writeFileSync(manifestPath,nv,'utf8');
  console.log(telemetry);
  process.exit(0);
}

console.log(((m.match(/^[ \t]+channel:[ \t]*(\S+)/m)||[])[1])||'stable');
