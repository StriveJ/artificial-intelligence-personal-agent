---
name: project-add
description: Register project metadata/local_path in an instance and install ignored project links plus IDE activation adapters from the common master
scope: all
version: 1.0.0
---

## Trigger phrases

- connect project / connect this project to my agent / register project / project add

## Boundaries

- Refreshing an already connected project uses aipa-shell-sync.
- Do not register pathless design folders as working projects.
- Project-generated files are Git-ignored except a machine-independent AGENTS.md pointer.

## Action sequence

1. Collect missing values: absolute local-path (current opened project if explicitly connecting it), name, instance root, optional goal/terms/industry.
2. Prefer the instance's script:
   `node <instance>/core-space/scripts/aipa-project-add.mjs --root <instance> --local-path <project-path> --name <name> [--goal <goal>] [--terms <comma-separated>] [--industry <industry>]`.
3. If the script cannot run (missing Node, sandbox, missing script), complete **both** sides manually using the exact structure below.

### Manual Fallback

Instance side: user-space/projects/<project_id>/project.yaml contains machine-independent metadata:

```yaml
project_id: <project_id>
project_name: <name>
industry: <industry>
goal: <goal>
terms: [<terms>]
relations:
  reuse: []
public_interfaces: []
pattern_hits: []
```

Store the absolute project path separately as a single line in local_path.

Project side: AIPA-INSTANCE.md (ignored) contains:

```markdown
<!-- AIPA integration (local configuration; Git-ignored; do not commit) -->
# AIPA
- Instance directory: `<instance>`
- Before work, read the instance AGENTS.md, core-space/policy.md, user-space/profile.yaml, user-space/privacy.yaml, and user-space/memory/context.md.
- Memory, skills, and profile belong to the instance; return personal learning to its user-space/memory and user-space/skills.
```

Copy the instance .ide_activation/aipa.md **in full** to the host targets registered in core-space/scripts/aipa-shell-hosts.json (currently .claude/commands/aipa.md and .codebuddy/commands/aipa.md). Do not maintain a protocol copy in this skill.

Append AIPA-INSTANCE.md, .claude/session-history/, and all registered hosts[].target entries to project .gitignore. Create it if missing. Do not ignore AGENTS.md or .ide_activation/: the master is framework content. Append this machine-independent pointer to AGENTS.md once, preserving existing text:

```markdown
<!-- AIPA integration -->
- If AIPA-INSTANCE.md exists, read it first to connect to AIPA (local configuration; Git-ignored).
```

4. Verify project.yaml/local_path in the instance and the ignored link, AGENTS pointer, ignore rules, and every IDE adapter in the project.
5. Explain that reopening the project makes /aipa available. Use refresh AIPA to redistribute the current master.

## Dependencies

- core-space/scripts/aipa-project-add.mjs (idempotent two-sided registration)
- core-space/scripts/aipa-shell-hosts.json (authoritative host target map)

## Verification

- project.yaml contains no local_path; the separate file contains it.
- The project link is ignored; AGENTS preserves old content and only adds a portable pointer.
- All adapters match the master.
- Repeated registration introduces no duplicates.
