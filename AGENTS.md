# AGENTS.md - AIPA Public Foundation

This is AIPA's public foundation. Keep it abstract, general, and neutral, without individual views or concrete projects.

## Contents

- Overall constraints: core-space/CONSTRAINTS.md
- Framework: framework.md
- Built-in boundaries: core-space/policy.md
- Mentor templates: core-space/mentors/
- Common skills: core-space/common/skills/
- Blank personal skeleton: user-space/ (copied into an instance during initialization)
- Instance entry templates: templates/personal/
- Industry mapping: industry-map.yaml
- Runtime scripts: core-space/scripts/; installers: scripts/. Scripts require Node.js; the files themselves remain directly readable.

## Use

- Guided: ask to initialize a personal agent; the agent collects name, industry, technology stack, role, and destination, then runs aipa-init. See core-space/common/skills/init-instance/SKILL.md.
- Manual: `node scripts/aipa-init.mjs --root <new-instance-directory> --owner <name> ...`.
- The deployed instance entry is templates/personal/AGENTS.md.

All repository content except localized README files is English. Model input/output supports the user's language through display.language; this does not translate existing personal data.
