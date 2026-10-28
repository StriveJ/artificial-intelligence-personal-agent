// file lock
import { closeSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

export function acquireFileLock(path) {
  mkdirSync(dirname(path), { recursive: true });
  const owner = { pid: process.pid, owner: randomUUID(), created: new Date().toISOString() };
  let fd;
  try { fd = openSync(path, 'wx', 0o600); }
  catch (e) {
    if (e.code === 'EEXIST') { const error = new Error("Queue/task lock is busy. If the original process has exited, review the lock file before cleaning and retrying."); error.code = 'ELOCKED'; throw error; }
    throw new Error("Cannot create queue/task lock: " + e.message, { cause: e });
  }
  try { writeFileSync(fd, JSON.stringify(owner)); } finally { closeSync(fd); }
  return () => {
    let current;
    try { current = JSON.parse(readFileSync(path, 'utf8')); }
    catch (e) { if (e.code === 'ENOENT') return; throw new Error("Cannot read queue/task lock: " + e.message, { cause: e }); }
    if (current.owner !== owner.owner) throw new Error("Lock owner changed; refusing to release another process's lock");
    unlinkSync(path);
  };
}
