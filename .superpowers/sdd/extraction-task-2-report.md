# Extraction Task 2 Report

## Status

- The demo consumes `createRichTextController` only from the public `@muscat/rich-text` entry point.
- Removed demo ownership of Tiptap, Floating UI, and happy-dom dependencies and imports.
- Deleted the duplicated controller, menu, stylesheet, unit tests, and Vitest configuration.
- Retained only application-specific canvas editing CSS in the demo stylesheet.

## TDD Evidence

- Added browser startup coverage that opens a real rich-text session through the demo and verifies the legacy `rich-text-editor.ts` and `rich-text-menu.ts` source paths are no longer served as source modules.
- RED: the initial boundary run found the legacy module at HTTP 200. Vite uses an HTML SPA fallback for absent files, so the final assertion distinguishes served source from `text/html` fallback rather than relying on 404 status.
- GREEN: `pnpm --filter @muscat/dom test:browser --grep "package boundary" --workers=1` passed 1 test after extraction.

## Verification

- `pnpm --filter @muscat/dom test:browser --grep "formats a selected range|adopts rich text styles|nested links"`: 4 tests passed, covering regular formatting, iframe formatting and style adoption, and standalone-anchor link validity.
- `pnpm --filter @muscat/demo typecheck && pnpm --filter @muscat/demo build`: passed; Vite transformed 80 modules.
- `pnpm check`: formatting passed on 63 files, lint passed with warnings denied, and core/DOM/rich-text/demo typechecks passed.
- `pnpm test`: 9 test files and 23 unit tests passed (core: 6 files/12 tests; DOM: 1 file/7 tests; rich-text: 2 files/4 tests).
- `pnpm test:browser`: 44 browser tests passed.
- `pnpm build`: core, DOM, rich-text, and demo builds passed; the demo transformed 80 modules.
- Static search found no direct `@tiptap`, `@floating-ui`, or `happy-dom` references in `apps/demo`.

## Files

- Modified `apps/demo/package.json`, `apps/demo/tsconfig.json`, and `apps/demo/src/main.ts` to consume the package boundary.
- Deleted `apps/demo/src/rich-text-editor.ts`, `apps/demo/src/rich-text-menu.ts`, `apps/demo/src/rich-text.css`, `apps/demo/src/rich-text-editor.test.ts`, and `apps/demo/vitest.config.ts`.
- Modified `packages/dom/test/browser/specs/editor.spec.ts` with the package-boundary regression.
- Regenerated `pnpm-lock.yaml`.

## Concerns

- `main.ts` still recognizes `.rich-text-menu` and `.ProseMirror` while deciding whether pointer/focus events are inside the active application session. This is application lifecycle integration rather than editor implementation or styling, and removing it would regress outside-click behavior without a replacement public containment API.
