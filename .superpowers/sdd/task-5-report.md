# Task 5 Verification Report

## Status

- Added explicit desktop (`1280x800`) and mobile (`390x844`) Bubble Menu viewport coverage at the default, top-left, and bottom-right canvas positions.
- Added keyboard-only traversal coverage for all eight toolbar buttons and all three link-form controls.
- Verified visible computed focus outlines on every toolbar button, the URL input, Apply link, and Remove link; link application to the preserved full selection; and focus return to Tiptap's `.ProseMirror` editor.
- Verified the expanded toolbar and every visible control remain inside both the viewport and toolbar, with pairwise non-overlapping control rectangles at both tested viewport sizes.
- Manual mobile verification exposed stale absolute positioning after the link form expanded. The Bubble Menu now uses fixed/top positioning with offset, flip, shift, and inline handling, and receives `updatePosition` meta after the form expands or collapses.

## Automated Verification

- `pnpm --filter @muscat/dom test:browser -- -g "viewport|keyboard"`: the literal forwarded `--` caused Playwright to run the whole browser suite; new cases passed, while one existing scroll-overlay case failed once and passed on the complete rerun.
- `pnpm --filter @muscat/dom test:browser -g "viewport|supports keyboard traversal" --workers=1`: 3 passed.
- `pnpm format`: completed on 54 files; formatter-only changes were required in the implementation plan and `packages/core/src/commands.ts`.
- `pnpm check`: format check, lint, and typechecks for core, DOM, and demo passed with no warnings from the checks.
- `pnpm test`: 7 test files and 19 unit tests passed (core: 6 files/12 tests; DOM: 1 file/7 tests).
- Initial `pnpm test:browser`: 31 browser tests passed. After review hardening added four edge cases, the full suite passed 35 browser tests.
- `pnpm build`: core TypeScript build, DOM TypeScript build, and demo Vite build passed; Vite transformed 78 modules.
- `git diff --check`: passed.

## Visual Verification

- `pnpm dev -- --port 5173 --strictPort` started Vite at `http://127.0.0.1:5175/`; ports 5173 and 5174 were already occupied, and the forwarded literal `--` prevented strict-port enforcement.
- Desktop `1280x800` was manually inspected before the final positioning change: the toolbar was visible, controls were `32x32`, no controls overlapped, and the menu remained within the viewport. Automated default/top-left/bottom-right edge coverage is authoritative for desktop behavior after the final code changes.
- Mobile `390x844` was manually inspected after the final positioning and contrast changes: the fixed menu occupied `x=0..374`, all 11 visible controls were within the viewport with no pairwise overlaps, and Apply link/Remove link rendered as `rgb(37, 32, 25)` on `rgb(255, 253, 247)`.
- A fresh in-app browser tab after `f6f0ac8` had no console warnings or errors.
- Desktop and mobile screenshots were observed in-app but were not saved as repository artifacts.
- The temporary demo server was stopped before completion.

## Files

- `.superpowers/sdd/task-5-report.md`: this report.
- `apps/demo/src/rich-text-editor.ts`: fixed/top Floating UI positioning with offset, flip, shift, and inline handling.
- `apps/demo/src/rich-text-menu.ts`: Bubble Menu position updates after link-form expansion and collapse.
- `packages/dom/test/browser/specs/editor.spec.ts`: viewport and keyboard regression coverage.
- `docs/superpowers/plans/2026-07-19-tiptap-rich-text.md`: formatter-only changes.
- `packages/core/src/commands.ts`: formatter-only changes.

## Concerns

- Desktop manual inspection preceded the final positioning change; the current desktop result is established by automated edge and geometry coverage rather than a post-change saved screenshot.
- Tiptap continues to use its paragraph schema temporarily while editing phrasing-only hosts. Browser coverage confirms committed/exported heading HTML contains no invalid paragraph wrapper; no visual or behavioral defect was observed in automated verification.

## Review Follow-up

- Added computed visible-outline assertions for the URL input, Apply link, and Remove link after reaching each through keyboard traversal.
- Added geometry assertions for all eight toolbar buttons, Apply link, Remove link, and the URL input after form expansion at `1280x800` and `390x844`.
- Each control is asserted inside the viewport and aggregate toolbar. Every control rectangle is compared pairwise; touching edges are allowed, overlapping rectangles fail.
- Confirmed RED with the mobile default-position test: expected fixed positioning, received absolute positioning.
- `pnpm --filter @muscat/dom test:browser -g "viewport|supports keyboard traversal" --workers=1`: 7 passed after the positioning fix.
- `pnpm test:browser`: 35 passed after the positioning fix.
- `pnpm check`: formatting, lint, and all three workspace typechecks passed after the positioning fix.

## Visual Contrast Follow-up

- Post-positioning manual verification at `390x844` confirmed the fixed toolbar at `x=0..374`, all 11 controls inside the viewport, and no overlaps.
- The same screenshot exposed unreadable Apply link and Remove link labels caused by inherited white text on a white background.
- Added a computed WCAG contrast regression for both action buttons. RED measured `1.02:1` against the required `4.5:1` minimum.
- Link action buttons now have explicit dark text on a light background, a visible green focus outline, and an explicit readable disabled treatment without reduced opacity.
- `pnpm --filter @muscat/dom test:browser -g "viewport|supports keyboard traversal" --workers=1`: 7 passed after the contrast fix.

## Console Warning Follow-up

- Manual console verification exposed Tiptap's `Duplicate extension names found: ['underline']` warning on each rich-text session start.
- Added browser coverage that captures console warnings during editing startup and rejects duplicate-extension warnings.
- RED captured the exact duplicate `underline` warning.
- StarterKit's bundled underline is now disabled while the explicit Underline extension remains configured for the toolbar workflow.
- `pnpm --filter @muscat/dom test:browser -g "duplicate extension warnings|formats a selected range" --workers=1`: 3 passed after the fix, covering warning-free startup plus regular and iframe formatting.

## Final Post-f6f0ac8 Gate

- Starting HEAD: `f6f0ac8` with a clean worktree.
- `pnpm check`: passed; formatting matched all 54 files, lint passed with warnings denied, and core/DOM/demo typechecks passed.
- `pnpm test`: 7 test files and 19 unit tests passed (core: 6 files/12 tests; DOM: 1 file/7 tests).
- `pnpm test:browser`: 36 browser tests passed.
- `pnpm build`: core and DOM TypeScript builds passed; demo Vite build passed with 78 modules transformed.
- `git diff --check`: passed.
- `git status --short`: empty before this report-only update.
