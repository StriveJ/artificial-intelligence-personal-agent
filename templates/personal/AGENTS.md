# AGENTS.md - AIPA Instance Entry Router

This repository is an AIPA personal instance. This entry routes to authoritative content in each area rather than duplicating it.

## Override Priority (Invariant)

user-space -> active mentor (core-space/mentors/<active>) -> common (core-space/common) -> model/default.

## Placement Rule (Invariant)

Before adding a capability, ask: **Is it for all users?** If yes, use framework paths (core-space, AGENTS.md, .claude, .ide_activation, .codebuddy) and expose variable values as slots registered in core-space/anchors.yaml with personal values in user-space/overrides.yaml. Otherwise use user-space.

Capabilities intended for contribution belong in the framework. Framework code in the personal area can run locally but cannot reach other users because pull-origin preserves that area. Keep reusable scripts in Core; user-space/scripts is not an exportable framework location. The Origin [contribution specification](https://github.com/StriveJ/artificial-intelligence-origin-agent/blob/master/docs/instance-to-origin-contribution.md) explains the boundary; consult the matching source repository when using a different remote.

## Routes

- Activation: core-space/activation.md (Identity and Activation Protocol).
- After clone/pull, if .claude/commands/aipa.md is absent, run `node <instance>/core-space/scripts/aipa-shell-sync.mjs --root <instance> --self` before /aipa. Generated adapters are untracked; a deleted command cannot regenerate itself.
- Hard boundaries: core-space/policy.md. Personal boundaries/values: user-space/values.yaml.
- Profile/privacy/memory: user-space/profile.yaml, privacy.yaml, memory/.
- Display reload: personal overrides first, then registered defaults. display.language defaults to auto for model output, following current user input unless the user explicitly requests another output language. CLI/UI/repository text stays English; personal content stays in its original language.
- Periodic personal tasks: user-space/tasks/*.mjs. Tick discovers/spawns plugins; an absent directory is an empty plugin set.
- Skills: description-based semantic matching first; aipa-route exact phrases as fallback. Read a selected SKILL.md in full before execution. Search user-space/skills, active mentor skills, then common skills. Generated skill guidance is under user-space/skills/README.md.
- Lifecycle: invoke aipa-lifecycle with --hook session_start|after_input|skill_pre|skill_post|before_summarize|before_upload|after_pull, explicit root, and text; obey its decision.
- Project connection: .ide_activation/aipa.md is the only manually maintained adapter master. aipa-install-project <absolute-project-path> writes ignored AIPA-INSTANCE.md and redistributes adapters through aipa-shell-sync. Only the project AGENTS.md pointer is portable/tracked; all other generated integration files are ignored.
- Also ignore .claude/session-history, which can preserve verbatim protocols/absolute instance paths even though AIPA does not generate it. PROJECT_IGNORE_EXTRAS in lib/shell-sync.mjs is authoritative and --all distributes the set. Adapter gates/checklists do not depend on host hooks.
- Refresh adapters: request refresh AIPA / synchronize AIPA shells in an activated project, or run aipa-shell-sync --all --self with explicit root. --all updates registered projects; **--self** updates the instance's own adapters.
- Host map: core-space/scripts/aipa-shell-hosts.json. Keep the master under .ide_activation and generated copies in host directories. Add a map entry to support another IDE.
- Contribution: aipa-contribute-status shows five states; aipa-export-edits --prepare prepares CONTRIBUTION.md without exporting/committing. Fill Feature Overview and Testing and Validation with real evidence, review public content, then export --out <directory>. Fork Origin from dev, apply mapped product patches with git am, run the full Origin gate, and open a dev PR. Contributors can submit; merging/publishing remains a maintainer permission. Do not claim remote PR/merge/release without evidence. Follow Origin CONTRIBUTING.md.
- Channel/diagnostics: aipa-channel reads stable/beta. --telemetry on explicitly consents after showing scope/purpose; joining beta with --set beta requires consent first; --set stable leaves it. aipa-report is **manual**, sending redacted state/errors.log diagnostics to the public Origin GitHub Issues destination only when beta AND consent are enabled. No hook automatically invokes it. Review the dry-run payload before sending; published issues and comments are visible to others.
