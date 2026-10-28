# Release Baselines and Compatibility

## Public baseline

The public release line begins at **1.0.0**. A supported baseline consists of an announced version, immutable source and artifact identities, verified checksums, and an accepted Core/Hub/capabilities/formats combination.

Development branches and unsigned test packages are not formal installation baselines. Publishing source does not deploy services or update private instances.

## Installation and updates

- Initialize new private instances from a verified Personal release.
- Update only from a verifiable installed baseline, retaining all required behavioral capabilities and compatible persistent formats.
- Reject damaged artifacts, unknown coordinator generations, unrecognized overlays and unresolved managed-file drift.
- Keep Core installation, Hub program maintenance and private-instance synchronization separate.

A successful preview does not replace source trust, compatibility checks, backups or explicit application. See [shared contracts](shared-contracts.md).

## Recovery and rollback

Keep transaction receipts, trusted before/after artifacts and format-compatibility evidence. Recovery must respect active locks and preserve personal files. Explicit downgrades do not restore personal snapshots or make incompatible formats readable.

Never rewrite published tags, signed payloads or checksums to repair an old delivery. Issue a new version with a new immutable identity.

## Unrecognized installations

An instance without a trusted baseline or complete update contract needs a separately scoped migration assessment. Preserve original files, use synthetic fixtures, establish compatibility and recovery, and review the proposed data access before changing a real instance.

Do not bypass an unknown-baseline refusal by copying framework files, recalculating installed digests or executing untrusted code to guess compatibility.

## Validation scope

The applicable release record names supported platforms, versions and capability combinations. Source declarations do not certify arbitrary hosts, models, data sizes or private deployments. Keep detailed device and model acceptance evidence in maintainer records rather than user installation instructions.
