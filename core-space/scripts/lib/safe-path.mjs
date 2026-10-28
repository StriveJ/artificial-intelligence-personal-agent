// safe path
import { lstatSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

export function safeRelativePath(value) {
  if (typeof value !== 'string' || !value || /[\x00-\x1f\x7f:]/.test(value) || /^[\\/]/.test(value)) {
    throw new Error("Invalid relative path");
  }
  const parts = value.replace(/\\/g, '/').split('/');
  if (parts.some(p => !p || p === '.' || p === '..')) throw new Error("Invalid relative path");
  return parts.join('/');
}

function realLocation(value) {
  let current = resolve(value);
  const tail = [];
  while (true) {
    try {
      lstatSync(current);
      return join(realpathSync(current), ...tail.reverse());
    } catch (error) {
      if (error.code !== 'ENOENT' || (() => { try { return lstatSync(current).isSymbolicLink(); } catch { return false; } })()) throw error;
      const parent = dirname(current);
      if (parent === current) throw error;
      tail.push(relative(parent, current));
      current = parent;
    }
  }
}

function inside(base, target, allowRoot) {
  const rel = relative(base, target);
  return rel === '' ? allowRoot : !isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + sep);
}

export function assertWithin(base, target, { allowRoot = false, rejectLinks = false } = {}) {
  const root = resolve(base), path = resolve(target);
  if (!inside(root, path, allowRoot) || !inside(realLocation(root), realLocation(path), allowRoot)) {
    throw new Error("Path escape: destination must remain within the specified directory");
  }
  if (rejectLinks) {
    let current = path;
    while (relative(root, current) !== '') {
      try { if (lstatSync(current).isSymbolicLink()) throw new Error("Write path contains a link; refusing to modify another area"); }
      catch (e) { if (e.code !== 'ENOENT') throw e; }
      current = dirname(current);
    }
  }
  return path;
}

export function resolveWithin(base, rel) {
  return assertWithin(base, resolve(base, safeRelativePath(rel)));
}

export function assertDisjointPaths(left, right) {
  for (const [a, b] of [[resolve(left), resolve(right)], [realLocation(left), realLocation(right)]]) {
    if (inside(a, b, true) || inside(b, a, true)) throw new Error("Source and destination paths overlap; cleanup/copy refused");
  }
}
