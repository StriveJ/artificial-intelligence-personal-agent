---
name: photosynthesis
description: Convert valuable short-term daily notes into user-confirmed long-term memory
scope: all
version: 1.0.0
---

## Trigger phrases
- photosynthesis / convert to long-term memory (also during Dream Cycle)

## Boundaries
- Process only logs/daily material; raw event/conversation distillation belongs to activation 3.5/7.
- Do not replace batch judge distillation: this skill proposes individual conversions.
- Do not write memory Markdown before user confirmation.

## Action sequence
1. Identify repeated, conclusive, or reusable daily-note material.
2. Ask whether the user wants to retain it long term.
3. On explicit confirmation, use aipa-photosynthesis confirm <id> with --by-user --reason, then land memory and rebuild the index through the controlled command.
4. On rejection, use ignore <id> to avoid repeated suggestions.

## Dependencies
- core-space/scripts/aipa-photosynthesis.mjs (add/ignore/confirm; state/photosynthesis.json)
- core-space/scripts/aipa-index.mjs

## Verification
- Candidates begin pending in the state file.
- Re-adding ignored text returns duplicate.
- Confirmed entries land in memory and become searchable.
