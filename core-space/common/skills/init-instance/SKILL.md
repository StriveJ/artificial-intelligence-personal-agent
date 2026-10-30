---
name: init-instance
description: Guided personal-agent initialization: collect owner, industry, stack, role, and destination, then run aipa-init
scope: all
version: 1.0.0
---

## Trigger phrases
- initialize agent / create my personal agent / start using AIPA / init

## Boundaries
- If an instance exists, continue in it instead of splitting memory across duplicates.
- Project connection belongs to project-add and shell synchronization.
- Framework updates belong to update-agent.
- Activation requires a project rule for every resolved project, including the instance's own project. `aipa-init` scaffolds `user-space/projects/<project>/project.yaml`; without it `aipa-load --context` blocks with `required_context_unavailable`.

## Action sequence
1. Reuse an existing instance when present.
2. Ask only for missing values: absolute root (prefer new/empty), required owner name, optional industry/tech (comma-separated)/role for mentor matching. Explain template copying before using an existing nonempty destination.
3. Check git --version and node --version against the declared installer requirements; guide installation when missing.
4. From the foundation root run `node scripts/aipa-init.mjs --root <destination> --owner <name> [--industry <industry>] [--tech <stack>] [--role <role>] [--project <project-id>]`.
5. Inspect init output and mentor matches, if any.
6. Verify entry shells/manifest/changelog/state, Core policy/activation/anchors/hooks/skills/mentors, and personal profile/privacy/memory/logs/skills/projects. The instance Git tag must match its framework version.
7. Confirm the instance's own project rule exists: `user-space/projects/<project>/project.yaml` (default project id is the resolved destination directory name). IDs accept letters, numbers, underscores, hyphens, and dots, excluding `.` and `..`. Use `--project <project-id>` if the directory name is unsuitable; init stores its device-local mapping in ignored `local_path` so project resolution returns that ID. Activation blocks without the rule.
8. Explain opening the instance in an IDE and running its own Core scripts with explicit root.

## Dependencies
- scripts/aipa-init.mjs (skeleton and Git baseline tag)
- scripts/aipa-restore.mjs (different-device recovery)

## Verification
- Complete entry/Core/personal skeleton, with the version tag matching ORIGIN-MANIFEST.yaml.
- Missing owner prompts the user instead of silently inventing a name.

## Different-Device Restoration

Commit the source personal files that need restoration. Preview `node scripts/aipa-restore.mjs --from <local-personal-repository> --root <new-empty-directory> --host-id <new-device> [--with-decay]`; review before --apply. Existing personal areas/nonempty destinations are rejected. Only Git-held data is restored; decay is optional, while offload bodies and local sessions are excluded. Inspect state/restore-report.json, adjust local_path/endpoints as authorized, then activate in the host.
