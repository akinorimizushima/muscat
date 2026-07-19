# Extraction Task 3 Report

## Result

Documented `@muscat/rich-text` as the optional headless editing adapter and added automated workspace ownership checks without duplicating the existing public declaration graph/export tests.

## RED/GREEN

### RED

Added `workspace-boundary.test.ts` with two focused contracts:

- README documents the public package and private Tiptap boundary.
- Direct editor-library dependencies/imports are owned only by `packages/rich-text`, while the demo imports `@muscat/rich-text`.

The first run failed on the missing README package documentation. The ownership assertion already passed against the completed extraction.

### GREEN

After updating the README:

```text
pnpm --filter @muscat/rich-text test  PASS (8/8 tests, 3 files)
```

Existing declaration tests continue to verify the exact three-symbol public API and recursively scan all declarations reachable from `dist/index.d.ts`. The new test covers repository-level dependency/import ownership and documentation only.

## Files

- `README.md`
- `packages/rich-text/src/workspace-boundary.test.ts`
- `.superpowers/sdd/extraction-task-3-report.md`

## Ownership Inspection

The required manifest scan found `@tiptap/*` and `@floating-ui/dom` only in `packages/rich-text/package.json`.

The required source scan found Tiptap imports only in:

- `packages/rich-text/src/rich-text-editor.ts`
- `packages/rich-text/src/rich-text-menu.ts`
- `packages/rich-text/src/rich-text-editor.test.ts`

There were no direct editor-library imports or dependencies in the demo, core, or DOM package. `apps/demo/src/main.ts` imports `createRichTextController` from `@muscat/rich-text`.

## Final Verification

```text
pnpm format        PASS (64 files)
pnpm check         PASS (format, lint, 4 typecheck projects)
pnpm test          PASS (27 tests: core 12, dom 7, rich-text 8)
pnpm test:browser  PASS (44 tests)
pnpm build         PASS (core, dom, rich-text, demo)
git diff --check   PASS
```

Expected Playwright server warnings only: `NO_COLOR` is ignored when `FORCE_COLOR` is set.

## Self-Review

- README identifies the adapter as optional and headless.
- README states Tiptap is private and the demo consumes only Muscat-owned APIs.
- Ownership checks recursively scan runtime TypeScript sources outside `packages/rich-text`, while avoiding lockfiles, generated output, historical plans, and the test's own forbidden strings.
- Declaration checks remain centralized in `public-declarations.test.ts`; no redundant declaration grep was added.
- No production API or dependency metadata changed in Task 3.

## Concerns

- Historical design/plan documents mention Tiptap by design and are excluded from ownership enforcement.

## Commit

- Recorded in the task response because a commit cannot contain its own SHA.

## Ownership Guard Follow-Up

### RED

Added syntax fixtures for default imports, named imports, side-effect imports, named re-exports, star re-exports, and dynamic `import()`, plus a temporary workspace containing a newly configured package with forbidden dependency and dynamic-import bypasses.

The legacy guard failed three focused cases:

```text
side-effect import     NOT DETECTED
dynamic import()       NOT DETECTED
new workspace package NOT DISCOVERED
```

### GREEN

- Parse the `packages` section of `pnpm-workspace.yaml` and recursively discover `package.json` files under every configured workspace root.
- Exclude `node_modules` and `dist` during discovery.
- Inspect dependency, dev, peer, and optional dependency sections for `@tiptap/*` and `@floating-ui/*` ownership.
- Recursively scan runtime TS/JS modules in every package except `@muscat/rich-text`, excluding tests, specs, declaration files, generated output, and dependencies.
- Use a focused lexical scanner that skips comments, ordinary quoted strings, and template literals, then recognizes static imports, side-effect imports, export-from forms, and string-literal dynamic imports.
- Verify a newly configured synthetic package is discovered and both its manifest dependency and dynamic import are reported.

Updated verification:

```text
pnpm --filter @muscat/rich-text test  PASS (16/16)
pnpm check                            PASS (4 typechecks)
pnpm test                             PASS (35 tests: core 12, dom 7, rich-text 16)
pnpm build                            PASS (4 projects)
git diff --check                      PASS
```

No additional dependency was introduced for the ownership guard.
