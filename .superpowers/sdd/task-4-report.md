# Task 4 Report: Iframe Editing Through the Shared Controller

## Status

Implemented iframe leaf edit delegation through the shared Tiptap controller. The renderer no longer owns a plaintext editor. Rich-content commits target the imported leaf element node, preserve the active Tiptap mount during synchronous document updates, and replace marker-backed children once rich content is authoritative.

## RED Evidence

1. Added `formats a selected range inside imported HTML` and `emits an edit request for a leaf element`.
2. Ran `pnpm --filter @muscat/dom test:browser -g "edit request|formats a selected range inside imported HTML"`.
3. Both tests failed for the intended missing behavior: the iframe had no `Text formatting` toolbar and the harness received no edit-request attributes.
4. Added heading-validity and export assertions after review. The focused test failed with one direct paragraph child under the imported `h2`, proving Tiptap's default paragraph wrapper produced invalid host markup.

## GREEN Evidence

- Focused: `pnpm --filter @muscat/dom test:browser -g "edit request|formats a selected range inside imported HTML"` -> 2 passed.
- Full browser: `pnpm --filter @muscat/dom test:browser` -> 26 passed.
- DOM typecheck: `pnpm --filter @muscat/dom typecheck` -> passed.
- Demo typecheck: `pnpm --filter @muscat/demo typecheck` -> passed.
- Whitespace validation: `git diff --check` -> passed.

## Files

- `packages/dom/src/iframe-renderer.ts`
- `apps/demo/src/main.ts`
- `apps/demo/src/rich-text-editor.ts`
- `packages/dom/test/browser/harness/main.ts`
- `packages/dom/test/browser/specs/iframe-renderer.spec.ts`
- `packages/dom/test/browser/specs/editor.spec.ts`

## Implementation Notes

- Added `IframeEditRequest`, `IframeRendererOptions.onEdit`, and `IframeRenderer.setEditing`.
- Removed iframe renderer plaintext editing and text-node commit behavior.
- Suppressed iframe drag setup while shared rich-text editing is active.
- Delegated imported leaf editing to `RichTextController.start` with the leaf element node ID and `element.innerHTML`.
- Made `syncNodes` render `richContent` exclusively and avoid replacing the active Tiptap mount.
- Kept the bubble menu in `element.ownerDocument`, which is the iframe document for imported content.
- Serialized a single Tiptap paragraph as inline markup for phrasing-only host elements, preventing invalid heading/paragraph nesting in the live iframe and exported HTML.

## Self-review

- Verified imported formatting commits to the element node rather than its marker-backed text child.
- Verified committed rich content does not duplicate the old text child in DOM or export.
- Verified existing iframe selection, scrolling, dragging, and resizing tests remain green.
- Verified the edit-request harness observes the exact leaf element and initial HTML.
- Tightened active-mount protection so a passive `onEdit` observer does not block later synchronization unless `setEditing(true)` was called.

## Concerns

- Tiptap still uses its block document schema while mounted, so phrasing-only hosts temporarily contain its editor paragraph during the active session. Commit and export are normalized to valid inline host content; a future schema-level inline editor could eliminate the temporary editing-state mismatch.

## Commit

- `feat(dom): support Tiptap editing in iframes` (SHA reported in the final task response).

## Important Findings Follow-up

### RED

- Added `commits an iframe edit on an outside iframe pointer without selecting it`; it failed because the iframe-local pointer never reached the parent document and the edit remained uncommitted.
- Added `cancels an iframe edit with Escape from the link input`; it failed because iframe key events never reached the parent Escape listener and the menu remained mounted.
- Added `invalidates active editing once before reload and dispose`; it failed because neither renderer path notified the shared controller before detaching the iframe document.
- During GREEN verification, the existing regular-node drag suppression test failed deterministically because both parent and controller listeners handled the parent document with different containment boundaries. The controller listener was then restricted to foreign owner documents.

### GREEN

- The shared controller installs pointerdown and Escape listeners on foreign owner documents and removes them before destroying a session.
- An iframe-local outside pointer commits, while its paired click is consumed before it can select or start interaction on another imported node.
- Toolbar/editor pointer events remain interactive and Escape cancels from the iframe link input.
- `IframeRendererOptions.onEditingInvalidated` runs once for an active session before reload, external reconnect, or disposal. Renderer state is cleared before invoking the callback, making repeated cleanup idempotent.
- The demo maps invalidation to `richTextController.finish(true)`, so no detached iframe edit is committed and menu/editor listeners are removed before `srcdoc` replacement or disposal.

### Follow-up Verification

- Focused lifecycle and regression selection: 5 passed.
- Full browser suite: 29 passed.
- DOM and demo typechecks: passed.
- Lint: passed.
- Task-owned format check: passed for all seven files.
- Repository format check still reports two unrelated pre-existing files: `docs/superpowers/plans/2026-07-19-tiptap-rich-text.md` and `packages/core/src/commands.ts`.
- `git diff --check`: passed.

### Follow-up Concerns

- The temporary paragraph schema concern remains unchanged. Committed and exported phrasing-host HTML remains valid and covered by the iframe formatting test.
