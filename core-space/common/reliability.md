# Data Maintenance and Recovery Interfaces

Core provides these interfaces; Hub uses their capability declarations. Commands target an explicitly selected instance. Framework installation, data organization, and publishing are separate actions. Replace <instance> yourself; examples do not select a private instance.

## Index Rebuilding and History Preservation

Normal index writes first persist creation provenance, relations, and legacy restrictions in existing memory-meta.json entries' index_history, then atomically write the local cache. `aipa-index --root <instance>` can rebuild a deleted/corrupt cache from persisted, uniquely identified history, preserving corrupt bytes as .corrupt-<digest>.json first. Missing/corrupt/nonunique history rejects guessing and preserves old evidence. Export happens only through existing data commands; framework installation does not index, migrate, or confirm personal memory.

Hub's conflict-evidence/user-decision interface displays current full files/candidates and requires a reason and explicit full-version confirmation. Requests bind viewed versions; repeated clicks/retries reuse operation IDs. Interrupted operations remain queryable. Further external edits prevent restoring an older file; view current evidence and explicitly supersede the old decision. Receipts preserve original audits/both sides. Successful saving does not lift every memory restriction.

## Event Archiving

```text
node <instance>/core-space/scripts/aipa-prune.mjs --root <instance> --json
node <instance>/core-space/scripts/aipa-prune.mjs --root <instance> --apply --json
node <instance>/core-space/scripts/aipa-prune.mjs --root <instance> --restore <SHA256> --json
node <instance>/core-space/scripts/aipa-prune.mjs --root <instance> --restore <SHA256> --apply --json
```

Default preview creates no archive and removes no originals. Apply verifies the daily timeline multiset, saves raw JSONL bytes/SHA256/event identities, verifies, and only then removes source files. state/event-archive follows private-instance synchronization rules; daily reports do not replace raw archives. Force skips only report coverage, not corrupt-record/archive checks. Partial failures return status: partial and nonzero exit with retained reasons. Restore also previews and refuses to overwrite different existing content.

## Distillation Confirmation and Operation Receipts

`add --operation <stable-ID> --json` returns actual candidate id/status/request fingerprint. IDs contain 1-128 letters/digits/underscores/hyphens. The same operation/request returns its receipt without adding again; changed requests under the same operation are rejected. `status --operation <ID> --json` returns queued/landed/discarded/unknown/not-found. Legacy text calls without IDs remain supported.

Validate candidate, target, source, and user-confirmation basis before confirming. confirm --by-user requires a nonempty reason. Model observations are not user confirmation; models cannot automatically lift revocation/review status. Reject candidates spanning memory sections or ambiguous identities; split them first.

Body/metadata/queue/landing receipts form one recovery unit. state/memory-transaction.json is a private local log that may temporarily contain recovery bodies; snapshots clear after completion/successful rollback. Reject starting confirmation if Git tracks this path or does not ignore it. Preview the separate migration with aipa-runtime-migrate; never delete recovery logs or overwrite personal ignore rules to bypass the gate.

Readers reject partially written material after an interruption. Restore consistency before retrying the candidate:

```text
node <instance>/core-space/scripts/aipa-distill.mjs confirm --root <instance> --recover --json
```

Recovery verifies paths, byte digests, and lock ownership. A living original process, unknown concurrent edits, or changed lock owner prevents takeover. If a Hub external-model result is unknown, reconcile before another call. Query receipts before retrying internal candidate/confirmation phases.

## Deduplication and Retrieval

aipa-dedup previews by default. Equal titles suggest candidates only. Exact groups require matching body/file/type/project/scope/validity/source/confirmation. Apply needs --apply --reason; decisions go to memory-meta.json, leaving bodies unchanged and projecting through rebuilding. --undo <merged-ID> --apply --reason reverses a decision. Body/basis changes invalidate it and restore visibility.

q/tag/list share kind/status/project/validity filters, JSON formatting, and final byte budgets. Budget 0 is unlimited; chars 0 disables body truncation. JSON contains structured hit metadata; hosts read bodies by returned identity. Pending-review/revoked memory is excluded by default. Bodies/persistent metadata are authoritative; older indexes can still contain unmigrated provenance/relations and cannot universally be discarded without loss.

Legacy CLI records use after final output. Hub defers with --defer-usage, then registers model-supplied versions after a successful answer through a stable receipt, JSON IDs/body_hash values, and original project/at. Decay/growth log/receipt commit transactionally. ID-only arrays retain legacy guarantees. Do not receipt privacy- or budget-excluded entries. Usage does not prove adoption/benefit; receipt failure does not rewrite an existing answer. See [shared contracts](../shared-contracts.md) for lifecycle/projection/clock/agenda details.

## Hub Outcomes and Conflict Boundaries

Tasks return success/partial/deferred/blocked/error/unknown. Only success updates last-success time. Missing/invalid status is a contract error. Unknown pauses automatic scheduling pending side-effect reconciliation. Daily reports retain failures/backoff separately per date so healthy dates continue.

Text conflicts preserve both originals/common ancestor; disputed portions leave current facts. Metadata ambiguity becomes conflicted; revocation wins. Same-identity/different-payload events both leave the active set. Ambiguous profile/rule YAML pauses automatic sync. Pending-review is not a user decision; use the explicit evidence/decision interface above.

## Compatibility and Validation Scope

memory-conflicts-v1, distill-operations-v1, and durable-dedup-v1 declare new behavior. Metadata schema remains 1; parseability does not establish behavioral compatibility. Consumers of pending-review/dedup decisions need the relevant behavior. Hub can retain an older CLI fallback when capabilities are absent but must not claim the new recovery guarantees.

The applicable release record defines validated platforms, executor combinations and data scales. Interface availability alone does not establish a deployment or model-quality guarantee.

Restricted framework preview: `aipa-upgrade --root <explicit-instance> --artifact <verified-artifact> --framework-only`; only --apply installs. It conservatively compares complete behavior/same-format contracts without scanning personal records. Preview access lists required managed files and installation/Git metadata. This is not zero metadata access; it runs neither personal migrations nor services and rejects content filters, old overlays, missing behaviors, and format changes. Ordinary planning/check can read personal information. Recover through --recover and the original transaction without replacing newly created personal files. See shared contracts.

## Consumption and Recovery

Global same-identity event conflicts are resolved before filtering by business day. Verified archives remain witnesses of identities/content digests/original sources without returning archived bodies to active events. Late copies, archiving, and restoration do not constitute user adjudication. Archive-validation failure prevents constructing a misleading active set. Archive verification still scans history; its capacity cost requires measurement.

Structured sensitive: true/privacy tags participate in context filtering. Ordinary annotations cannot remove them. After body changes, ordinary metadata editing cannot inherit old confirmation/supersession; revoked/pending states remain. Legacy indexes without canonical metadata retain known project/privacy/validity restrictions, inherited during initial annotation. Migrating an old user-confirmation claim does not increase trust.

Scene/profile drafts supply memory evidence_ids and store body versions/semantic receipts, checked against current project/business date during consumption. Invalid or receipt-free legacy scenes do not become profile material. Writes check current bodies directly instead of using stale index confirmation. Manual additions remain in place; profile.yaml is never automatically rewritten. New drafts use user-space/projects/aipa/persona-draft.md; older paths are read-only compatibility, with no automatic moves.

Hub persists receipt intent with body versions/project/date before calling a model. It saves the successful answer before independently delivering receipts. Delivery failure keeps the answer complete and receipt pending with a warning. Restart/scheduled reconciliation reuses receipt identity without another model call. ID-only legacy Core receipts are not retried automatically and do not offer body-version recovery. Project entry depends on Core capability: new chats explicitly choose global/project, and that choice participates in duplicate checks/context/events/receipts. Historical answers from other projects do not enter the current project's context.
