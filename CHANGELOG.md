# Changelog

## 1.0.3

- Keep persistent memory history readable when value digests are stale, report the affected rows, and repair digests during index rebuilding.
- Scaffold the instance project rule for new installations and include actionable hints for missing required context.
- Resolve relative initialization destinations, register custom project IDs locally, and reject invalid project IDs before writing files.
- Retain personal project rules outside framework contributions and exported patches.
- Make dashboard usage regressions deterministic across runner time zones and business-day boundaries.

## 1.0.2

- Preserve Windows long-path support inside isolated synthetic Git environments used for release verification.
- Surface bounded failure details in quality-gate logs and GitHub check annotations.
- Keep Core runtime behavior and personal-data formats unchanged from 1.0.1.

## 1.0.1

- Use the instance time zone and business-day boundary when grouping host usage and dating offloaded content.
- Apply the same configured clock to offload garbage-collection retention.
- Add regressions for different host time zones, business-day boundaries, daylight saving, and unchanged stored data.

## 1.0.0

Initial public release of AIPA.

- File-based personal profiles, rules, memories, skills and project context.
- Session checkpoints, task continuity, scoped retrieval and source-aware memory lifecycle.
- Host-driven reports, reminders and reusable workflows.
- Configurable model response language with English framework interfaces.
- Optional Hub integration for Web access and scheduled workflows.
- Verified instance initialization, controlled framework updates, interrupted-update recovery and device restoration.
- Apache-2.0 licensing for original code and documentation.
