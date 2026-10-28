// agenda provider
import {readFileSync,existsSync} from 'node:fs';
import {join,isAbsolute,resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {assertWithin} from './safe-path.mjs';

export async function dispatchAgenda(root,args){
 const bindingPath=assertWithin(root,join(root,'.git/aipa-hub-agenda.json'),{rejectLinks:true});
 if(!existsSync(bindingPath))throw Error("No agenda provider registered on this device; run the Hub agenda integration installer first");
 const binding=JSON.parse(readFileSync(bindingPath,'utf8'));
 if(binding.version!==1||![binding.configFile,binding.programDir].every(p=>typeof p==='string'&&isAbsolute(p)))throw Error("Invalid agenda provider binding");

 if(args.some(a=>/^--(?:root|config)(?:=|$)/.test(a)))throw Error("Agenda command cannot override provider configuration or instance root");
 const config=JSON.parse(readFileSync(binding.configFile,'utf8'));
 if(typeof config.root!=='string'||resolve(config.root)!==resolve(root))throw Error("Agenda provider instance mismatch");
 const executable=assertWithin(binding.programDir,join(binding.programDir,'lib/agenda-cli.mjs'),{rejectLinks:true});
 return new Promise((yes,no)=>{
   const child=spawn(process.execPath,[executable,'--config',binding.configFile,...args],{stdio:'inherit',shell:false,windowsHide:true});
   child.once('error',()=>no(Error("Agenda provider failed to start; check local registration")));child.once('exit',code=>yes(code??1));
 });
}
