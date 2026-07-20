# Keyboard Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the selected regular or imported editor element with Backspace or Delete without intercepting text editing.

**Architecture:** The demo owns a single `handleEditorKeyDown` policy function because it owns selection and editor command dispatch. The parent document invokes it directly, while the iframe renderer forwards frame-document keyboard events through an optional callback; the renderer also removes managed iframe elements whose nodes no longer exist.

**Tech Stack:** TypeScript 7, DOM APIs, `@muscat/core` commands, Playwright 1.55, pnpm 11

## Global Constraints

- Support both `Backspace` and `Delete`.
- Preserve normal behavior in `input`, `textarea`, `select`, and contenteditable targets and while rich-text editing is active.
- Ignore prevented events, IME composition, and Alt/Meta/Control-modified events.
- Use `commands.removeNode` so Undo and Redo remain available.
- Clear selection after deletion; Undo does not restore selection.
- Add no dependencies and do not add multi-selection, confirmation UI, or a delete toolbar control.

---

## File Structure

- `apps/demo/src/main.ts`: owns editor keyboard policy, selection clearing, and command dispatch.
- `packages/dom/src/iframe-renderer.ts`: forwards iframe keydown events and keeps managed iframe DOM synchronized with node removal.
- `packages/dom/test/browser/specs/keyboard-shortcuts.spec.ts`: verifies regular-element deletion, selection clearing, undo, and protected form-control behavior.
- `packages/dom/test/browser/specs/editor.spec.ts`: verifies imported-element deletion and rich-text protection inside the iframe.

### Task 1: Regular canvas keyboard deletion

**Files:**

- Modify: `apps/demo/src/main.ts` near the document `keydown` listener
- Test: `packages/dom/test/browser/specs/keyboard-shortcuts.spec.ts`

**Interfaces:**

- Consumes: `selectedNodeId: string | undefined`, `editor.can(command)`, `editor.dispatch(command)`, `commands.removeNode({ nodeId })`
- Produces: `handleEditorKeyDown(event: KeyboardEvent): void`, shared later by iframe event forwarding

- [ ] **Step 1: Write failing browser tests for Backspace, Delete, clearing selection, Undo, and form-control protection**

Append tests that select an added element by clicking its visible node, press Backspace in one test and Delete in another, and assert the status becomes `0 elements` and `[data-selection-overlay]` has count zero. In the Backspace test, then press the Undo button and assert the status returns to `1 element` while the overlay remains absent:

```ts
for (const key of ["Backspace", "Delete"] as const) {
  test(`${key} removes the selected canvas element`, async ({ page }) => {
    await page.goto(demoUrl);
    await page.getByRole("button", { name: "Add element" }).click();
    await page.getByLabel("Node element-1").click();
    await expect(page.locator("[data-selection-overlay]")).toBeVisible();

    await page.keyboard.press(key);

    await expect(page.locator("[data-status]")).toHaveText("0 elements");
    await expect(page.locator("[data-selection-overlay]")).toHaveCount(0);

    if (key === "Backspace") {
      await page.getByRole("button", { name: "Undo" }).click();
      await expect(page.locator("[data-status]")).toHaveText("1 element");
      await expect(page.locator("[data-selection-overlay]")).toHaveCount(0);
    }
  });
}
```

Add the form-control case before implementation so the target guard is specified before production code exists:

```ts
test("leaves deletion keys to focused form controls", async ({ page }) => {
  await page.goto(demoUrl);
  await page.getByRole("button", { name: "Add element" }).click();
  await page.getByLabel("Node element-1").click();
  await page.getByRole("button", { name: "Import HTML" }).click();
  const source = page.getByLabel("HTML");
  await source.fill("abc");

  await source.press("Backspace");

  await expect(source).toHaveValue("ab");
  await expect(page.locator("[data-status]")).toHaveText("1 element");
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `pnpm --filter @muscat/dom test:browser --grep "removes the selected canvas element|deletion keys"`

Expected: FAIL because the selected element remains and status is `1 element`.

- [ ] **Step 3: Add the minimal shared keyboard policy**

In `apps/demo/src/main.ts`, add helpers and invoke the handler at the start of the existing document listener:

```ts
function isTextEntryTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    Boolean(
      target.closest("input, textarea, select") ||
      (target instanceof HTMLElement && target.isContentEditable),
    )
  );
}

function handleEditorKeyDown(event: KeyboardEvent): void {
  if (
    event.defaultPrevented ||
    event.isComposing ||
    event.altKey ||
    event.metaKey ||
    event.ctrlKey ||
    (event.key !== "Backspace" && event.key !== "Delete") ||
    richTextController.isEditing() ||
    isTextEntryTarget(event.target) ||
    !selectedNodeId
  )
    return;
  const command = commands.removeNode({ nodeId: selectedNodeId });
  if (!editor.can(command)) return;
  event.preventDefault();
  selectedNodeId = undefined;
  editor.dispatch(command);
}

document.addEventListener("keydown", (event) => {
  handleEditorKeyDown(event);
  // Existing Escape and undo/redo handling remains below.
});
```

Reuse `isTextEntryTarget` in the existing undo/redo exclusion instead of retaining duplicate target checks.

- [ ] **Step 4: Run focused browser tests and verify GREEN**

Run: `pnpm --filter @muscat/dom test:browser --grep "removes the selected canvas element|deletion keys"`

Expected: 3 passed.

- [ ] **Step 5: Commit Task 1**

```bash
git add apps/demo/src/main.ts packages/dom/test/browser/specs/keyboard-shortcuts.spec.ts
git commit -m "feat: delete selected canvas elements by keyboard"
```

### Task 2: Imported iframe keyboard deletion

**Files:**

- Modify: `packages/dom/src/iframe-renderer.ts`
- Modify: `apps/demo/src/main.ts` in `createIframeRenderer` options
- Test: `packages/dom/test/browser/specs/editor.spec.ts`

**Interfaces:**

- Consumes: `handleEditorKeyDown(event: KeyboardEvent): void` from Task 1
- Produces: optional `IframeRendererOptions.onKeyDown?: (event: KeyboardEvent) => void`; `syncNodes` removes stale managed elements

- [ ] **Step 1: Write a failing imported-element deletion test**

Add a test that imports two sibling elements under a surviving parent, clicks the first inside the iframe, presses Delete from that frame, and asserts only the second remains. Then undo and assert both return. Using a surviving parent exercises the renderer's existing managed-child restoration path:

```ts
test("deletes and restores a selected imported element from the keyboard", async ({ page }) => {
  await importHtml(page, "<section><span>Remove me</span><strong>Keep me</strong></section>");
  const frame = page.frameLocator("iframe");
  const removable = frame.getByText("Remove me", { exact: true });
  await removable.click();

  await removable.press("Delete");

  await expect(frame.getByText("Remove me", { exact: true })).toHaveCount(0);
  await expect(frame.getByText("Keep me", { exact: true })).toBeVisible();
  await expect(page.locator("[data-selection-overlay]")).toHaveCount(0);

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(frame.getByText("Remove me", { exact: true })).toBeVisible();
  await expect(frame.getByText("Keep me", { exact: true })).toBeVisible();
});
```

Also add the rich-text protection case before implementing iframe forwarding:

```ts
test("leaves deletion keys to imported rich-text editing", async ({ page }) => {
  await importHtml(page, "<p>Editable</p>");
  const target = page.frameLocator("iframe").getByText("Editable", { exact: true });
  await target.dblclick();

  await target.press("Delete");

  await expect(page.locator("[data-status]")).toHaveText("1 element");
  await expect(page.locator("[data-canvas]")).toHaveClass(/is-rich-text-editing/);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm --filter @muscat/dom test:browser --grep "selected imported element|deletion keys"`

Expected: FAIL because iframe keydown is not forwarded and `Remove me` remains.

- [ ] **Step 3: Forward iframe keydown and remove stale managed DOM**

Extend `IframeRendererOptions`:

```ts
readonly onKeyDown?: (event: KeyboardEvent) => void;
```

Inside `connectDocument`, register and clean up the forwarding listener:

```ts
const handleKeyDown = (event: KeyboardEvent): void => options.onKeyDown?.(event);
frameDocument.addEventListener("keydown", handleKeyDown);
// In disconnectDocument:
frameDocument.removeEventListener("keydown", handleKeyDown);
```

At the start of `syncNodes`, remove managed elements no longer present in the model:

```ts
for (const element of frameDocument.querySelectorAll<HTMLElement>("[data-muscat-node-id]")) {
  const nodeId = element.dataset.muscatNodeId;
  if (nodeId && !nodes[nodeId]) element.remove();
}
```

Pass the shared policy from the demo:

```ts
onKeyDown: handleEditorKeyDown,
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `pnpm --filter @muscat/dom test:browser --grep "selected imported element|deletion keys"`

Expected: 2 passed.

- [ ] **Step 5: Run iframe renderer browser coverage**

Run: `pnpm --filter @muscat/dom test:browser --grep "iframe|imported"`

Expected: all selected iframe/imported tests pass with no page errors.

- [ ] **Step 6: Commit Task 2**

```bash
git add packages/dom/src/iframe-renderer.ts apps/demo/src/main.ts packages/dom/test/browser/specs/editor.spec.ts
git commit -m "feat: delete selected imported elements by keyboard"
```

### Task 3: Full verification

**Files:**

- Verify: repository formatting, lint, types, unit tests, and browser tests

**Interfaces:**

- Consumes: completed Tasks 1 and 2
- Produces: verified repository state

- [ ] **Step 1: Run formatting, types, unit tests, and complete browser tests**

Run: `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm test:browser`

Expected: every command exits 0 with no formatting differences, lint warnings, type errors, unit failures, or browser failures.

- [ ] **Step 2: Confirm the worktree contains only the planned implementation and test changes**

Run: `git status --short && git diff --check`

Expected: no uncommitted planned files after the Task 1 and Task 2 commits, and `git diff --check` exits 0.
