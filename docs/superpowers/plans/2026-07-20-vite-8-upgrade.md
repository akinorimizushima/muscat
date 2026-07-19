# Vite 8 Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade all direct Vite dependencies in the workspace from Vite 7 to the latest compatible Vite 8 release.

**Architecture:** Keep the existing workspace and Vite configurations unchanged unless a verification command demonstrates an incompatibility. Update the three package manifests and the shared pnpm lockfile as one dependency-only change, then exercise every repository verification path that depends on Vite or TypeScript.

**Tech Stack:** pnpm 11.14.0, Node.js 24.6.0, Vite 8, Vitest, Playwright, TypeScript

## Global Constraints

- Set direct Vite dependencies in `apps/demo`, `packages/core`, and `packages/dom` to `^8.0.0`.
- Regenerate `pnpm-lock.yaml` with pnpm 11.14.0.
- Do not upgrade unrelated dependencies or enable new Vite 8 features.
- Make configuration changes only when a failing verification command proves they are necessary.

---

### Task 1: Upgrade and verify Vite

**Files:**

- Modify: `apps/demo/package.json`
- Modify: `packages/core/package.json`
- Modify: `packages/dom/package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

- Consumes: Existing `vite build`, Vitest, and Playwright integrations.
- Produces: All direct `vite` dependency ranges set to `^8.0.0` and resolved to one Vite 8 release in `pnpm-lock.yaml`.

- [x] **Step 1: Record the pre-upgrade verification baseline**

Run: `pnpm build && pnpm check && pnpm test && pnpm test:browser`

Expected: exit code 0. Any pre-existing failure must be recorded before changing dependencies so it is not attributed to Vite 8.

- [x] **Step 2: Update all direct Vite dependencies and the lockfile**

Run:

```bash
pnpm --filter @muscat/demo --filter @muscat/core --filter @muscat/dom update vite@^8.0.0
```

Expected: the three package manifests contain `"vite": "^8.0.0"`, and pnpm regenerates `pnpm-lock.yaml` without changing unrelated direct dependency ranges.

- [x] **Step 3: Confirm dependency resolution**

Run:

```bash
pnpm --filter @muscat/demo exec vite --version
pnpm --filter @muscat/core exec vite --version
pnpm --filter @muscat/dom exec vite --version
rg -n '"vite"\s*:\s*"\^8\.0\.0"' apps/demo/package.json packages/core/package.json packages/dom/package.json
```

Expected: all version commands print the same `vite/8.x.x` release, and ripgrep reports exactly three manifest matches.

- [x] **Step 4: Run repository verification**

Run: `pnpm build && pnpm check && pnpm test && pnpm test:browser`

Expected: exit code 0 with no build, formatting, lint, type-check, unit-test, or browser-test failures.

- [x] **Step 5: Inspect the dependency-only diff**

Run: `git diff --check && git diff -- apps/demo/package.json packages/core/package.json packages/dom/package.json pnpm-lock.yaml`

Expected: no whitespace errors; changes are limited to Vite 8 and its transitive lockfile resolution.

- [x] **Step 6: Commit the upgrade**

```bash
git add apps/demo/package.json packages/core/package.json packages/dom/package.json pnpm-lock.yaml
git commit -m "chore: upgrade Vite to v8"
```

Expected: a new commit containing only the dependency upgrade files.
