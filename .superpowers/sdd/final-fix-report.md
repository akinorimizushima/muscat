# Final Fix Report

## Scope

- Made rich-content serialization aware of inline-only host content models, including imported leaf `p` and standalone `a` elements.
- Adopted the demo rich-text stylesheet into foreign owner documents with reference-counted, idempotent cleanup.
- Made commit and initialization teardown exception-safe and added the missing-node dispatch guard.
- Kept compact accessible text glyph controls as the documented minor residual; no icon dependency or hand-drawn SVG was added.

## TDD Evidence

### RED

- `pnpm --filter @muscat/demo test`
  - 2 tests failed as expected.
  - Throwing commit did not propagate because the editor content had not yet been changed through a testable editor seam.
  - Injected initialization failure did not throw because no dependency boundary existed.
- Initial focused browser run exposed missing inline-host coverage and absent iframe style behavior. After correcting two strict-locator test defects, the behavioral failures drove the serializer/style changes.

### GREEN

- `pnpm --filter @muscat/demo test`: 2/2 controller tests passed.
- `pnpm --filter @muscat/dom test:browser --grep 'imported leaf|adopts rich text styles'`: 3/3 focused browser tests passed.
- `pnpm --filter @muscat/dom test:browser --grep 'active imported node is removed'`: 1/1 passed.

## Final Verification

Fresh sequential run:

```text
pnpm format          PASS (57 files)
pnpm check           PASS (format check, lint, 3 typecheck projects)
pnpm test            PASS (21 tests: core 12, dom 7, demo 2)
pnpm test:browser    PASS (41 tests)
pnpm build           PASS (core, dom, demo)
git diff --check     PASS
```

Expected Playwright web-server warnings only: `NO_COLOR` is ignored when `FORCE_COLOR` is set.

## Self-Review

- Serialization unwraps Tiptap's single paragraph only for hosts whose rich-text content must remain inline. Flow-content hosts retain valid paragraph children.
- The iframe stylesheet source is shared with the parent build through `rich-text.css` and Vite's `?inline` import; CSS is not duplicated in TypeScript.
- Foreign-document style adoption is reference counted and teardown removes only the injected rich-text style after the final user releases it.
- `finish()` clears session identity before callbacks and always disconnects listeners, destroys editor/menu, releases styles, and signals `editing=false`; commit errors propagate after cleanup.
- Startup restores sanitized original DOM and `editing=false` when editor, menu, or Bubble Menu registration fails.
- Main commit checks that the node still exists before dispatch.
- Browser coverage verifies formatted and cancelled leaf hosts, no nested paragraph/duplicate export, computed iframe dimensions/colors/contrast/focus, responsive containment, style cleanup/re-adoption, and active-node removal.

## Concerns

- Formatting controls remain accessible compact text glyphs. Replacing them with a maintained icon library is intentionally deferred as disproportionate to this correctness pass.
- The demo's overall application shell retains its pre-existing desktop minimum width; iframe menu containment is verified against its actual owner-document viewport at a 390x844 top-level viewport.

## Commits

- `1feed7dd160e85c4530016ae1612a58fd5b283c1` - implementation, tests, verification report.
- The report metadata follow-up commit is recorded in the task response because a commit cannot contain its own SHA.

## Final Review Follow-Up

### Additional fixes

- Standalone anchor hosts now omit the Link extension for that editing session and expose the Link toolbar control as disabled. Bold and other non-link formatting remain available, while typed URL text cannot become an inner anchor.
- Foreign-document style ownership now uses a `WeakMap` entry containing the exact controller-created style node and its reference count. The controller never queries or adopts imported nodes sharing the public data attribute and removes only its exact node at zero references.

### Additional RED/GREEN evidence

- RED: `pnpm --filter @muscat/dom test:browser --grep 'nested links|colliding imported'` failed 2/2: anchor Link was enabled and only one colliding style existed because the imported node was adopted.
- GREEN: the same focused command passed 2/2 after host capability and exact-node ownership changes.

### Updated final gate

```text
pnpm format          PASS (57 files)
pnpm check           PASS (format check, lint, 3 typecheck projects)
pnpm test            PASS (21 tests: core 12, dom 7, demo 2)
pnpm test:browser    PASS (43 tests)
pnpm build           PASS (core, dom, demo)
git diff --check     PASS
```

The two new browser tests verify disabled anchor-host link UI, typed URL behavior, bold preservation, a single exported anchor, real computed iframe menu styles in the presence of a colliding imported marker, exact imported-node preservation, teardown, and re-adoption.
