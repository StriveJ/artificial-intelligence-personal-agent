# AIPA — Your Personal Agent

**English** · [简体中文](README_CN.md)

AIPA (Artificial Intelligence Personal Agent) gives your AI host persistent memory, personal rules, reusable skills and project context. Your agent can pick up work across sessions while keeping its knowledge in files you own.

**Version 1.0.0 · Local first · Apache-2.0**

This repository is the public foundation. Initialize a separate private instance for daily use; keep your personal information out of this public repository.

## What AIPA does

| Capability | What you can use it for |
|---|---|
| Persistent personal memory | Keep preferences, decisions and useful experience across sessions; search relevant records with sources and project scope. |
| Personal rules and profiles | Define how the agent should work with you, including privacy rules and response language. |
| Project continuity | Keep each project's context, task progress, checkpoints and next steps available when you resume work. |
| Reusable skills and mentors | Apply common workflows and specialist guidance, then add your own personal skills. |
| Reports and reminders | Produce daily, monthly and yearly reviews, track pending work and surface relevant reminders through the host or configured Hub tasks. |
| Portable personal knowledge | Store your data in Markdown, YAML and JSON; optionally synchronize your private instance through your own Git remote. |
| Optional Web access | Add Hub for browser chat, quick notes, images, authorized Web search and scheduled workflows. |

AIPA supplies instructions and mechanical tools. Your configured AI host performs model reasoning and invokes workflows. For scheduled work while the editor is closed, deploy the optional Hub.

## Choose your setup

- **IDE or CLI:** use an AI host that can follow repository instructions and run local Node.js commands. No Hub is required.
- **Browser and background workflows:** initialize the same kind of private instance, then deploy [AIPA Hub](https://github.com/StriveJ/artificial-intelligence-personal-agent-hub).
- **Framework development:** work in [Origin](https://github.com/StriveJ/artificial-intelligence-origin-agent). Personal is generated from Origin's `product/`.

Core, Hub software and your private instance data have separate update lifecycles.

## Install

### 1. Prepare the environment

Install **Node.js 24** and **Git 2.31 or later**. The release baseline covers Windows x64 and Linux x64. Core scripts use Node built-ins and have no third-party runtime package dependencies.

Configure your model in your chosen IDE or CLI host. AIPA does not include a model account, API subscription or credentials. Hub has its own dependencies and executor setup.

### 2. Download the foundation

```bash
git clone --branch v1.0.0 https://github.com/StriveJ/artificial-intelligence-personal-agent.git
cd artificial-intelligence-personal-agent
```

Use an announced release tag and verify its full commit and published package digest. When installing a later release, substitute its tag.

### 3. Create your private instance

```bash
node scripts/aipa-init.mjs --root /absolute/path/to/my-aipa --owner "Your name"
```

On Windows, for example:

```powershell
node scripts/aipa-init.mjs --root D:/agents/my-aipa --owner "Your name"
```

The target must be a new directory outside this foundation checkout. Do not initialize over an existing instance.

The installer creates your instance manifest, framework, blank personal area and local Git baseline:

```text
my-aipa/
  AIPA-MANIFEST.yaml
  AGENTS.md
  core-space/       Framework rules, skills and tools
  user-space/       Your profile, preferences, memories and projects
  state/            Local runtime state
```

Optional initialization arguments include `--industry`, `--tech "Python,TypeScript"` and `--role`.

### 4. Activate AIPA

Open the **private instance directory** in your AI host. In Claude Code, use `/aipa`; in another supported host, explicitly ask it to activate AIPA and follow `AGENTS.md` and the [activation protocol](core-space/activation.md).

Review your profile in `user-space/profile.yaml`, privacy rules in `user-space/privacy.yaml` and preferences in `user-space/overrides.yaml`.

Examples of everyday requests:

- "Remember this decision for the current project."
- "Resume where we left off and show the next tasks."
- "Summarize today's work and propose reusable lessons."
- "Find the source for the preference we discussed."

The host must execute the workflow for records and reports to be created. Opening the files alone does not start a background service.

## Model response language

The interface, CLI and framework instructions use English. Model replies and generated reports follow the user's language preference. In `user-space/overrides.yaml`:

```yaml
display:
  language: auto
```

`auto` follows the current input language, with English as the fallback. A tag such as `en`, `zh-CN`, `ja` or `es` sets a default. An explicit language request in the current message takes priority. Existing notes and personal records keep their original language.

## Deploy optional Hub

Hub adds a browser interface and services that can run independently of an editor.

1. Initialize your private instance as above.
2. Follow the [Hub installation guide](https://github.com/StriveJ/artificial-intelligence-personal-agent-hub#installation).
3. Store Hub configuration and runtime state outside the public source checkout.
4. Configure the instance path, model executor and credentials. Use Main for Web access and optional Sub services for other devices.
5. Configure HTTPS and pairing before remote browser access.

Hub does not give browser chat arbitrary command execution. Model, image and network capabilities depend on the executor and services you explicitly configure.

## Update your instance

**Update the framework through the verified foundation; keep personal data in your instance.**

First stop Hub writers, scheduled tasks and active AIPA sessions for that instance. Save your work and make a backup.

In your foundation checkout, select the intended announced release:

```bash
git fetch --tags origin
git checkout v1.0.0
```

Replace `v1.0.0` with a newer announced release; reinstalling the current version is refused. Preview the framework update:

```bash
node scripts/aipa-update.mjs --root /absolute/path/to/my-aipa --artifact . --framework-only
```

Review the target version, source, compatibility and managed file changes. Then apply the same plan:

```bash
node scripts/aipa-update.mjs --root /absolute/path/to/my-aipa --artifact . --framework-only --apply
```

The controlled updater replaces managed framework files and preserves `user-space/`. It can refuse an unknown baseline, local framework edits, incompatible formats or active locks. Resolve the reported condition before retrying; do not bypass it by copying files.

Restart Hub and reload your host's AIPA instructions after updating. Hub software updates separately. For interrupted-update recovery, Git/package sources and compatibility rules, see [release and update guidance](RELEASE.md).

## Use multiple devices

Your initialized instance is an independent Git repository. You may add your own **private** remote:

```bash
git -C /absolute/path/to/my-aipa remote add origin <your-private-repository-url>
```

Review tracked files and ignore rules before pushing. Keep credentials, machine-local configuration and runtime state out of Git. On another device, restore or clone the existing private instance; do not initialize a different instance over it. See the [restore guide](RELEASE.md#restore-on-another-device).

## Repository roles

| Repository | Responsibility |
|---|---|
| [Origin](https://github.com/StriveJ/artificial-intelligence-origin-agent) | Authoritative Core source, templates, build tools and tests |
| Personal (this repository) | Generated public foundation, installers and integrity manifest |
| [Hub](https://github.com/StriveJ/artificial-intelligence-personal-agent-hub) | Web access, main/sub services, scheduling and managed Hub updates |
| Your private instance | Your profile, privacy rules, memories, skills and project records |

Propose reusable framework changes in Origin and Hub changes in Hub. Do not edit this generated foundation in place of its source.

## Privacy and license

External models, search and synchronization follow your authorization and instance privacy rules. A configured key does not authorize sending all files. Never publish your personal instance, conversations, credentials or runtime configuration in these public repositories.

Original code and documentation use [Apache License 2.0](LICENSE), including its patent grant. Third-party components retain their licenses. Your private instance data remains yours.
