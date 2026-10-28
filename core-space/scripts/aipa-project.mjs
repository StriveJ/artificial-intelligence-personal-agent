// project
import { resolveProject } from './lib/project.mjs';
import { pickCmd } from './lib/argv.mjs';

function arg(n) { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : ''; }

const root = arg('root') || '.';
const cmd = pickCmd(process.argv.slice(2), ['resolve']);

if (cmd !== 'resolve') {
  console.error("Usage: node aipa-project.mjs resolve --cwd <session-working-directory> [--root <instance>]");
  process.exit(1);
}

const cwd = arg('cwd') || process.cwd();
console.log(JSON.stringify(resolveProject(cwd, root)));
