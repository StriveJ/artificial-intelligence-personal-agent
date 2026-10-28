// search output
const bytes = text => Buffer.byteLength(text,'utf8');
export const SEARCH_OUTPUT_SCHEMA = 1;
function sliceBytes(text, limit) {
  let out='',used=0;for(const character of text){const n=bytes(character);if(used+n>limit)break;out+=character;used+=n;}return out;
}
export function renderSearch(hits,{json=false,list=false,q='',expand=[],chars=2000,budget=8000}={}) {
  const limit=budget>0?budget:Infinity,shown=[];
  const reserve=Number.isFinite(limit)?Math.min(limit,bytes(`(budget limit: expanded ${hits.length}/${hits.length} entries; remaining entries omitted)
`)):0;
  let text='';
  if(json){
    const payload={status:'ok',q,expand,count:0,hits:[]};
    for(const r of hits){
      const row={id:r.id,kind:r.kind,title:r.title,location:r.location,score:r.score,via:r.via,state:r.status||'',source:r.source,provenance:r.provenance?.map(({quote,...ref})=>ref),confirmation:r.confirmation,confirmed:r.confirmed,projects:r.projects,type:r.type,body_hash:r.body_hash,scope:r.scope,valid_from:r.valid_from,valid_until:r.valid_until};
      row.tags=r.tags||[];row.sensitive=r.sensitive===true;
      payload.hits.push(row);payload.count++;
      if(bytes(JSON.stringify(payload)+'\n')>limit){payload.hits.pop();payload.count--;break;}
      shown.push(r);
    }
    text=JSON.stringify(payload)+'\n';
    if(bytes(text)>limit)text=JSON.stringify({status:'budget-exceeded',count:0,hits:[]})+'\n';
    if(bytes(text)>limit)throw Error("Budget cannot accommodate valid JSON; increase --budget");
  }else{
    for(const r of hits){
      let block;
      if(list)block=`${r.kind} | ${r.title} | ${r.status||'-'} | ${r.location}\n`;
      else{
        const head=`---\n${shown.length+1}. [${r.kind}] ${r.title}  (score=${r.score}${r.via?', via='+r.via:''}, ${r.location})\n`;
        const room=limit-reserve-bytes(text)-bytes(head)-1;
        if(room<120)break;
        const full=String(r.body||'').trim(),body=chars>0?Array.from(full).slice(0,chars).join(''):full;
        const suffix=body!==full?" ...[truncated]":'';
        const available=room-bytes(suffix);
        block=head+(bytes(body)>available?sliceBytes(body,Math.max(0,room-bytes(" ...[truncated to budget]")))+" ...[truncated to budget]":body+suffix)+'\n';
      }
      if(bytes(text+block)>limit-(list?reserve:0))break;
      text+=block;shown.push(r);
    }
    if(shown.length<hits.length){const hint=`(budget limit: expanded ${shown.length}/${hits.length} entries; remaining entries omitted)
`;if(bytes(text+hint)<=limit)text+=hint;else if(bytes(text+"Insufficient budget\n")<=limit)text+="Insufficient budget\n";}
  }
  return {text,shown,bytes:bytes(text)};
}
