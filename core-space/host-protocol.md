# AIPA Host Protocol

> Single source: the minimum capabilities an agent host must provide for AIPA's full workflow.
> Purpose: integration checklist for host developers and a verifiable definition of host independence.

## 0. Purpose

The foundation is files and scripts. Capabilities reside in core-space/scripts and user-space, while a host supplies sessions, model reasoning, and file/process access. Hooks receive input over stdin; explicit protocol capture supplies the original input through --data or --text. Hosts must use the matching interface so events retain their original content.

This protocol makes those conventions explicit. Full-support claims require both the capabilities and the actual actions below.

## 1. Required Host Capabilities

| ID | Capability | Minimum | Existing integration |
|---|---|---|---|
| C1 | Session lifecycle | Detect start/end and trigger AIPA actions | Codex protocol; Claude Code SessionStart/Stop hooks |
| C2 | Per-turn input/output | Access original user input and deliver the reply | Provided by current hosts |
| C3 | Model reasoning | Perform distillation/summarization, or delegate to a local/cloud provider | host mode uses the host model; external mode uses llm-provider.yaml |
| C4 | Files/processes | Read/write the instance and execute its Node scripts | Provided by current hosts |

C1-C4 are sufficient host primitives. A host need not reimplement AIPA internals.

## 2. Minimum Actions

Every command below requires an explicit --root <instance> and project/session bindings where applicable.

| Action | Trigger | Core command | Meaning |
|---|---|---|---|
| recall | Before each answer | aipa-session resume; aipa-signal repeat --text <input> | Restore context/checkpoint and state reminders |
| capture | After each turn | aipa-event add --type user_message --data <original>; aipa-checkpoint set; aipa-warmup check | Persist the input/checkpoint; --text is also accepted |
| distill | Day end / warmup due | aipa-llm judge, host reasoning, aipa-distill add | Extract long-term-memory candidates (C3) |
| session_end | Session end | aipa-event add --type session_end | Mark session completion/flush work |
| tick | Session start | aipa-tick --reason session | Due reminders and catch-up |
| scan | Session start | aipa-signal scan | State-based reminders |

## 3. On-Demand Retrieval Tools

| Tool | Meaning | Core interface |
|---|---|---|
| memory_search | Retrieve long-term-memory sections | aipa-search --q <keywords> |
| conversation_search | Retrieve original historical conversation | Gap: no dedicated script; use daily logs or aipa-event list. A dedicated interface remains future work. |

## 4. Failure Semantics

- Auxiliary-script failure must be visible: `aipa-errors add --scope <script> --message <error>` writes state/errors.log, and the next session reports failures with aipa-errors report.
- General auxiliary failures need not stop unrelated host work. Required context/security failures **must** stop the dependent model/action workflow, as specified in section 9 and shared-contracts.md.
- Minimal circuit breaker: nonempty report.circuits (at least three failures in the same scope within ten minutes) stops automatic retries for that action and requires a user notice.
- Capture retries use stable event_id/host/sid identities. Same identity with different payloads leaves the effective set pending adjudication; equal text/time windows must not swallow real repeated input.
- Use shared time_zone (default Asia/Shanghai) and day_start_hour (default 6) from user-space/llm-provider.yaml. UTC/offset timestamps take priority; offset-free legacy ts_local stays compatible. Do not cut business days using the host OS zone independently.
- Pass project explicitly rather than asking a script to guess the host cwd.

## 5. Host Boundaries

- Do not write framework core-space unless the user explicitly requests and reviews it; PRs are initiated by the user.
- Do not bypass hard boundaries: core-space/policy.md precedes personal values and other instructions.
- Do not replace portable AIPA originals with copies held only in proprietary host storage.
- Keep the repository language English while honoring the user's language for model input/output and preserving personal content verbatim.

## 6. Existing Hosts

| Action | Codex (protocol) | Claude Code / WorkBuddy (hooks) |
|---|---|---|
| recall | Activation sections 3/4.5 | SessionStart plus protocol |
| capture | Activation section 6 | UserPromptSubmit/PreToolUse/PostToolUse; input over stdin |
| distill | Activation section 7 | Stop triggers confirm --auto; judge remains protocol-owned |
| session_end | Explicit protocol call | Stop hook |
| tick/scan | Activation 3.4/3.6 | Same, plus optional system scheduler |

## 7. Host Integrations

A conforming host implements C1-C4 and invokes section 2's actions. Memory formats and contracts remain shared across hosts. Integrations provide workflow execution and portability without introducing another authoritative memory store.

## 8. Validation

```bash
node <instance>/core-space/scripts/aipa-host-check.mjs --root <instance>
node <instance>/core-space/scripts/aipa-host-check.mjs --root <instance> --json
node <instance>/core-space/scripts/aipa-host-check.mjs --root <instance> --declared c1,c2,c3,c4
```

Exit 0 means no failures; exit 1 means at least one failure (warnings alone do not fail). Checks cover structure, minimum script presence/parseability, writable state, LLM seam, business-day boundary, read-only warmup/signal status, test-root convention, and host declarations. C1-C4 are host properties, not facts the script can independently prove: absent --declared is a warning.

### 8.1 CLI Conventions for Implementers

Subcommands must be order-independent. Use lib/argv.mjs pickCmd(argv, KNOWN), not process.argv[2], so --root <instance> status remains valid. The argv-order.e2e.test.mjs suite verifies this convention. Use pickPositional(argv, {skipFirst: cmd}) for positional arguments. Skip value flags and their arguments together; pickCmd handles this and uses fallback candidates around leading boolean flags.

## 9. Shared Context, Usage, and Agenda Contracts

Activation/project switching uses aipa-load --context --host ide; Hub uses the same Core projection with execution=disabled. Missing/blank/unreadable required Core policy, IDE execution protocol, or explicit project rules yield required_context_unavailable; privacy-blocked configured rules yield required_context_private; budget shortage yields required_context_exceeds_budget. Every blocked result prevents dependent external transmission. Omitted unconfigured/personal material is not successfully read content. Hosts require context-completeness-v1; an older ready response does not prove completeness.

After the versions handed to the model produce a successful answer, register use once with `aipa-search --receipt <stable-operation> --used <JSON-IDs-and-body_hash> --project <project> --at <business-date>`. Retrieval/routing alone does not prove execution, adoption, or confirmation. A usage failure is a separate warning, not cancellation of the answer. Legacy string-only IDs lack body-version binding and transactional idempotence.

Native agenda uses `aipa-signal agenda --command list|propose|confirm` through a locally registered Hub provider. Missing registration or contract drift must be reported unavailable. Complete boundaries are in [shared contracts](shared-contracts.md).

The host self-check and end-to-end tests cover the interfaces above. A dedicated conversation_search interface is unavailable; use the documented event and daily-log interfaces.
