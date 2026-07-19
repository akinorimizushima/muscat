# Extraction Task 1 Report

## Result

Created the reusable `@muscat/rich-text` ESM package with package-private Tiptap implementation, Muscat-owned public controller types, an internal stylesheet module, and lifecycle tests.

## RED/GREEN

### RED

```text
pnpm --filter @muscat/rich-text test
No projects matched the filters
```

The workspace package and entry point did not exist.

### GREEN

```text
pnpm --filter @muscat/rich-text test       PASS (2/2 tests)
pnpm --filter @muscat/rich-text typecheck  PASS
pnpm --filter @muscat/rich-text build      PASS
```

The build emitted `dist/index.js`, `dist/index.d.ts`, and source declarations/maps. Inspection of `dist/index.d.ts` and `dist/index.js` found no Tiptap, ProseMirror, menu, style, dependency-seam, or `?inline` exposure.

## Files

- `packages/rich-text/package.json`
- `packages/rich-text/tsconfig.json`
- `packages/rich-text/tsconfig.build.json`
- `packages/rich-text/vitest.config.ts`
- `packages/rich-text/src/index.ts`
- `packages/rich-text/src/rich-text-editor.ts`
- `packages/rich-text/src/rich-text-menu.ts`
- `packages/rich-text/src/rich-text-styles.ts`
- `packages/rich-text/src/rich-text-editor.test.ts`
- `pnpm-lock.yaml`

## Final Gate

```text
pnpm format        PASS (67 files)
pnpm check         PASS (format, lint, 4 typecheck projects)
pnpm test          PASS (23 tests: core 12, dom 7, demo 2, rich-text 2)
pnpm test:browser  PASS (43 tests)
pnpm build         PASS (core, dom, demo, rich-text)
git diff --check   PASS
```

## Self-Review

- Public `src/index.ts` exports only `createRichTextController`, `RichTextController`, and `RichTextStartOptions`.
- The public factory wrapper accepts only controller callbacks; the package-private implementation retains the injectable Tiptap factory used by exception tests.
- Tiptap, Bubble Menu, extensions, Floating UI, and `@muscat/dom` are package dependencies rather than demo assumptions.
- The build has no Vite CSS import. `RICH_TEXT_STYLES` is an internal compiled string.
- Reference-counted style adoption now runs for every owner document, including the main document, and removes only the exact controller-owned style node at zero references.
- The moved throwing-commit test additionally verifies main-document style creation and cleanup.
- TypeScript path mapping is limited to `@muscat/dom` for source typechecking; build resolution uses package dependencies.

## Concerns

- Demo sources intentionally remain unchanged and duplicated in this bounded extraction task; switching demo consumption and deleting old implementation/assets belongs to the later integration task.
- Internal implementation declarations are emitted under `dist`, as with existing workspace package builds, but package `exports` exposes only `dist/index` and blocks public subpath imports.

## Commit

- Recorded in the task response because a commit cannot contain its own SHA.
