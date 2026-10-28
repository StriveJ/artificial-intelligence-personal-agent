// release package
import { deflateRawSync,inflateRawSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { readFileSync,writeFileSync,mkdirSync,existsSync,chmodSync } from 'node:fs';
import { join,dirname } from 'node:path';
import { safeRelativePath,assertWithin } from './safe-path.mjs';
import { verifyChecksums,verifyOriginShape,CHECKSUM_FILE } from './origin-checksums.mjs';
import { readUpdateContract } from './update-contract.mjs';
import { versionOf } from './semver.mjs';
export const PACKAGE_LIMITS={files:10000,bytes:256*1024*1024,compressed:256*1024*1024};
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
function crc32(bytes){let c=0xffffffff;for(const byte of bytes){c^=byte;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
export function portableArtifactPath(name){const path=safeRelativePath(name);if(path!==name||path.split('/').some(p=>p.toLowerCase()==='.git'||/[. ]$/.test(p)||/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p)))throw new Error("Package path cannot be safely delivered across platforms");return path;}
const validName=portableArtifactPath;
export function encodeZip(entries){
 const parts=[],central=[];let offset=0,total=0;const names=new Set();
 if(entries.length>PACKAGE_LIMITS.files)throw new Error("Package file count exceeds limit");
 for(const {path,data,mode=0o644} of entries){
  validName(path);const key=path.toLowerCase();if(names.has(key))throw new Error("Duplicate or case-conflicting package path");names.add(key);
  const bytes=Buffer.from(data);total+=bytes.length;if(total>PACKAGE_LIMITS.bytes)throw new Error("Expanded package size exceeds limit");
  const name=Buffer.from(path),packed=deflateRawSync(bytes),crc=crc32(bytes),header=Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);header.writeUInt16LE(0x800,6);header.writeUInt16LE(8,8);header.writeUInt32LE(crc,14);header.writeUInt32LE(packed.length,18);header.writeUInt32LE(bytes.length,22);header.writeUInt16LE(name.length,26);
  const record=Buffer.alloc(46);record.writeUInt32LE(0x02014b50);record.writeUInt16LE(0x314,4);record.writeUInt16LE(20,6);record.writeUInt16LE(0x800,8);record.writeUInt16LE(8,10);record.writeUInt32LE(crc,16);record.writeUInt32LE(packed.length,20);record.writeUInt32LE(bytes.length,24);record.writeUInt16LE(name.length,28);record.writeUInt32LE(((0o100000|mode)*65536)>>>0,38);record.writeUInt32LE(offset,42);
  parts.push(header,name,packed);central.push(record,name);offset+=header.length+name.length+packed.length;
 }
 const cd=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(cd.length,12);end.writeUInt32LE(offset,16);
 const result=Buffer.concat([...parts,cd,end]);if(result.length>PACKAGE_LIMITS.compressed)throw new Error("Package size exceeds limit");return result;
}
export function decodeZip(bytes){
 if(bytes.length<22||bytes.length>PACKAGE_LIMITS.compressed)throw new Error("Invalid package length");
 const end=bytes.length-22;if(bytes.readUInt32LE(end)!==0x06054b50||bytes.readUInt16LE(end+20)||bytes.readUInt16LE(end+4)||bytes.readUInt16LE(end+6))throw new Error("ZIP comments, multiple volumes and trailing data are unsupported");
 const count=bytes.readUInt16LE(end+10),size=bytes.readUInt32LE(end+12),start=bytes.readUInt32LE(end+16);
 if(count!==bytes.readUInt16LE(end+8)||count>PACKAGE_LIMITS.files||start+size!==end)throw new Error("Invalid ZIP directory");
 const entries=[],names=new Set();let pos=start,total=0,localEnd=0;
 for(let i=0;i<count;i++){
  if(pos+46>end||bytes.readUInt32LE(pos)!==0x02014b50)throw new Error("Truncated ZIP directory");
  const flags=bytes.readUInt16LE(pos+8),method=bytes.readUInt16LE(pos+10),crc=bytes.readUInt32LE(pos+16),packed=bytes.readUInt32LE(pos+20),plain=bytes.readUInt32LE(pos+24),n=bytes.readUInt16LE(pos+28),extra=bytes.readUInt16LE(pos+30),comment=bytes.readUInt16LE(pos+32),at=bytes.readUInt32LE(pos+42),attrs=bytes.readUInt32LE(pos+38)>>>16;
  if(flags!==0x800||![0,8].includes(method)||extra||comment||bytes.readUInt16LE(pos+34)||pos+46+n>end||(attrs&0o170000)!==0o100000)throw new Error("Unsupported ZIP flags, special files or extensions");
  const nameBytes=bytes.subarray(pos+46,pos+46+n),path=validName(new TextDecoder('utf-8',{fatal:true}).decode(nameBytes)),key=path.toLowerCase();
  if(names.has(key))throw new Error("Duplicate package path");names.add(key);total+=plain;if(total>PACKAGE_LIMITS.bytes)throw new Error("Expanded package size exceeds limit");
  if(at!==localEnd||at+30>start||bytes.readUInt32LE(at)!==0x04034b50||bytes.readUInt16LE(at+6)!==flags||bytes.readUInt16LE(at+8)!==method||bytes.readUInt32LE(at+14)!==crc||bytes.readUInt32LE(at+18)!==packed||bytes.readUInt32LE(at+22)!==plain||bytes.readUInt16LE(at+26)!==n||bytes.readUInt16LE(at+28))throw new Error("ZIP local header differs from directory");
  if(!bytes.subarray(at+30,at+30+n).equals(nameBytes))throw new Error("ZIP dual-path mismatch");
  const begin=at+30+n,finish=begin+packed;if(finish>start)throw new Error("ZIP content exceeds bounds");
  const data=method===0?bytes.subarray(begin,finish):inflateRawSync(bytes.subarray(begin,finish),{maxOutputLength:Math.max(1,plain)});
  if(data.length!==plain||crc32(data)!==crc)throw new Error("ZIP length or CRC mismatch");
  entries.push({path,data,mode:(attrs&0o111)?0o755:0o644});localEnd=finish;pos+=46+n;
 }
 if(pos!==end||localEnd!==start)throw new Error("Undeclared ZIP content");return entries;
}
export function packageArtifact(root){
 verifyOriginShape(root,{strict:true});
 const files=[...verifyChecksums(root).keys(),CHECKSUM_FILE],contract=readUpdateContract(root);if(!contract)throw new Error("Package requires an update compatibility declaration");
 const version=versionOf(readFileSync(join(root,'ORIGIN-MANIFEST.yaml'),'utf8'));
 return encodeZip([{path:'package.json',data:JSON.stringify({schema:1,version})},...files.sort().map(path=>({path:'artifact/'+path,data:readFileSync(join(root,path)),mode:contract.executables.includes(path)?0o755:0o644}))]);
}
export function unpackArtifact(bytes,dest,{expectedHash}={}){
 if(expectedHash&&sha256(bytes)!==expectedHash)throw new Error("Package digest mismatch");
 const entries=decodeZip(bytes),meta=entries.find(e=>e.path==='package.json');
 if(!meta||JSON.parse(meta.data).schema!==1||entries.some(e=>e.path!=='package.json'&&!e.path.startsWith('artifact/')))throw new Error("Not an AIPA version package");
 if(existsSync(dest))throw new Error("Extraction destination must not exist; existing directories will not be overwritten");

 mkdirSync(dest,{recursive:true});
 for(const e of entries.filter(e=>e.path.startsWith('artifact/'))){const p=assertWithin(dest,join(dest,e.path.slice(9)),{rejectLinks:true});mkdirSync(dirname(p),{recursive:true});writeFileSync(p,e.data);if(process.platform!=='win32')chmodSync(p,e.mode);}
 verifyChecksums(dest);const contract=readUpdateContract(dest);if(!contract)throw new Error("Package lacks a compatibility declaration");
 if(versionOf(readFileSync(join(dest,'ORIGIN-MANIFEST.yaml'),'utf8'))!==JSON.parse(meta.data).version)throw new Error("Package version differs from base");
 for(const e of entries.filter(e=>e.path.startsWith('artifact/')))if((e.mode===0o755)!==contract.executables.includes(e.path.slice(9)))throw new Error("Package executable modes differ from compatibility declaration");
 return dest;
}
