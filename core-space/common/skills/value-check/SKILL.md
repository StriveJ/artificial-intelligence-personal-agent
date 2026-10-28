---
name: value-check
description: Screen new skills and behavior patterns against hard boundaries and personal values
scope: all
version: 1.0.0
---

## Trigger phrases
- check values / validate a new skill (also when evolving a skill)

## Boundaries
- Perform rule screening, not final semantic adjudication; suspicious matches require the user's decision.
- Privacy/secrets are handled by privacy-filter and remain hard blockers.
- Built-in policy wins over conflicts; this skill does not edit boundaries.

## Action sequence
1. Read the selected policy source (default core-space/policy.md; an explicit --policy can select another source). Personal values remain user-owned rules, not automatically merged by this CLI.
2. Check prohibited and suspicious rule matches.
3. Prohibited -> conflict/block; suspicious -> suspicious (normalized by lifecycle to ask); otherwise ok.

## Dependencies
- core-space/scripts/aipa-value-check.mjs
- core-space/policy.md and user-space/values.yaml

## Verification
- Prohibited matches block as conflict.
- Suspicious matches ask for user review.
- Nonmatches pass as ok.
