// session context
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { hostname } from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { atomicWriteFile } from './atomic-write.mjs';
import { acquireFileLock } from './file-lock.mjs';
import { assertNoActiveInstall } from './install-maintenance.mjs';

const pathOf = root => join(root, 'state', 'session-context.json');
function load(root) {
  assertNoActiveInstall(root);
  if (!existsSync(pathOf(root))) return { version: 1, current: '', sessions: {} };
  const v = JSON.parse(readFileSync(pathOf(root), 'utf8'));
  if (v?.version !== 1 || !v.sessions || typeof v.sessions !== 'object' || Array.isArray(v.sessions)) throw new Error("Session binding file is corrupt; overwrite refused");
  return v;
}
const keyOf = (hostSessionId, tool) => createHash('sha256').update(JSON.stringify([hostname(), tool, hostSessionId])).digest('hex');
export function readSessionContext(root, { hostSessionId = '', tool = '', sid = '' } = {}) {
  const v = load(root);
  if (hostSessionId) return v.sessions[keyOf(hostSessionId, tool)] || {};
  if (sid) return Object.values(v.sessions).find(e => e.sid === sid) || { sid, tool };
  if (v.current && v.sessions[v.current]) return v.sessions[v.current];
  try { return { sid: readFileSync(join(root, 'state', 'current-sid'), 'utf8').trim(), tool: readFileSync(join(root, 'state', 'current-tool'), 'utf8').trim() }; }
  catch { return {}; }
}

export function resumeSession(root, { hostSessionId = '', sid = '', tool = '', project = '', newSession = false, inputWriter = 'protocol' } = {}) {
  if (!['hook', 'protocol'].includes(inputWriter)) throw new Error("input-writer accepts only hook|protocol");
  if (hostSessionId && newSession) throw new Error("Host ID already defines session identity and cannot be combined with --new");
  if(sid&&newSession)throw new Error("--sid resume conflicts with --new");
  if(hostSessionId&&!tool)throw new Error("Host session binding requires explicit --tool; another host's current session cannot be guessed");
  const release = acquireFileLock(pathOf(root) + '.lock');
  try {
    const v = load(root);
    let key = hostSessionId ? keyOf(hostSessionId, tool) : sid ? Object.keys(v.sessions).find(k=>v.sessions[k].sid===sid) : (!newSession && v.current);
    if(sid&&!key)throw new Error("SID is not registered; current session cannot be guessed. Verify the ID or explicitly create a session.");
    let entry = key && v.sessions[key];
    const created = !entry;
    if (!entry) {
      key ||= randomUUID();
      entry = { sid: randomUUID(), tool, started_project:project, input_writer: inputWriter, started: new Date().toISOString() };
      v.sessions[key] = entry;
    } else {
      if (tool) entry.tool = tool;

      if (inputWriter === 'hook') entry.input_writer = 'hook';
    }
    v.current = key;
    entry.started_project ||= project;
    atomicWriteFile(pathOf(root), JSON.stringify(v, null, 2) + '\n');
    atomicWriteFile(join(root, 'state', 'current-sid'), entry.sid + '\n');
    atomicWriteFile(join(root, 'state', 'current-tool'), (entry.tool || '') + '\n');
    return { ...entry, created };
  } finally { release(); }
}
export function markSessionStartRecorded(root,sid){
  const release=acquireFileLock(pathOf(root)+'.lock');
  try{const v=load(root),entry=Object.values(v.sessions).find(e=>e.sid===sid);if(!entry)throw new Error("SID binding missing");entry.start_recorded=true;atomicWriteFile(pathOf(root),JSON.stringify(v,null,2)+'\n');}finally{release();}
}
