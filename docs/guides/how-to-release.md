# How to Release

This guide covers the two release tracks for the `@aurite-ai/kai` npm package: **dev releases** (continuous, automated) and **stable releases** (manual, to `latest`).

## Overview

| Track | Branch | npm tag | Trigger | Version format |
|-------|--------|---------|---------|----------------|
| Dev | `develop` | `dev` | Push to `develop` | `0.2.0-dev.0` |
| Stable | `main` | `latest` | Manual `workflow_dispatch` | `0.2.0` |

The version source of truth is [apps/mcp/package.json](../../apps/mcp/package.json). The CI workflows read this file to determine base versions.

---

## Dev Releases (automatic)

Every push to `develop` triggers the [Version and Publish MCP](.github/workflows/version-and-publish.yml) workflow automatically. No manual steps required.

To push to `develop` **without** triggering a dev release, include `[skip ci]` anywhere in the commit message:

```sh
git commit -m "chore: update README [skip ci]"
```

When merging a PR into `develop` via GitHub, you can also add `[skip ci]` at the time of merge — edit the merge commit message in the merge dialog before confirming.

**What happens:**
1. CI reads the base version from `apps/mcp/package.json` (e.g. `0.2.0`)
2. CI queries npm for existing `0.2.0-dev.X` versions and increments X
3. A git tag `v0.2.0-dev.X` is created and pushed
4. The package is built, bundled, and published to npm with the `dev` tag
5. No GitHub release is created

**To install a dev release:**
```sh
npm install @aurite-ai/kai@dev
```

---

## Stable Releases (manual)

Stable releases require three manual steps: opening a release PR, merging it, then dispatching the publish workflow.

### Step 1 — Bump the version

Update the version in [apps/mcp/package.json](../../apps/mcp/package.json):

```sh
cd apps/mcp
npm version patch   # 0.2.0 → 0.2.1
# or: npm version minor / major
```

Commit and push to `develop`.

> The CI will guard against re-publishing an already-published version and fail loudly if you forget this step.

### Step 2 — Create a release PR

Run the script from the repo root:

```sh
./scripts/create-release-pr.sh
```

This script:
- Fetches latest refs from `origin`
- Detects all PRs merged into `develop` but not yet in `main` (handles both standard merge commits and squash merges)
- Opens a PR titled `Release: develop → main (YYYY-MM-DD)` with a list of included PRs
- Exits early if a release PR already exists or if there's nothing to release

Options:
```
--draft     Open the PR in draft mode
--dry-run   Print the PR title and description without creating the PR
```

### Step 3 — Merge the release PR

Merge the PR into `main`. Merging does **not** automatically publish — proceed to step 4.

### Step 4 — Dispatch the publish workflow

Go to **Actions → Version and Publish MCP → Run workflow** on the `main` branch (or use the CLI):

```sh
gh workflow run version-and-publish.yml --ref main
```

The workflow will:
1. Read the version from `apps/mcp/package.json`
2. Check that this version has **not** already been published to npm (fails if it has)
3. Create and push a git tag `vX.Y.Z`
4. Build and publish the package to npm with the `latest` tag and provenance attestation
5. Create a **draft** GitHub release with auto-generated release notes

### Step 5 — Publish the GitHub release

After the workflow completes, go to the GitHub Releases page, review the draft release, and publish it.

---

## How the build works

The publish workflow runs these steps on the `apps/mcp` package:

```sh
pnpm --filter @aurite-ai/kai build   # TypeScript compilation (tsc)
pnpm --filter @aurite-ai/kai bundle  # esbuild → dist/kai-mcp.cjs
```

The bundle is a single CommonJS file targeting Node 20+, with all dependencies inlined. Templates are copied into `dist/templates/`. The final npm package includes:

- `dist/kai-mcp.cjs` — the server bundle
- `dist/kai-mcp.cjs.map` — source map
- `dist/templates/` — template files
- `README.md`

---

## Workflow files

| File | Purpose |
|------|---------|
| [.github/workflows/version-and-publish.yml](../../.github/workflows/version-and-publish.yml) | Orchestrator: resolves version, tags, calls publish and release workflows |
| [.github/workflows/publish-npm.yml](../../.github/workflows/publish-npm.yml) | Reusable: builds and publishes to npm |
| [.github/workflows/create-release.yml](../../.github/workflows/create-release.yml) | Reusable: generates release notes and creates a draft GitHub release |
| [scripts/create-release-pr.sh](../../scripts/create-release-pr.sh) | Creates the develop → main release PR |
| [scripts/generate-release-notes.sh](../../scripts/generate-release-notes.sh) | Generates markdown release notes grouped by PR label |
| [scripts/create-release.sh](../../scripts/create-release.sh) | Creates a GitHub release via the `gh` CLI |

---

## Troubleshooting

**"version X.Y.Z has already been published"**
The version in `apps/mcp/package.json` matches an existing npm release. Bump the version and push to `develop` before merging.

**"No new commits found between main and develop"**
`develop` is already in sync with `main`. There is nothing to release.

**"A PR from develop → main already exists"**
Close or merge the existing release PR before running `create-release-pr.sh` again.
