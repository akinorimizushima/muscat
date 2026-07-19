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

- No known boundary concern remains. The controller now owns session containment, including cross-document node checks, so the demo no longer recognizes editor-private selectors.

## Boundary Follow-up

- Added `RichTextController.contains(target)` without adding a public symbol; the public export count remains exactly three and generated declarations remain Tiptap-free.
- RED: package tests failed to compile because `contains` did not exist, while the browser boundary assertion found `.rich-text-menu` and `.ProseMirror` in served demo source.
- GREEN: package tests cover editor and menu descendants in the main document and an iframe document, outside targets, idle state, and disposed/finished state.
- The implementation checks `target` against the active element's owner-window `Node`, avoiding cross-realm `instanceof` failures.
- Demo pointer and focus lifecycle handling now calls `richTextController.contains(event.target)` with no private selector coupling.
- Full browser verification exposed that a pointer on the selected canvas-node wrapper sits outside the package-owned editor element and could prematurely finish editing before resize suppression. The demo now separately recognizes its own selected `[data-node-id]` boundary for pointer handling without reintroducing editor-private selectors.
- `pnpm --filter @muscat/dom test:browser --grep "package boundary|suppresses regular node dragging" --workers=1`: 2 tests passed after the application-boundary fix.
- `pnpm --filter @muscat/rich-text test:unit`: 2 files and 6 tests passed.
- `pnpm --filter @muscat/dom test:browser --grep "package boundary|formats a selected range|adopts rich text styles|nested links" --workers=1`: 5 tests passed.
