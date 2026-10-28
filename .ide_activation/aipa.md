---
description: "Activate an AIPA session and retain its identity for the session"
argument-hint: "[task]"
---

# AIPA Activation Entry - Mandatory Self-Contained Protocol

This is the /aipa entry. The agent performs the steps explicitly; host hooks are not prerequisites. After activation, use the local user's dedicated AIPA identity.

## Mandatory Gate

**Do not start the user's task or answer it until steps 1-5 complete.** Report any failure honestly before continuing. Never skip a step silently or fall back to a general-assistant answer. A failed required context/security gate stops the dependent action.

## Ordered Steps

### Step 1 - Locate the Instance and Resolve the Project

If the current directory contains AIPA-MANIFEST.yaml, it is a candidate only. Run:

```text
node <cwd>/core-space/scripts/aipa-git-guard.mjs status --root <cwd>
```

Use lib/trunk.mjs as the authority and dispatch by code:

- ok: current directory is the instance. Resolve project through aipa-project resolve --cwd <cwd> --root <cwd>.
- trunk-unknown: ask once for the trunk. Either configure only `git config --local aipa.trunk <answer>`, or install the complete guard through `aipa-git-guard --install --root <cwd> --trunk <answer>`. **Install also sets core.hooksPath**, enabling layer-3 pre-commit enforcement. Keep the two choices distinct. If unresolved, visibly disclose that the branch check was not completed before continuing under its fail-open rule; never guess.
- linked-worktree: this directory is not the instance. Read its AIPA-INSTANCE.md. If absent, use the status result's mainWorktree and ask the user to connect this directory with `node <mainWorktree>/core-space/scripts/aipa-install-project.mjs <cwd>`, then stop. Do not recalculate a competing instance root.
- not-trunk: stop. Show the returned branch/trunk and offer checkout of trunk or a topic worktree through git worktree add. Accounting belongs to the instance root.
- nogit: this directory is a plain-directory instance; resolve its project normally.

Otherwise read local AIPA-INSTANCE.md for the absolute Instance directory and resolve project with the real current working directory. lines.yaml can map the checked-out branch to a product-line ID; project is not always the directory name.

Record resolve.source as evidence: branch is a product-line match; repo is repository fallback; instance/basename are other fallbacks. Explain a basename result or repo fallback despite an existing lines.yaml in the opening reply.

If neither candidate nor link exists, explain that the project needs the instance's connection installer and stop. Save **absolute <instance>**, **resolved <project>**, and later **<SID>** for every subsequent step. Never cite private-area design files from this distributable master.

### Step 2 - Load Identity and Language

Read the instance core-space/activation.md and manifest assist_prefix. Apply registered display overrides, falling back through anchors.yaml. Replies begin with [YYYY-MM-DD HH:mm:ss] and assist_prefix. Model output follows an explicit current request, then display.language; auto follows the user's input. Mechanical interfaces remain English. Preserve personal text in its original language.

### Step 3 - Load Shared Rules and On-Demand Material

Run `node <instance>/core-space/scripts/aipa-load.mjs --root <instance> --context --host ide --project <project> --budget 32000`. Use structured sections/sources/omitted without bypassing project, validity, revocation, or review filters.

For blocked (exit 2), inspect code/issues: required_context_unavailable is missing/blank/unreadable required rules; required_context_private is privacy-blocked required rules; context_privacy_unavailable is unavailable privacy configuration; required_context_exceeds_budget is actual budget insufficiency. Resolve the cause or report it; never answer/externalize with omitted required rules. Hub uses general context with execution=disabled and receives no IDE execution grant. See core-space/shared-contracts.md.

Use aipa-load --file <instance-relative-path> --sid <SID> for ordinary optional reads, with --from-line/--to-line when useful. It records actual bytes at the read point. Other host read tools are outside that measurement; do not fabricate accounting.

At first activation detect tool through aipa-tool-detect. If ok use tool; ambiguous/unknown requires asking which host (claude-code/codex/workbuddy/trae, for example). Then:

```text
node <instance>/core-space/scripts/aipa-session.mjs resume --root <instance> --project <project> --tool <tool> --json
```

Use its returned sid and prompt. Supply --host-session-id when available; without one, --new is only for an actual new host session. Recover with that SID or stable host ID, never another host's shared current-sid/resume-prompt. Later events inherit the tool without repeated detection.

Ordinary on-demand material can include memory/context.md. Preferences/instructions use the shared projection rather than whole-file reads that could reactivate revoked/expired rules.

### Step 4 - Continuity and Capture

Every abbreviated script call means `node <instance>/core-space/scripts/<script>.mjs --root <instance> --project <project>`. Use explicit SID throughout.

- Due reminders: aipa-tick --reason session; present actionable reminders at the start.
- Input ownership: a registered UserPromptSubmit hook writes input; protocol capture returns owned-by-hook without duplicating it. Other hosts write once each turn. Stable --event-id enables retry identity; equal text or a time window is not deduplication.
- Turn end: aipa-event add --sid <SID> --type user_message --data <original-input> and aipa-checkpoint set --sid <SID> --intent ... --progress ... --next ....
- Session end: aipa-event add --sid <SID> --type session_end.
- Day end: perform the complete aipa-daily/aipa-distill closeout in activation.md, including required day-boundary, warmup, visibility, and refresh steps.

### Step 5 - Skill Routing

Use description-based matching in user-space/skills -> active mentor skills -> common skills. Read a matched SKILL.md fully before execution. aipa-route --query <phrase> is an exact-trigger fallback. Generated skill guidance is at user-space/skills/README.md.

### Step 6 - Execute the User's Task

Only now process $ARGUMENTS.

## End-of-Turn Checklist

- [ ] Reply begins with timestamp and assist_prefix.
- [ ] Original input was captured by its owner exactly once.
- [ ] Checkpoint updated with this session's SID.
- [ ] AIPA identity and user's output-language preference remain active.

If compaction loses the SID and no stable host-session ID exists, verify the binding before resuming. Shared current-sid is not proof that a session is yours.
