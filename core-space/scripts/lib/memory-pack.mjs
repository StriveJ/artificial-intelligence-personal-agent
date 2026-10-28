// memory pack
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { readMemoryIndex } from './memory-index-store.mjs';
import { loadPrivacyPolicy, privacyDecision } from './privacy-policy.mjs';
import { assertWithin, safeRelativePath } from './safe-path.mjs';
import { discoverSkills } from './skill-discovery.mjs';
import { readMemoryMeta,projectMemoryMeta } from './memory-meta.mjs';

export const PACK_FORMAT = 'aipa-profile-pack';
export const PACK_VERSION = 2;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const object = (v, label) => { if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error(`${label} has invalid format`); return v; };
function memoryPath(value) {
  const rel = safeRelativePath(value);
  if (!/^user-space\/memory\/[^/]+\.md$/.test(rel)) throw new Error("Memory packages can restore only Markdown content in the memory root");
  return rel;
}
function skillFiles(root) {
  const files = Object.create(null);
  function walk(dir, prefix = '') {
    for (const item of readdirSync(dir, { withFileTypes: true })) {
      const path = assertWithin(root, join(dir, item.name)), rel = safeRelativePath(prefix + item.name);
      if (item.isDirectory()) walk(path, rel + '/');
      else {
        if (lstatSync(path).isSymbolicLink() || !item.isFile()) throw new Error("Skill packages do not support links or special files");
        const bytes = readFileSync(path);
        files[rel] = { encoding: 'base64', data: bytes.toString('base64'), sha256: digest(bytes) };
      }
    }
  }
  walk(root); return files;
}

export function exportMemoryPack(root) {
  const policy = loadPrivacyPolicy(root), index = readMemoryIndex(root,{strict:true});
  const metadata=readMemoryMeta(root);index.entries=index.entries.map(e=>projectMemoryMeta(e,metadata));
  const pack = { format: PACK_FORMAT, version: PACK_VERSION, profile: null, memories: [], index: { version: '0.1', entries: [] }, skills: [], excluded: [], sharing: { requiresConfirmation: policy.mode !== 'allow' } };
  const exclude = kind => pack.excluded.push({ kind, reason: 'privacy-policy' });
  const profile = assertWithin(root, join(root, 'user-space', 'profile.yaml'));
  if (existsSync(profile)) {
    const text = readFileSync(profile, 'utf8');
    if (privacyDecision(policy, text) === 'block') exclude('profile'); else pack.profile = text;
  }
  const dir = assertWithin(root, join(root, 'user-space', 'memory'));
  if (existsSync(dir)) for (const name of readdirSync(dir).filter(n => n.endsWith('.md')).sort()) {
    const path = assertWithin(dir, join(dir, name));
    if (!lstatSync(path).isFile()) throw new Error("Memory packages do not support links or special files");
    const rel = memoryPath(`user-space/memory/${name}`), content = readFileSync(path, 'utf8');
    const entries = index.entries.filter(e => e.file === rel);
    if (privacyDecision(policy, { path: rel, content, entries }, entries.flatMap(e => e.tags || [])) === 'block' || entries.some(e => e.sensitive)) { exclude('memory'); continue; }
    pack.memories.push({ path: rel, content, sha256: digest(Buffer.from(content)), source: `file:${rel}` });
    pack.index.entries.push(...entries);
  }
  const skillsRoot = assertWithin(root, join(root, 'user-space', 'skills'));
  for (const skill of discoverSkills(skillsRoot)) {
    const files = skillFiles(skill.dir);
    const decoded = Object.fromEntries(Object.entries(files).map(([name, f]) => [name, Buffer.from(f.data, 'base64').toString('utf8')]));
    if (privacyDecision(policy, { id: skill.id, category: skill.category, files: decoded }) === 'block' || Object.values(decoded).some(t => privacyDecision(policy, t) === 'block')) { exclude('skill'); continue; }
    pack.skills.push({ id: skill.id, category: skill.category, files });
  }
  return pack;
}

export function normalizeMemoryPack(raw) {
  object(raw, "Import package");
  if (raw.version !== undefined && (raw.version !== PACK_VERSION || raw.format !== PACK_FORMAT)) throw new Error("Unsupported import package version");
  if (raw.profile !== undefined && raw.profile !== null && typeof raw.profile !== 'string') throw new Error("Invalid profile format");
  const legacy = raw.version === undefined, memories = [], paths = new Set(), entries = raw.index?.entries ?? [];
  if (!Array.isArray(entries)) throw new Error("Invalid index entry format");
  entries.forEach(e => {
    object(e, "Index entry");
    if ((e.id !== undefined && typeof e.id !== 'string') || (e.tags !== undefined && (!Array.isArray(e.tags) || e.tags.some(t => typeof t !== 'string')))) throw new Error("Invalid index metadata format");
  });
  if (legacy) {
    const groups = new Map();
    for (const e of entries) {
      if (typeof e.body !== 'string' || !e.body.trim()) throw new Error("Legacy package lacks memory content; the index alone cannot restore it. Export again from the original instance.");
      const path = memoryPath(e.file || 'user-space/memory/imported.md');
      if (!groups.has(path)) groups.set(path, []);
      groups.get(path).push(`## ${String(e.title || "Import record").replace(/[\r\n]/g, ' ')}\n\n${e.body}\n`);
    }
    for (const [path, parts] of groups) memories.push({ path, content: parts.join('\n') });
  } else {
    if (!Array.isArray(raw.memories)) throw new Error("Invalid content inventory format");
    for (const m of raw.memories) {
      object(m, "Memory content"); const path = memoryPath(m.path);
      if (typeof m.content !== 'string') throw new Error("Memory content must be text");
      if (m.sha256 && m.sha256 !== digest(Buffer.from(m.content))) throw new Error("Memory content verification failed");
      memories.push({ ...m, path });
    }
  }
  for (const m of memories) { if (paths.has(m.path)) throw new Error("Import contains duplicate content paths"); paths.add(m.path); }
  for (const e of entries) if (e.file && !paths.has(memoryPath(e.file))) throw new Error("Index entry has no corresponding memory content");
  if (!Array.isArray(raw.skills ?? [])) throw new Error("Invalid skill inventory format");
  const skills = (raw.skills ?? []).map(skill => {
    object(skill, "Skill"); const id = safeRelativePath(skill.id);
    if (id.includes('/')) throw new Error("Skill id cannot contain directory components");
    const category = skill.category ? safeRelativePath(skill.category) : '';
    const base = `user-space/skills/${category ? category + '/' : ''}${id}`, decoded = [];
    for (const [name, value] of Object.entries(object(skill.files, "Skill file"))) {
      const path = base + '/' + safeRelativePath(name);
      if (paths.has(path)) throw new Error("Import contains duplicate file paths"); paths.add(path);
      let bytes;
      if (typeof value === 'string') bytes = Buffer.from(value);
      else {
        object(value, "Skill file content");
        if (value.encoding !== 'base64' || typeof value.data !== 'string') throw new Error("Invalid skill file encoding");
        bytes = Buffer.from(value.data, 'base64');
        if (bytes.toString('base64') !== value.data || (value.sha256 && value.sha256 !== digest(bytes))) throw new Error("Skill file verification failed");
      }
      decoded.push({ path, bytes });
    }
    if (!Object.hasOwn(skill.files, 'SKILL.md')) throw new Error("Skill lacks SKILL.md");
    return { ...skill, decoded };
  });
  return { profile: raw.profile ?? null, memories, entries, skills, legacy };
}

export function importPlan(root, pack, { replaceProfile = false } = {}) {
  const policy = loadPrivacyPolicy(root), planned = [];
  function add(rel, bytes, replace = false) {
    const path = assertWithin(root, join(root, safeRelativePath(rel)), { rejectLinks: true }), old = existsSync(path) ? readFileSync(path) : null;
    const same = old?.equals(bytes) || false;
    planned.push({ rel, path, bytes, old, same, conflict: !!old && !same && !replace });
  }
  if (pack.profile !== null) {
    if (privacyDecision(policy, pack.profile) === 'block') throw new Error("Imported profile blocked by destination privacy policy");
    add('user-space/profile.yaml', Buffer.from(pack.profile), replaceProfile);
  }
  for (const m of pack.memories) {
    const entries = pack.entries.filter(e => e.file === m.path);
    if (privacyDecision(policy, { ...m, entries }, entries.flatMap(e => e.tags || [])) === 'block' || entries.some(e => e.sensitive)) throw new Error("Imported memory blocked by destination privacy policy");
    add(m.path, Buffer.from(m.content));
  }
  for (const skill of pack.skills) {
    if (privacyDecision(policy, skill.decoded.map(f => ({ path: f.path, content: f.bytes.toString('utf8') }))) === 'block' || skill.decoded.some(f => privacyDecision(policy, f.bytes.toString('utf8')) === 'block')) throw new Error("Imported skill blocked by destination privacy policy");
    for (const f of skill.decoded) add(f.path, f.bytes);
  }
  return planned;
}
