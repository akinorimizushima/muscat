# Extraction Final Report

## Active-Session Switching

The public rich-text controller now commits and fully finishes an active session before mounting a requested replacement session. The implementation reuses the existing `finish(false)` boundary, preserving one commit path and its exception-safe cleanup.

## TDD Evidence

### RED

Three new controller tests initially failed because `start()` returned immediately when a session existed:

- Same-document switch did not commit or mount the second host.
- Cross-document switch did not release the first document or mount the second host.
- Throwing first-session commit did not run, so no error propagated and the requested behavior was undefined.

The initial RED run reported the expected zero commit calls and missing thrown error. One existing style assertion also failed only because the intentionally failed same-document RED test exited before disposal and retained its reference.

### GREEN

Changed active `start()` behavior from an early return to `finish(false)`. Because `finish` clears session identity before commit and cleans editor, menu, owner-document listeners, and the exact style reference in `finally`:

- Successful commit cleanup completes before the second editor is constructed.
- A commit error propagates after cleanup and aborts second-session construction.
- `contains()` observes only the newly active session.
- Same-document style ownership returns to exactly one active node.
- Cross-document style ownership moves from the first document to the second.

Focused result:

```text
pnpm --filter @muscat/rich-text test  PASS (21/21 tests)
```

## Coverage

- Same-document switch commits exact first node/content once, cleans the first host, activates the second host, updates `contains()`, retains one style node, and disposes all state.
- Cross-document switch commits once, removes the first document style/listeners, adopts one second-document style, ignores pointer events from the old document, and disposes both documents cleanly.
- Throwing commit cleans the first session, propagates the error, constructs no second editor, leaves the second host untouched, and leaves no menu/style/editing state.

## Final Gate

```text
pnpm check         PASS (format, lint, 4 typechecks)
pnpm test          PASS (40 tests: core 12, dom 7, rich-text 21)
pnpm test:browser  PASS (44 tests)
pnpm build         PASS (4 projects)
git diff --check   PASS
```

Expected Playwright server warnings only: `NO_COLOR` is ignored when `FORCE_COLOR` is set.

## Self-Review

- No public API or declaration changes.
- No second cleanup/commit implementation was introduced.
- The error policy is explicit: cleanup completes, the commit error propagates, and the requested second session does not start.
- The single-line production change relies on already-tested idempotent and exception-safe `finish` behavior; regression coverage targets ordering and cross-document ownership.

## Concerns

- Starting a session for the already active host still performs a commit/restart rather than treating it as a no-op. This follows the defined rule that every `start()` request replaces the active session.

## Commit

- Recorded in the task response because a commit cannot contain its own SHA.
