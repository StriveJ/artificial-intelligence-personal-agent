// Authoritative source-to-instance framework synchronization mapping. Derived files and renamed template destinations must use the same mapping for installation, drift classification and reverse patch export. Personal source paths are excluded from synchronization.
import { join } from 'node:path';

export const SYNC_MAP = [
  { src: 'core-space', dst: 'core-space', kind: 'dir', refresh: true },
  { src: join('templates', 'personal', 'AGENTS.md'), dst: 'AGENTS.md', kind: 'file', refresh: true },
  { src: join('templates', 'personal', 'CHANGELOG.md'), dst: 'CHANGELOG.md', kind: 'file', refresh: false },
  { src: join('.claude', 'commands', 'aipa.md'), dst: join('.claude', 'commands', 'aipa.md'), kind: 'file', refresh: true },
  { src: join('.claude', 'settings.json'), dst: join('.claude', 'settings.json'), kind: 'file', refresh: true },
  { src: join('.claude', 'hooks', 'session-hook.mjs'), dst: join('.claude', 'hooks', 'session-hook.mjs'), kind: 'file', refresh: true },
  { src: join('.codebuddy', 'commands', 'aipa.md'), dst: join('.codebuddy', 'commands', 'aipa.md'), kind: 'file', refresh: true },
];

export const DERIVED = [
  { src: join('.claude', 'commands', 'aipa.md'), dst: '.ide_activation/aipa.md' },
];

const norm = (p) => String(p ?? '').replace(/\\/g, '/');
const relJoin = (a, b) => norm(a + '/' + b);

const pick = (kind, from = SYNC_MAP) => from
  .filter((m) => m.kind === kind)
  .map((m) => ({ src: norm(m.src), dst: norm(m.dst) }));

export const SYNC_FILE_MAP = pick('file');
export const SYNC_DIR_MAP = pick('dir');

export const SYNC_REFRESH_MAP = SYNC_MAP.filter((m) => m.refresh);
export const SYNC_DSTS = SYNC_REFRESH_MAP.map((m) => norm(m.dst));

export const SYNC_DIR_DSTS = pick('dir', SYNC_REFRESH_MAP).map((m) => m.dst);
export const DERIVED_DSTS = DERIVED.map((m) => norm(m.dst));
export { relJoin as joinRel };
