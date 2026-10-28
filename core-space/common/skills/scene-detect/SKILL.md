---
name: scene-detect
description: Infer work, study, or life from context and switch only with sufficient confidence
scope: all
version: 1.0.0
---

## Trigger phrases
- detect scene / what is the current scene (also at session start or context change)

## Boundaries
- Do not switch at confidence <=0.7; avoid frequent oscillation.
- Skill loading uses description matching with aipa-route trigger fallback; scene affects role/mentor choice only.
- Cross-session scene memory belongs to long-term memory.

## Action sequence
1. Collect project industry, file types, time, and explicit statements.
2. Weigh the signals for work/study/life.
3. Switch only above 0.7; otherwise retain the current scene.
4. Use the scene's role context when selecting relevant skills.

## Dependencies
- core-space/scripts/aipa-scene.mjs (rule-based preliminary hint)
- profile.yaml roles

## Verification
- Output work, study, or life as appropriate.
- Low-confidence input does not cause repeated switching.
