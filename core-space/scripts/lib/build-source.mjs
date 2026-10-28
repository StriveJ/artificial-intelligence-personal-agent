// build source
export function readBuildSource(text) {
  const block=String(text).match(/^  build_source:[ \t]*\r?\n((?:    [^\r\n]*\r?\n?)*)/m);
  if(!block) { if(/^  build_source:/m.test(text))throw new Error("Invalid build_source structure");return null; }
  const data={};
  for(const line of block[1].split(/\r?\n/).filter(Boolean)) {
    const m=line.match(/^    (schema|commit|branch|dirty):[ \t]*([^\r\n]+?)[ \t]*$/);
    if(!m || Object.hasOwn(data,m[1]))throw new Error("Invalid or duplicate build_source field");data[m[1]]=m[2];
  }
  if(data.branch?.startsWith('"')){try{data.branch=JSON.parse(data.branch);}catch{throw new Error("Invalid build_source branch string");}}
  if(data.schema!=='1'|| !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(data.commit||'') || typeof data.branch!=='string' || !data.branch || /[\x00-\x20\x7f]/.test(data.branch) || !['true','false'].includes(data.dirty))throw new Error("build_source requires valid schema/commit/branch/dirty fields");
  return {schema:1,commit:data.commit,branch:data.branch,dirty:data.dirty==='true'};
}
export function withBuildSource(text, source) {
  const input=String(text), eol=input.includes('\r\n')?'\r\n':'\n';
  const clean=input.replace(/^  build_source:[^\r\n]*\r?\n(?:    [^\r\n]*\r?\n?)*/m,'');
  if(!source)return clean;
  const block=['  build_source:','    schema: 1','    commit: '+source.commit,'    branch: '+JSON.stringify(source.branch),'    dirty: '+Boolean(source.dirty)].join(eol);
  const result=clean.replace(/^  version:[^\r\n]*/m,line=>line+eol+block);
  if(!readBuildSource(result))throw new Error("Cannot write build_source: indented version is missing");
  return result;
}
