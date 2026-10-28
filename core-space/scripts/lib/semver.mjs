// semver
export const VERSION_TOKEN = String.raw`\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?`;

export function versionOf(text){
  return ((String(text||'').match(new RegExp(String.raw`^\s*version:\s*(${VERSION_TOKEN})`,'m'))||[])[1])||'';
}

export function nextReleaseVersion(current, channel) {
  if(!['stable','beta'].includes(channel))throw new Error("Unknown release channel");
  const [major,minor,patch]=String(current).split('+')[0].split('-')[0].split('.');
  if(![major,minor,patch].every(v=>/^\d+$/.test(v||'')))throw new Error("Invalid version");
  const pre=String(current).split('+')[0].split('-')[1]||'', [id,n]=pre.split('.');
  if(channel==='beta'&&id==='beta')return `${major}.${minor}.${patch}-beta.${(Number(n)||0)+1}`;
  const core=`${Number(major)}.${Number(minor)+1}.${Number(patch)}`;
  return channel==='beta'?core+'-beta.1':core;
}

const coreOf = v => String(v||'').trim().split('+')[0].split('-')[0];
const preOf  = v => { const t=String(v||'').trim().split('+')[0]; const i=t.indexOf('-'); return i<0?'':t.slice(i+1); };

// Numeric core and prerelease identifiers sort numerically; stable follows its prereleases.
export function compareVersions(a,b){
  const A=coreOf(a).split('.').map(Number), B=coreOf(b).split('.').map(Number);
  for(let i=0;i<Math.max(A.length,B.length);i++){
    const x=A[i]||0, y=B[i]||0;
    if(x!==y) return x>y?1:-1;
  }
  const pa=preOf(a), pb=preOf(b);
  if(!pa&&!pb) return 0;
  if(!pa) return 1;
  if(!pb) return -1;
  const X=pa.split('.'), Y=pb.split('.');
  for(let i=0;i<Math.max(X.length,Y.length);i++){
    const x=X[i], y=Y[i];
    if(x===undefined) return -1;
    if(y===undefined) return 1;
    const nx=/^\d+$/.test(x), ny=/^\d+$/.test(y);
    if(nx&&ny){ if(Number(x)!==Number(y)) return Number(x)>Number(y)?1:-1; }
    else if(nx!==ny) return nx?-1:1;
    else if(x!==y) return x>y?1:-1;
  }
  return 0;
}
