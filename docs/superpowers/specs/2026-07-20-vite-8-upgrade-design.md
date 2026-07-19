# Vite 8 Upgrade Design

## Goal

Upgrade every workspace package that directly depends on Vite from Vite 7 to the latest compatible Vite 8 release.

## Scope

- Change the Vite development dependency in `apps/demo`, `packages/core`, and `packages/dom` to `^8.0.0`.
- Regenerate `pnpm-lock.yaml` with the repository's pinned pnpm version.
- Keep the existing Vite configuration unless verification exposes a Vite 8 incompatibility.
- Do not upgrade unrelated dependencies or adopt new Vite 8 features.

## Compatibility

Vite 8 requires Node.js 20.19+ or 22.12+. The repository pins Node.js 24.6.0, so its declared runtime satisfies the requirement. The existing configurations do not use migration-guide options that require a planned rewrite. Vite 8 replaces Rollup and esbuild internally with Rolldown and Oxc, so production builds and browser-related tests provide the primary compatibility evidence.

## Implementation

Use pnpm to update the three direct Vite dependencies and lockfile together. If Vite 8 reveals an actual configuration or plugin incompatibility, make only the smallest targeted compatibility change and document it in the final handoff.

## Verification

Run formatting, linting, type checking, unit tests, browser tests, and production builds through the repository scripts. Inspect the resulting dependency graph to confirm all three direct references resolve to Vite 8.
