#!/usr/bin/env node
// shell sync
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  checkShellFiles,
  collectRegisteredProjects,
  installShellFiles,
} from './lib/shell-sync.mjs';

const here = dirname(fileURLToPath(import.meta.url));

function argValue(argv, name) {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : '';
}

function manifestPathOf(instanceRoot) {
  void instanceRoot;
  return join(here, 'aipa-shell-hosts.json');
}

function printUsage() {
  console.log(
    [
      "Usage:",
      "  --root <instance-directory>",
      "  --project <absolute-project-path> | --all | --self",
      '  [--hosts workbuddy,claude]',
      "  [--check]   # check drift without writing files",
    ].join('\n'),
  );
}

function reportProject(projectRoot, report) {
  const rel = projectRoot;
  const parts = [];
  if (report.stale.length) parts.push(`stale=${report.stale.length}`);
  if (report.missing.length) parts.push(`missing=${report.missing.length}`);
  if (report.ignoreMissing.length) parts.push(`ignoreMissing=${report.ignoreMissing.join(',')}`);
  if (!parts.length) parts.push('ok');
  console.log(`${rel}: ${parts.join(' | ')}`);
  for (const p of [...report.stale, ...report.missing]) console.log('  ' + p);
}

function main() {
  const argv = process.argv.slice(2);
  let root = argValue(argv, 'root');
  const project = argValue(argv, 'project');
  const all = argv.includes('--all');
  const self = argv.includes('--self');
  const check = argv.includes('--check');
  const rawHosts = argValue(argv, 'hosts');
  const hostIds = rawHosts
    ? rawHosts
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : null;

  if (!root) {
    if (existsSync('AIPA-MANIFEST.yaml')) root = resolve('.');
    else if (existsSync('AIPA-INSTANCE.md')) {
      const m = readFileSync('AIPA-INSTANCE.md', 'utf8').match(/(?:Instance directory:|\u5b9e\u4f8b\u76ee\u5f55\uff1a)\s*`([^`]+)`/);
      if (m) root = resolve(m[1]);
    }
  }
  if (!root || (!project && !all && !self)) {
    printUsage();
    process.exit(2);
  }

  const manifestPath = manifestPathOf(root);
  if (!existsSync(manifestPath)) {
    console.error(`Adapter mapping does not exist: ${manifestPath}`);
    process.exit(1);
  }

  const targets = [...new Set(
    self || all
      ? [...(self ? [root] : []), ...(all ? collectRegisteredProjects(root) : [])]
      : [resolve(project)],
  )];

  if (all && targets.length === 0) {
    console.log("No registered projects (user-space/projects/*/local_path)");
    process.exit(0);
  }

  let exitCode = 0;
  for (const projectRoot of targets) {
    if (!existsSync(projectRoot)) {
      console.error(`Project path does not exist: ${projectRoot}`);
      exitCode = 1;
      continue;
    }
    if (check) {
      const report = checkShellFiles({
        instanceRoot: root,
        projectRoot,
        manifestPath,
        hostIds,
      });
      reportProject(projectRoot, report);
      if (report.stale.length || report.missing.length || report.ignoreMissing.length) exitCode = 1;
    } else {
      const result = installShellFiles({
        instanceRoot: root,
        projectRoot,
        manifestPath,
        hostIds,
      });
      console.log(
        `${projectRoot}: installed=${result.installed.length} gitignoreAdded=${result.addedGitIgnore.length}`,
      );
    }
  }
  process.exit(exitCode);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
