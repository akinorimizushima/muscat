# Task 3 Report: Tiptap Rich Text Session

## Status

Implemented and verified the vanilla Tiptap session and selection-anchored Bubble Menu for regular canvas nodes.

## RED Evidence

- `pnpm --filter @muscat/dom test:browser -- -g "formats a selected range in a regular node"`
  - Failed at `getByRole("toolbar", { name: "Text formatting" })` because the toolbar did not exist.
- Added a regression assertion that editing renders one copy of the node content.
  - Failed with `Expected: "Element 1"`, `Received: "Element 1Element 1"` before clearing the host element prior to Tiptap mount.
- Full-suite verification exposed an intermittent drag continuation after an outside editing click.
  - Failed with the node moving 60px; fixed by consuming the pointerdown that ends an active edit session.

## GREEN Evidence

- `pnpm --filter @muscat/dom test:browser`: 20 passed.
- `pnpm exec oxfmt --check apps/demo/package.json apps/demo/src/main.ts apps/demo/src/style.css apps/demo/src/rich-text-editor.ts apps/demo/src/rich-text-menu.ts packages/dom/test/browser/specs/editor.spec.ts`: clean.
- `pnpm lint`: clean.
- `pnpm --filter @muscat/demo typecheck`: clean.
- `pnpm --filter @muscat/demo build`: clean.
- Drag-suppression stability check with `--repeat-each=5`: 5 passed.

## Files

- `apps/demo/src/rich-text-editor.ts`: Tiptap session lifecycle, sanitization, commit/cancel, Bubble Menu plugin.
- `apps/demo/src/rich-text-menu.ts`: accessible toolbar, command state, alignment, and safe link form.
- `apps/demo/src/main.ts`: regular-node integration and editing interaction guards.
- `apps/demo/src/style.css`: compact floating toolbar and editing states.
- `apps/demo/package.json`, `pnpm-lock.yaml`: exact Tiptap v3 and Floating UI dependencies.
- `packages/dom/test/browser/specs/editor.spec.ts`: formatting, links, selection, cancel, undo/redo, duplicate-content, and drag tests.

## Self-review

- Tiptap remains entirely inside `apps/demo`; core and DOM contracts are consumed without framework coupling.
- Entry and exit HTML are sanitized, and the normalized Tiptap initial HTML prevents no-op commits.
- Editor and menu teardown are idempotent because the session is cleared before destruction.
- Toolbar controls use stable accessible names, titles, pressed/disabled state, and selection-preserving mouse handling.
- Existing regular drag/resize and iframe import/edit behavior remains covered by the full browser suite.

## Concerns

- `pnpm check` is not globally clean because pre-existing formatting issues remain in `docs/superpowers/plans/2026-07-19-tiptap-rich-text.md` and `packages/core/src/commands.ts`. Task files pass targeted formatting, full lint, and relevant typecheck.
- Toolbar glyphs are text-based because the demo has no icon library and this task intentionally does not add an unrelated icon dependency.

## Commit

- Pending at report creation; populated after commit in the task response.
