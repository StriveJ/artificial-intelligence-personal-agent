// shell sync
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';

export const PROJECT_IGNORE_EXTRAS = ['AIPA-INSTANCE.md', '.claude/session-history/'];
export const AGENTS_POINTER_BLOCK =
  "<!-- AIPA integration -->\n- If AIPA-INSTANCE.md exists, read it first to connect to AIPA (device-local configuration, ignored by Git).";

export function ensureAgentsPointer(projectRoot) {
  const agentsPath = join(projectRoot, 'AGENTS.md');
  let agents = existsSync(agentsPath) ? readFileSync(agentsPath, 'utf8') : '';
  if (agents.includes('AIPA-INSTANCE.md')) return false;
  const sep = agents ? (agents.endsWith('\n') ? '\n' : '\n\n') : '';
  agents += sep + AGENTS_POINTER_BLOCK + '\n';
  writeFileSync(agentsPath, agents, 'utf8');
  return true;
}

export function loadShellManifest(manifestPath) {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    throw new Error(`Cannot read adapter mapping ${manifestPath}: ${err.message}`);
  }
  if (!manifest || typeof manifest.source !== 'string' || !manifest.source.trim()) {
    throw new Error(`Adapter mapping lacks source: ${manifestPath}`);
  }
  if (!Array.isArray(manifest.hosts) || manifest.hosts.length === 0) {
    throw new Error(`Adapter mapping lacks hosts: ${manifestPath}`);
  }
  for (const host of manifest.hosts) {
    if (!host || !host.id || typeof host.target !== 'string' || !host.target.trim()) {
      throw new Error(`Adapter mapping host requires id and target: ${JSON.stringify(host)}`);
    }
  }
  return manifest;
}

export function resolveShellTargets({ instanceRoot, projectRoot, manifest, hostIds }) {
  const sourcePath = resolve(instanceRoot, manifest.source);
  const targets = [];
  for (const host of manifest.hosts) {
    if (hostIds && hostIds.length > 0 && !hostIds.includes(host.id)) continue;
    targets.push({
      id: host.id,
      sourcePath,
      targetPath: resolve(projectRoot, host.target),
    });
  }
  return targets;
}

export function collectRegisteredProjects(instanceRoot) {
  const projectsDir = join(instanceRoot, 'user-space', 'projects');
  if (!existsSync(projectsDir)) return [];
  return readdirSync(projectsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(projectsDir, entry.name, 'local_path'))
    .filter((file) => existsSync(file))
    .map((file) => readFileSync(file, 'utf8').trim())
    .filter(Boolean);
}

function normalizeIgnorePath(p) {
  return p.replace(/\\/g, '/');
}

function ensureProjectGitignore(projectRoot, manifest) {
  const entries = [
    ...PROJECT_IGNORE_EXTRAS,
    ...manifest.hosts.map((host) => normalizeIgnorePath(host.target)),
  ];
  const giPath = join(projectRoot, '.gitignore');
  let gi = existsSync(giPath) ? readFileSync(giPath, 'utf8') : '';
  const added = [];
  for (const raw of entries) {
    const entry = normalizeIgnorePath(raw);
    if (!gi.split(/\r?\n/).includes(entry)) {
      added.push(entry);
      gi += (gi && !gi.endsWith('\n') ? '\n' : '') + entry + '\n';
    }
  }
  if (added.length > 0) writeFileSync(giPath, gi, 'utf8');
  return added;
}

export function installShellFiles({ instanceRoot, projectRoot, manifestPath, hostIds }) {
  const manifest = loadShellManifest(manifestPath);
  const sourcePath = resolve(instanceRoot, manifest.source);
  if (!existsSync(sourcePath)) throw new Error(`Adapter master does not exist: ${sourcePath}`);
  const source = readFileSync(sourcePath, 'utf8');
  const installed = [];
  for (const item of resolveShellTargets({ instanceRoot, projectRoot, manifest, hostIds })) {
    const current = existsSync(item.targetPath) ? readFileSync(item.targetPath, 'utf8') : null;
    if (current !== source) {
      installed.push(item.targetPath);
      mkdirSync(dirname(item.targetPath), { recursive: true });
      writeFileSync(item.targetPath, source, 'utf8');
    }
  }
  const addedGitIgnore =
    projectRoot !== instanceRoot ? ensureProjectGitignore(projectRoot, manifest) : [];
  return { installed, addedGitIgnore };
}

export function checkShellFiles({ instanceRoot, projectRoot, manifestPath, hostIds }) {
  const manifest = loadShellManifest(manifestPath);
  const sourcePath = resolve(instanceRoot, manifest.source);
  if (!existsSync(sourcePath)) throw new Error(`Adapter master does not exist: ${sourcePath}`);
  const source = readFileSync(sourcePath, 'utf8');
  const stale = [];
  const missing = [];
  const ignoreMissing = [];
  for (const item of resolveShellTargets({ instanceRoot, projectRoot, manifest, hostIds })) {
    if (!existsSync(item.targetPath)) missing.push(item.targetPath);
    else if (readFileSync(item.targetPath, 'utf8') !== source) stale.push(item.targetPath);
  }
  if (projectRoot !== instanceRoot) {
    const giPath = join(projectRoot, '.gitignore');
    const gi = existsSync(giPath) ? readFileSync(giPath, 'utf8') : '';
    const required = [...PROJECT_IGNORE_EXTRAS, ...manifest.hosts.map((h) => normalizeIgnorePath(h.target))];
    for (const entry of required) {
      if (!gi.split(/\r?\n/).includes(entry)) ignoreMissing.push(entry);
    }
  }
  return { stale, missing, ignoreMissing };
}
