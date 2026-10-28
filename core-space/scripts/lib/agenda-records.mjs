// Core agenda format source; the Hub mirror is verified by synthetic contract tests.
import {createHash} from 'node:crypto';
export const agendaError = (message, status = 400) => Object.assign(new Error(message), {status});
const bad = message => { throw agendaError(message); };
export const agendaId = id => typeof id === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(id) ? id : bad("Invalid agenda ID");
export const revisionOf = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function validDate(value) {
  if(typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const n=Date.parse(value+'T00:00:00Z');
  return Number.isFinite(n) && new Date(n).toISOString().slice(0,10)===value;
}
export function validInstant(value) {
  const m=typeof value==='string' && value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-](\d{2}):(\d{2}))$/);
  return Boolean(m && validDate(m[1]) && +m[2]<24 && +m[3]<60 && +(m[4]||0)<60 && +(m[6]||0)<=14 && +(m[7]||0)<60 && (+m[6]!==14 || +m[7]===0) && Number.isFinite(Date.parse(value)));
}
export function zone(value='Asia/Shanghai') {
  try { if(typeof value!=='string'||value.length>80)throw Error(); new Intl.DateTimeFormat('en',{timeZone:value}); return value; }
  catch { return bad("Invalid agenda time zone"); }
}
export function localDate(stamp, timeZone='Asia/Shanghai') {
  const p=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(stamp));
  const v=Object.fromEntries(p.map(x=>[x.type,x.value]));return `${v.year}-${v.month}-${v.day}`;
}
export const nextDate = day => new Date(Date.parse(day+'T00:00:00Z')+86400000).toISOString().slice(0,10);
export function midnight(day, timeZone) {
  if(!validDate(day))return bad("Invalid agenda date");
  const target=Date.parse(day+'T00:00:00Z');let result=target;
  const fmt=new Intl.DateTimeFormat('sv-SE',{timeZone,hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'});
  for(let i=0;i<4;i++){
    const v=Object.fromEntries(fmt.formatToParts(new Date(result)).map(p=>[p.type,p.value]));
    const wall=Date.parse(`${v.year}-${v.month}-${v.day}T${v.hour}:${v.minute}:${v.second}Z`);
    const delta=target-wall;if(!delta)return result;result+=delta;
  }
  return bad("This date does not exist in the selected time zone; specify the time explicitly");
}
const FIELDS=new Set(['title','kind','priority','event_at','end_at','time_zone','all_day','start_date','end_date_exclusive','remind_at']);
export function fieldsFor(value, previous = null) {
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!FIELDS.has(k)))return bad("Invalid agenda fields");
  if(previous?.remind_at&&!Object.hasOwn(value,'remind_at')&&['event_at','end_at','all_day','start_date','end_date_exclusive','time_zone','kind'].some(k=>Object.hasOwn(value,k)&&value[k]!==previous[k]))return bad("When rescheduling, explicitly keep, reset or cancel the reminder time");
  const v={...(previous?Object.fromEntries([...FIELDS].filter(k=>previous[k]!==undefined).map(k=>[k,previous[k]])):{}),...value};
  if(typeof v.title!=='string'||!v.title.trim()||v.title.length>160||/[\u0000-\u001f]/.test(v.title))return bad("Provide a valid agenda title (at most 160 characters)");
  v.title=v.title.trim();v.kind||='event';v.priority||='normal';v.time_zone=zone(v.time_zone);v.all_day??=false;
  if(!['event','deadline'].includes(v.kind)||!['high','normal','low'].includes(v.priority)||typeof v.all_day!=='boolean')return bad("Invalid agenda type or importance");
  v.remind_at??=null;v.end_at??=null;
  if(v.all_day){
    if(!validDate(v.start_date)||!validDate(v.end_date_exclusive||nextDate(v.start_date)))return bad("All-day agenda requires a valid date");
    v.end_date_exclusive||=nextDate(v.start_date);
    if(v.end_date_exclusive<=v.start_date)return bad("End date must be later than start date");
    if(v.event_at||v.end_at)return bad("All-day agenda cannot also specify clock times");
    v.event_at=null;v.end_at=null;
  } else {
    if(!validInstant(v.event_at)||v.end_at!==null&&!validInstant(v.end_at))return bad("Agenda time must include a specific date and an explicit time-zone offset");
    if(v.end_at&&Date.parse(v.end_at)<=Date.parse(v.event_at))return bad("End time must be later than start time");
    if(v.start_date||v.end_date_exclusive)return bad("Timed agenda cannot also specify all-day dates");
    v.start_date=null;v.end_date_exclusive=null;
  }
  const eventTime=v.all_day?midnight(v.kind==='deadline'?v.end_date_exclusive:v.start_date,v.time_zone):Date.parse(v.event_at);
  if(v.remind_at!==null&&(!validInstant(v.remind_at)||Date.parse(v.remind_at)>eventTime))return bad("Reminder time is invalid or later than the item time");
  if(v.kind==='deadline'&&v.end_at)return bad("A deadline item requires only one deadline time");
  return v;
}
export function normalized(raw, fileId) {
  if(!raw || ![1,2,undefined].includes(raw.schema))return bad("Unsupported agenda format");
  const id=agendaId(raw.id);if(fileId!==undefined&&fileId!==id)return bad("Agenda ID does not match the filename");
  const status=raw.status||'open';if(!['open','completed','cancelled','conflicted'].includes(status))return bad("Invalid agenda status");
  const fields={};for(const k of FIELDS)if(raw[k]!==undefined)fields[k]=raw[k];
  return {...fieldsFor(fields),id,status,revision:revisionOf(raw),tags:Array.isArray(raw.tags)?raw.tags.filter(t=>typeof t==='string').slice(0,20):[],visibility:raw.visibility==='sensitive'?'sensitive':'normal',created_at:raw.created_at||raw.createdAt||null,updated_at:raw.updated_at||raw.updatedAt||null};
}
export function timing(item, now=Date.now()) {
  const start=item.all_day?midnight(item.start_date,item.time_zone):Date.parse(item.event_at);
  const end=item.all_day?midnight(item.end_date_exclusive,item.time_zone):item.end_at?Date.parse(item.end_at):start;
  const at=item.kind==='deadline'?end===start?start:end:start;
  const ongoing=item.kind==='event'&&start<=now&&now<end;
  const temporal=ongoing?'ongoing':at>=now?'upcoming':item.kind==='deadline'?'overdue':'elapsed';
  return {start,end,at,temporal,eligible:ongoing||at>=now};
}
