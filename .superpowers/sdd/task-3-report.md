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

- Initial implementation: `6258bbe9f9be228b37093c13d23183446e755855`.
- Review fix commit is reported in the task response because its SHA is not known until after this file is committed.

## Review Fix Wave

### RED Evidence

- `playwright test ... -g "Escape is pressed in the link input|outside editor action|no-op outside commit|expanded rich text menu|applies, rejects" --workers=1`
  - 4 failed, 1 passed.
  - Link DOM failed with `target="_blank"` and `rel="noopener noreferrer nofollow"`.
  - Escape in the URL input left the toolbar/session mounted (`Expected: 0`, `Received: 1`).
  - Clicking Add element outside the canvas rendered stale `Element 1` instead of `Committed outside` and left the session active.
  - Outside no-op exit left `stage is-rich-text-editing` set.
- `playwright test ... -g "suppresses regular node dragging" --workers=1 --repeat-each=5`
  - 5 failed before the final pointer-routing fix: resize width changed from 220px to 270px.
  - Root cause was the canvas's old leaf-only session boundary ending editing on node padding, allowing the next resize gesture.

### GREEN Evidence

- `pnpm --filter @muscat/dom test:browser`: 24 passed in 6.2s.
- `pnpm exec oxfmt --check apps/demo/package.json apps/demo/src/main.ts apps/demo/src/style.css apps/demo/src/rich-text-editor.ts apps/demo/src/rich-text-menu.ts packages/dom/test/browser/specs/editor.spec.ts`: all 6 matched files correctly formatted.
- `pnpm lint`: exit 0, no warnings.
- `pnpm --filter @muscat/demo typecheck`: exit 0.
- `pnpm --filter @muscat/demo build`: exit 0, 78 modules transformed.
- `playwright test ... -g "suppresses regular node dragging" --workers=1 --repeat-each=5`: 5 passed after document/canvas pointer routing was unified.

### Review Fixes

- Document capture commits before outside controls mutate or rerender; document focus changes also commit, while the active canvas node and body-appended toolbar/link form remain inside the session.
- Document Escape cancels from the URL input and respects `defaultPrevented`, composition, and Alt-modified events through the existing keyboard guard.
- Tiptap Link rendering explicitly removes `target` and `rel`.
- Tests now cover left/center/right alignment, narrow-selection link preservation, no-op history, outside teardown, link-input cancellation, editing-time drag/resize/overlay suppression, and 390px expanded-toolbar bounds.
- The link form uses full-row flex wrapping and shrinkable controls at narrow viewport widths.

## Final Link Safety Fix Wave

### RED Evidence

- The first synthetic paste test failed for invalid test plumbing: the constructed clipboard event did not insert text (`Expected substring: "ftp://unsafe.example/file"`, `Received: "Element 1"`). It was replaced with real sequential typing through the ProseMirror surface.
- `playwright test ... -g "unsafe typed URI" --workers=1` then produced the valid RED result: the typed `ftp://unsafe.example/file ` became one anchor (`Expected: 0`, `Received: 1`).
- Adding `isAllowedUri` alone remained red because Tiptap v3 StarterKit also registered its default Link extension. Disabling StarterKit's bundled Link made the explicitly configured safe Link extension authoritative.

### GREEN Evidence

- Focused link run: `playwright test ... -g "unsafe typed URI|applies, rejects" --workers=1`: 2 passed in 4.9s.
- `pnpm --filter @muscat/dom test:browser`: 25 passed in 5.6s.
- Targeted `oxfmt --check`: all 6 matched task files correctly formatted.
- `pnpm lint`: exit 0, no warnings.
- `pnpm --filter @muscat/demo typecheck`: exit 0.
- `pnpm --filter @muscat/demo build`: exit 0, 78 modules transformed.

### Final Fixes

- Tiptap Link now delegates URI validation to shared `isSafeRichTextUrl`, preserving its http, https, mailto, tel, relative-path, and fragment allowlist while rejecting unsafe schemes during editing.
- StarterKit's bundled Link is disabled to avoid duplicate extension configuration and default unsafe autolinking.
- The link form uses the same shared validator as Tiptap and DOM sanitization.
- Removed the unconditional Link-button enabled override; its disabled state now follows `editor.can()` like every other toolbar command.
