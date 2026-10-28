// skill discovery
import { existsSync, readdirSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { assertWithin } from './safe-path.mjs';

export function discoverSkills(root) {
  if (!existsSync(root)) return [];
  const result = [];
  function walk(dir) {
    assertWithin(root, dir, { allowRoot: true });
    if (existsSync(join(dir, 'SKILL.md'))) {
      const rel = relative(root, dir).replace(/\\/g, '/');
      if (rel) result.push({ id: basename(dir), category: dirname(rel) === '.' ? '' : dirname(rel).replace(/\\/g, '/'), dir, relativeDir: rel });
      return;
    }
    for (const item of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (item.name.startsWith('_') || item.name.startsWith('.') || item.name === 'node_modules') continue;
      if (item.isDirectory()) walk(join(dir, item.name));
    }
  }
  walk(root);
  return result;
}
