# AIPA System Content and Boundary Constraints

> This file defines mandatory implementation boundaries. It takes precedence in implementation-boundary conflicts; `framework.md` takes precedence in positioning conflicts.

## 1. System Definition

AIPA (Artificial Intelligence Personal Agent) has two layers:

- **Origin (foundation)**: a public, abstract foundation without an individual's subjective views; the starting point for personal agents.
- **Personal (instance)**: a private instance deployed from the foundation, carrying personal information, memory, and skills, with a local-first approach.

Three positioning decisions are immutable:

| Decision | Meaning |
|---|---|
| Files are authoritative; Core has no third-party package dependencies | Personal content and rules are held in files. Core mechanical scripts require Node.js; installation, updates, and Git synchronization require Git. Core scripts use only Node built-in and local modules. Hub, host executors, and optional services declare their own dependencies; Core's dependency boundary does not describe the whole system. |
| Local first; external capabilities require explicit authorization | Personal information and local control state reside in the instance and local runtime directories according to ownership. Hosts invoke external models, online retrieval, push delivery, and remote synchronization only within the user's existing authorization and the applicable privacy and permission rules. The public framework contains no personal information. A configured network service does not authorize transmitting all information. |
| Abstract, neutral foundation | The foundation contains no individual's subjective views or concrete personal/project identifiers. Legacy compatibility reads must be explicitly named and must not become the default destination for new information. |

## 2. Two Operating Modes

The system has only two operating modes:

| | Maintenance (`maintain`) | Consumption (`consume`) |
|---|---|---|
| Recognition | The build repository contains `studio/` and its `CLAUDE.md` | The personal instance contains `AIPA-MANIFEST.yaml` |
| Purpose | Maintain the framework itself | Personal daily use |
| Information flow | Changes flow downstream to instances | Findings may be reported; they must not update the foundation in reverse |

## 3. Three Layers and Three Repositories

The Origin build repository has three layers. Its output is the foundation repository, from which personal instances are deployed:

- **`studio/` (construction)**: maintainer workspace, internal scripts/documents/tests; not distributed.
- **`product/` (authoritative output source)**: published as the foundation repository (`artificial-intelligence-personal-agent`) for users to clone and deploy.
- **`lab/` (simulation and testing)**: isolated end-to-end testing, including real test remotes (`aipa-test`).

## 4. Single Sources of Truth

| Type | Authoritative source |
|---|---|
| Overall constraints | This file, `core-space/CONSTRAINTS.md` |
| Framework version | `ORIGIN-MANIFEST.yaml` and `VERSION` |
| Abstract framework | `framework.md` |
| Built-in hard boundaries | `core-space/policy.md` |
| Capability seam | `seam.yaml` |
| Tool gates | `tools.yaml` |
| Industry mapping | `industry-map.yaml` |
| Public cross-host contracts | `core-space/shared-contracts.md` |

All equivalent content elsewhere is derived and must not be independently maintained as another primary rule.

## 5. Boundary Enforcement Layers

Two layers address two kinds of boundary violations:

- **Construction boundaries** constrain maintainers and prevent malicious foundation content: `aipa-content-policy` checks hardcoded secrets/private keys/eval; `aipa-origin-abstract-check` checks personal identifiers; `aipa-validate-origin` checks structure.
- **Product boundaries** constrain use:
  - Kernel boundaries: `core-space/policy.md`, not editable by the individual, replaced by `pull-origin`.
  - User-defined boundaries: `user-space/values.yaml`, defined by the individual, never touched by `pull-origin`.

## 6. File Ownership and Synchronization

| Category | Location | Owner | Synchronization |
|---|---|---|---|
| Framework area | `core-space/` | Framework | Replaced by `pull-origin` |
| Personal area | `user-space/` | Individual | Never touched by `pull-origin` |
| Entry shells | `AGENTS.md`, `.claude/commands/aipa.md` | Framework | Synchronized by `pull-origin` |

## 7. Permissions and Approval

| Role | Construction | Foundation | Approval |
|---|---|---|---|
| Maintainer | Write | Read-only; pipeline writes | High-risk changes require review by another maintainer |
| Contributor | Through the contribution pipeline | Read-only | Maintainer review |
| User | Read-only | Read-only clone | None |

Framework code returns through patches preserving complete `product/` paths and through PRs. Abstracted personal assets carry provenance in a contribution manifest (`source` / `abstracted` / `review`) and enter `product/` only after approval. Direct administrator development and contributor fork/PR workflows use the same quality gates. Daily use of a personal instance requires no upstream publishing permission. A textual roster match is not platform authentication. Passing local tests does not waive another maintainer's review of high-risk changes.

## 8. Conflict Resolution Priority

1. Safety, confidentiality, and hard boundaries (always highest).
2. This file (overall constraints).
3. Framework structure.
4. Project exceptions (override general rules only with an explicit reason).

## 9. Maintenance Scope

- This file contains content scope, system boundaries, and overall constraints only. Detailed procedures belong in skills/playbooks; detailed vocabulary belongs in content-policy.
- Modifying this file is a high-risk maintenance change under section 7 and requires approval.
