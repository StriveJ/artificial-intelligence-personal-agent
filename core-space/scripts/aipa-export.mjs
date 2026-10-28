// export
import { exportMemoryPack } from './lib/memory-pack.mjs';
import { atomicWriteFile } from './lib/atomic-write.mjs';
function arg(name) { const i = process.argv.indexOf('--' + name); return i >= 0 ? process.argv[i + 1] : ''; }
try {
  const pack = exportMemoryPack(arg('root') || '.');
  const out = arg('out') || 'profile-pack.json';
  atomicWriteFile(out, JSON.stringify(pack, null, 2) + '\n');
  console.log(out);
} catch (error) { console.error("Export failed: " + error.message); process.exitCode = 1; }
