// day clock
import { dayKey } from './time-boundary.mjs';
import { dayStartHour } from './llm-provider.mjs';
import {readFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {assertWithin} from './safe-path.mjs';
export { dayStartHour } from './llm-provider.mjs';
export const BUSINESS_CLOCK_SCHEMA=1;
const formatters=new Map();
export function clockSettings(root){
 const path=assertWithin(root,join(root,'user-space/llm-provider.yaml'),{rejectLinks:true}),text=existsSync(path)?readFileSync(path,'utf8'):'';
 const values=[...text.matchAll(/^time_zone:[ \t]*([^\r\n]*)(?:\r?$)/gm)];
 if(values.length>1||[...text.matchAll(/^day_start_hour:/gm)].length>1)throw Error("Duplicate shared business-clock configuration");
 let zone=values.length?values[0][1].replace(/\s+#.*$/,'').trim():'Asia/Shanghai';
 if(zone.startsWith('"'))zone=JSON.parse(zone);else zone=zone.replace(/^'|'$/g,'');
 try{new Intl.DateTimeFormat('en',{timeZone:zone}).format();}catch{throw Error("time_zone must be a supported IANA time zone");}
 return {schema:1,timeZone:zone,dayStartHour:dayStartHour(root),source:'user-space/llm-provider.yaml',defaultTimeZone:!values.length};
}
export function createBusinessClock(root,{dayStartHour:legacyHour,timeZone:legacyZone}={}){
 const settings=clockSettings(root);
 if(legacyHour!==undefined&&legacyHour!==settings.dayStartHour||legacyZone!==undefined&&legacyZone!==settings.timeZone)throw Error("Hub time configuration differs from the Core shared business clock; align the configuration first");
 let formatter=formatters.get(settings.timeZone);if(!formatter){formatter=new Intl.DateTimeFormat('en-CA',{timeZone:settings.timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});formatters.set(settings.timeZone,formatter);}
 const timestamp=value=>{const date=value instanceof Date?value:new Date(value),p=Object.fromEntries(formatter.formatToParts(date).map(row=>[row.type,row.value]));return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;};
 return {settings,timestamp,dayKey:value=>dayKey(timestamp(value),settings.dayStartHour),hour:value=>Number(timestamp(value).slice(11,13))};
}
export const clockTimestamp=(root,date=new Date())=>createBusinessClock(root).timestamp(date);

export function tsLocal(date = new Date()) {
  const p = (x) => String(x).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`;
}

export function todayKey(root, { now = new Date(), ts = '' } = {}) {
  return ts?dayKey(ts,dayStartHour(root)):createBusinessClock(root).dayKey(now);
}

export function utcToday(date = new Date()) {
  return date.toISOString().slice(0, 10);
}
