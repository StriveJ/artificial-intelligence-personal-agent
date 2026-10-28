# Release and Update Guide

## Version and integrity

The public release line starts at **1.0.0**. Check `VERSION`, `ORIGIN-MANIFEST.yaml`, the published version tag, full commit and package SHA-256 before installation. Origin tags identify source commits; Personal tags identify generated artifacts. Their commit IDs differ.

Core and Hub are separate releases. Select an accepted combination using the [shared contracts](core-space/shared-contracts.md) and the applicable release manifest. A version number alone does not establish source trust or format compatibility.

## Install a new instance

Use an announced Personal release and run `node scripts/aipa-init.mjs --root <new-instance-directory> --owner "Your name"`. Keep the private instance outside the foundation checkout. The [README](README.md#install) covers environment setup and activation.

Never initialize over an existing instance.

## Update the framework

Stop writers and schedules, save pending work and back up the instance. From a verified Personal checkout, preview:

```bash
node scripts/aipa-update.mjs --root /absolute/path/to/my-aipa --artifact . --framework-only
```

After reviewing the plan, apply:

```bash
node scripts/aipa-update.mjs --root /absolute/path/to/my-aipa --artifact . --framework-only --apply
```

For an explicit GitHub source, the same coordinator accepts:

```bash
node scripts/aipa-update.mjs --root /absolute/path/to/my-aipa --remote https://github.com/StriveJ/artificial-intelligence-personal-agent.git --version 1.0.0 --framework-only
```

Select a newer published version; reinstalling the current version is refused. Append `--apply` only after reviewing its preview. An exact full commit can be supplied with `--commit` instead of `--version`. Local packages use `--package <file> --sha256 <trusted-digest>`.

The restricted framework mode checks the installed coordinator generation, behavioral capabilities, formats, managed files and baseline. It preserves the personal area and rejects unknown or inconsistent installations. Ordinary updates without this flag have broader data-compatibility reads; see [shared contracts](core-space/shared-contracts.md#restricted-framework-installation).

After a successful update, restart Hub and reload host instructions. Updating instance Git data does not update Core or Hub software.

## Recover an interrupted update

Keep the transaction records and stop writers. Use the verified coordinator:

```bash
node scripts/aipa-update.mjs --root /absolute/path/to/my-aipa --recover
```

Recovery uses saved transaction state and does not steal a live lock. Inspect reported failures before retrying. Downgrades require an explicitly selected trusted artifact, `--allow-downgrade` and compatible formats; they do not restore personal data from a snapshot.

## Restore on another device

Restore from a clean local clone of your private instance into a new directory:

```bash
node scripts/aipa-restore.mjs --from /absolute/path/to/private-instance --root /absolute/path/to/new-instance --host-id second-device
```

Review the preview, then repeat with `--apply`. Only committed Git-held data is restored. Ignored credentials and local runtime configuration require separate setup. Use a distinct device identifier and do not initialize over the restored instance.

## Update Hub separately

Source deployments follow the [Hub guide](https://github.com/StriveJ/artificial-intelligence-personal-agent-hub#updating). Managed installations require a signed immutable Hub package and an explicitly trusted Ed25519 public key. Source tags, unsigned signing requests and test signatures are not managed-package trust.

Hub program maintenance can read instance/runtime snapshots and start candidate code. Core's restricted framework flag does not authorize that access.

## Compatibility and support

Unknown baselines, damaged checksums and incompatible formats are rejected. Keep source tags, artifact identities, signed packages and published checksums immutable. See the [baseline policy](core-space/release-support.md).

Checksums verify bytes; obtain the expected digest from a trusted publication. Preserve backups and recovery records. Installing a new release does not modify repository permissions or start configured services automatically.
