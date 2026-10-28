// support contract
import {readFileSync,readdirSync,lstatSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {UPDATE_CONTRACT,frameworkCompatibilityReport} from './update-contract.mjs';
import * as contextContract from './context-projection.mjs';
import * as clockContract from './day-clock.mjs';
import {parseChecksums} from './origin-checksums.mjs';
import {assertWithin} from './safe-path.mjs';

export const SUPPORT_DIAGNOSTICS_SCHEMA=1;
export function coreSupport(){
 return {schema:SUPPORT_DIAGNOSTICS_SCHEMA,updateSchema:UPDATE_CONTRACT.schema,minNode:UPDATE_CONTRACT.min_node,thirdPartyPackages:[],capabilities:[...UPDATE_CONTRACT.capabilities],formats:{...UPDATE_CONTRACT.formats},context:{projection:contextContract.CONTEXT_PROJECTION_SCHEMA??null,completeness:contextContract.CONTEXT_COMPLETENESS_SCHEMA??null,budgets:{...contextContract.DEFAULT_CONTEXT_BUDGETS}},businessClock:clockContract.BUSINESS_CLOCK_SCHEMA??null};
}

export function coreSupportMarkdown(){
 const value=coreSupport();
 return ["| Core contract | Source declaration |",'|---|---|',`| Update contract / minimum declared Node | schema ${value.updateSchema} / Node ≥${value.minNode} (a declared minimum does not imply validation on that version) |`,`| Third-party packages | ${value.thirdPartyPackages.length?value.thirdPartyPackages.join(', '):"none"} |`,`| Context projection / completeness | ${value.context.projection} / ${value.context.completeness} |`,`| Default context budget | IDE ${value.context.budgets.ide} bytes; Hub ${value.context.budgets.hub} bytes |`,`| Business clock | schema ${value.businessClock} |`,`| Behaviors (${value.capabilities.length}) | ${value.capabilities.join(', ')} |`,'',"| Persistent format path | Contract version |",'|---|---|',...Object.entries(value.formats).map(([path,schema])=>`| \`${path}\` | ${schema} |`)].join('\n');
}

export function coreDiagnostics(root){
 const readPaths=[],issues=[];
 const read=rel=>{const path=assertWithin(root,join(root,rel),{rejectLinks:true});readPaths.push(rel);return readFileSync(path);};
 let version=null;
 try{version=read('AIPA-MANIFEST.yaml').toString('utf8').match(/^[ \t]+version:[ \t]*["']?(\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?)["']?[ \t]*$/m)?.[1]||null;if(!version)issues.push({stage:'manifest',code:'framework_version_unknown'});}catch{issues.push({stage:'manifest',code:'framework_manifest_unavailable'});}
 let installedContract='unknown';
 try{const report=frameworkCompatibilityReport(root,UPDATE_CONTRACT);installedContract=report.installedContract;readPaths.push(...report.readPaths);if(!report.compatible||installedContract!=='matching-coordinator')issues.push({stage:'contract',code:'framework_contract_unverified'});}catch{issues.push({stage:'contract',code:'framework_contract_unavailable'});}
 let drift={status:'not-checked',scope:'core-space-only',checked:0,changed:0},baselineLoaded=false;
 try{
  const baseline=parseChecksums(read('state/origin-baseline.txt').toString('utf8')),entries=[...baseline].filter(([rel])=>rel.startsWith('core-space/'));
  baselineLoaded=true;
  if(!entries.length)throw Error('empty framework baseline');
  const actual=new Map();
  function walk(rel){const path=assertWithin(root,join(root,rel),{rejectLinks:true}),stat=lstatSync(path);if(stat.isDirectory())for(const name of readdirSync(path).sort())walk(rel+'/'+name);else if(stat.isFile())actual.set(rel,createHash('sha256').update(read(rel)).digest('hex'));else throw Error('non-regular framework file');}
  walk('core-space');
  const expected=new Map(entries),paths=new Set([...actual.keys(),...expected.keys()]),changed=[...paths].filter(rel=>actual.get(rel)!==expected.get(rel)).length;
  drift={status:changed?'changed':'matching',scope:'core-space-only',checked:paths.size,changed};
 }catch(error){drift={...drift,status:!baselineLoaded&&error.code==='ENOENT'?'baseline-missing':'unverified'};}
 return {schema:SUPPORT_DIAGNOSTICS_SCHEMA,status:issues.length?'blocked':drift.status==='matching'?'checked':'partial',version,coordinator:coreSupport(),installedContract,drift,issues,readPaths:[...new Set(readPaths)],context:{status:'not-checked'},personalDataInspected:false,dataCompatibility:'not-checked',installationAllowed:false,externalCalls:false};
}
