---
name: dream-cycle
description: In-session organization: review weekly logs, analyze relations, and draft evolution suggestions
scope: all
version: 1.0.0
---

## Trigger phrases
- dream cycle / organize memory (in-session only; unattended execution is deferred)

## Boundaries
- Do not capture live events; activation section 6 owns per-turn capture.
- Do not replace day-end reports, distillation, or pruning in activation section 7.
- Do not trigger while state/sleep-mode.md exists.

## Action sequence
1. Review this week's logs/daily and propose missing long-term-memory candidates.
2. Analyze relations in memory/archive for potential patterns.
3. Update memory-index.json relations and run aipa-relations gc for orphan/dangling references.
4. Draft next week's evolution suggestions.
5. Write logs/dream/YYYY-MM-DD-dream.md. aipa-dream provides log/archive inventories and relation statistics; the host supplies candidates, patterns, and suggestions.
6. Report semantic organization only after actually doing it; a pending skeleton does not prove unattended overnight work.

## Dependencies
- core-space/scripts/aipa-dream.mjs
- core-space/scripts/aipa-relations.mjs
- memory/memory-index.json relations

## Verification
- The dated dream report exists.
- Relation analysis candidates are recorded.
- A skeleton returns pending_host. Supply semantic JSON through aipa-dream --complete --input to receive host_filled; that status is not semantic-quality certification.
- Repeated skeleton generation preserves an existing report. Submit candidates through photosynthesis add; only explicit user confirmation with --by-user --reason authorizes landing.
