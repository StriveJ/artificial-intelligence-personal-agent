#!/usr/bin/env node
// install project
import { writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureAgentsPointer, installShellFiles } from './lib/shell-sync.mjs';

const here = dirname(fileURLToPath(import.meta.url));
let instanceRoot = resolve(here, '..', '..');
const argv = process.argv.slice(2);
const ri = argv.indexOf('--root');
if (ri !== -1 && argv[ri + 1]) instanceRoot = resolve(argv[ri + 1]);

function install(projectPath) {
  if (!projectPath) {
    console.error("Missing project path. Usage: node aipa-install-project.mjs <absolute-project-path>");
    process.exit(1);
  }
  const projectRoot = resolve(projectPath);

  const inst = instanceRoot.replace(/\\/g, '/');
  const pointer = `<!-- AIPA integration (device-local configuration; ignored by Git, do not commit) -->
# AIPA
- Instance directory: \`${inst}\`
- Before starting work, read the instance AGENTS.md, core-space/policy.md (boundaries), user-space/profile.yaml (profile), user-space/privacy.yaml (privacy) and user-space/memory/context.md (active context).
- The instance is authoritative for memory, skills and profile. Write reusable experience and skills back to user-space/memory/ and user-space/skills/ in the instance.
`;
  writeFileSync(join(projectRoot, 'AIPA-INSTANCE.md'), pointer, 'utf8');

  ensureAgentsPointer(projectRoot);

  const result = installShellFiles({
    instanceRoot,
    projectRoot,
    manifestPath: join(dirname(fileURLToPath(import.meta.url)), 'aipa-shell-hosts.json'),
  });

  console.log("AIPA project adapter installed in " + projectRoot + ': ');
  console.log("  Pointer " + join(projectRoot, 'AIPA-INSTANCE.md') + '  →  ' + inst);
  console.log("  Master " + join(instanceRoot, '.ide_activation', 'aipa.md'));
  console.log("  Distribution installed=" + result.installed.length + ' gitignoreAdded=' + result.addedGitIgnore.length);
  console.log("  Note: the committable AGENTS.md pointer is present; other AIPA-generated files have been added to .gitignore.");
}

function list() {
  console.log("Instance: " + instanceRoot);
  console.log("Master: " + join(instanceRoot, '.ide_activation', 'aipa.md'));
  console.log("(Connected projects point to this instance through their AIPA-INSTANCE.md; no recursive scan is performed.)");
}

const first = argv.find(a => !a.startsWith('--'));
if (first === '--list' || argv.includes('--list')) list();
else install(first);
