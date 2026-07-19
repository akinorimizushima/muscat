# Tiptap Rich Text Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add undoable Tiptap rich text editing with a selection-anchored Bubble Menu to regular canvas nodes and imported iframe HTML.

**Architecture:** Core stores optional sanitized rich HTML without importing DOM or Tiptap types. The DOM package owns allowlist sanitization plus import/render/export behavior. A vanilla Tiptap controller in the demo owns one active edit session and mounts its Bubble Menu inside the target document.

**Tech Stack:** TypeScript 7, Vitest 3, Playwright 1.55, Vite 7, Tiptap 3, Floating UI, pnpm 11.

## Global Constraints

- Keep `@muscat/core` DOM-free and Tiptap-independent.
- Support bold, italic, underline, strike-through, left/center/right alignment, and links only.
- Enter editing on leaf-element double-click; show the menu only for a non-empty text selection.
- Commit one Muscat transaction per completed edit, cancel the entire edit with `Escape`, and preserve legacy plain text documents.
- Allow link schemes `http:`, `https:`, `mailto:`, `tel:`, fragments, and relative URLs; reject scriptable schemes.
- Do not add `target="_blank"` automatically.
- Suspend drag, resize, and selection overlay behavior while editing.
- Follow strict red-green-refactor: every production behavior starts with a failing focused test.

## File Structure

- Modify `packages/core/src/model.ts`: add the optional rich HTML field.
- Modify `packages/core/src/commands.ts`: add the rich-content command and factory.
- Modify `packages/core/src/transaction.ts`: apply and invert rich-content changes.
- Modify `packages/core/src/commands.test.ts`: cover history behavior.
- Create `packages/dom/src/rich-content.ts`: sanitize and normalize supported rich HTML.
- Create `packages/dom/src/rich-content.test.ts`: DOM-boundary unit tests using Vitest's browser-like environment.
- Modify `packages/dom/src/create-dom-node.ts`: render sanitized rich HTML.
- Modify `packages/dom/src/html.ts`: import and export rich leaf content.
- Modify `packages/dom/src/index.ts`: export the rich-content API.
- Modify `packages/dom/package.json`: add a unit-test script and DOM test environment dependency if needed.
- Create `apps/demo/src/rich-text-editor.ts`: own Tiptap lifecycle, toolbar commands, link panel, commit, and cancel.
- Create `apps/demo/src/rich-text-menu.ts`: construct and update the accessible toolbar DOM.
- Modify `apps/demo/src/main.ts`: replace direct plaintext editing with the shared controller and wire iframe edit requests.
- Modify `apps/demo/src/style.css`: style editor state and floating toolbar.
- Modify `apps/demo/package.json`: add Tiptap 3 and Floating UI dependencies.
- Modify `packages/dom/src/iframe-renderer.ts`: delegate leaf editing through a callback and expose the iframe document target.
- Modify `packages/dom/test/browser/harness/main.ts`: record rich-content callbacks for renderer tests.
- Modify `packages/dom/test/browser/specs/iframe-renderer.spec.ts`: verify iframe edit delegation.
- Modify `packages/dom/test/browser/specs/editor.spec.ts`: verify the complete user workflow.

---

### Task 1: Undoable Rich Content in Core

**Files:**
- Modify: `packages/core/src/model.ts`
- Modify: `packages/core/src/commands.ts`
- Modify: `packages/core/src/transaction.ts`
- Test: `packages/core/src/commands.test.ts`

**Interfaces:**
- Produces: `EditorNode.richContent?: string`
- Produces: `commands.setNodeRichContent({ nodeId, richContent }): SetNodeRichContentCommand`
- Produces: command type `node.setRichContent`

- [ ] **Step 1: Write the failing history test**

Add to `packages/core/src/commands.test.ts`:

```ts
it("updates rich content as one undoable command", () => {
  const editor = createEditor();
  editor.dispatch(
    commands.addNode({
      parentId: "root",
      node: { ...box("text"), type: "p", content: "Before" },
    }),
  );

  editor.dispatch(
    commands.setNodeRichContent({ nodeId: "text", richContent: "<strong>After</strong>" }),
  );
  expect(editor.getSnapshot().document.nodes.text?.richContent).toBe("<strong>After</strong>");

  editor.undo();
  expect(editor.getSnapshot().document.nodes.text?.richContent).toBeUndefined();

  editor.redo();
  expect(editor.getSnapshot().document.nodes.text?.richContent).toBe("<strong>After</strong>");
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm --filter @muscat/core test:unit -- --runInBand`

Expected: TypeScript/Vitest fails because `setNodeRichContent` and `richContent` do not exist.

- [ ] **Step 3: Implement the model and command**

Add to `EditorNode` in `model.ts`:

```ts
readonly richContent?: string;
```

Add to `commands.ts` and its `Command` union:

```ts
export interface SetNodeRichContentCommand {
  readonly type: "node.setRichContent";
  readonly nodeId: NodeId;
  readonly richContent?: string;
}

setNodeRichContent(
  command: Omit<SetNodeRichContentCommand, "type">,
): SetNodeRichContentCommand {
  return { type: "node.setRichContent", ...command };
},
```

Add to `applyCommand` in `transaction.ts`:

```ts
case "node.setRichContent": {
  const node = requiredNode(document, command.nodeId);
  nodes[node.id] = { ...node, richContent: command.richContent };
  return {
    document: { ...document, nodes },
    inverse: {
      commands: [
        { type: "node.setRichContent", nodeId: node.id, richContent: node.richContent },
      ],
    },
  };
}
```

- [ ] **Step 4: Run core tests and typecheck**

Run: `pnpm --filter @muscat/core test && pnpm --filter @muscat/core typecheck`

Expected: all core tests pass and TypeScript reports no errors.

- [ ] **Step 5: Commit the core contract**

```bash
git add packages/core/src/model.ts packages/core/src/commands.ts packages/core/src/transaction.ts packages/core/src/commands.test.ts
git commit -m "feat(core): add undoable rich content"
```

---

### Task 2: Sanitized Rich HTML DOM Boundary

**Files:**
- Create: `packages/dom/src/rich-content.ts`
- Create: `packages/dom/src/rich-content.test.ts`
- Modify: `packages/dom/src/create-dom-node.ts`
- Modify: `packages/dom/src/html.ts`
- Modify: `packages/dom/src/index.ts`
- Modify: `packages/dom/package.json`

**Interfaces:**
- Consumes: `EditorNode.richContent?: string`
- Produces: `sanitizeRichContent(html: string, document?: Document): string`
- Produces: `appendRichContent(element: HTMLElement, html: string): void`

- [ ] **Step 1: Add the DOM unit-test harness and failing sanitizer tests**

Add `test:unit` to `packages/dom/package.json`, make `test` call it, and add `happy-dom` as a dev dependency. Create a local `vitest.config.ts` using the `happy-dom` environment and `src/**/*.test.ts` include pattern.

Create `packages/dom/src/rich-content.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { sanitizeRichContent } from "./rich-content";

describe("sanitizeRichContent", () => {
  it("keeps supported marks, alignment, and safe links", () => {
    expect(
      sanitizeRichContent(
        '<p style="text-align: center; color: red"><strong><u>A</u></strong> <a href="/docs">B</a></p>',
      ),
    ).toBe(
      '<p style="text-align: center"><strong><u>A</u></strong> <a href="/docs">B</a></p>',
    );
  });

  it("removes executable markup and unsafe links", () => {
    expect(
      sanitizeRichContent(
        '<script>alert(1)</script><a href="javascript:alert(1)" onclick="alert(2)">Unsafe</a>',
      ),
    ).toBe("<a>Unsafe</a>");
  });
});
```

- [ ] **Step 2: Run sanitizer tests and verify RED**

Run: `pnpm --filter @muscat/dom test:unit`

Expected: FAIL because `./rich-content` does not exist.

- [ ] **Step 3: Implement allowlist sanitization**

Create `rich-content.ts` with these exact public functions and allowlists:

```ts
const ALLOWED_ELEMENTS = new Set(["p", "br", "strong", "em", "u", "s", "a"]);
const SAFE_SCHEMES = new Set(["http:", "https:", "mailto:", "tel:"]);

export function isSafeRichTextUrl(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.startsWith("#") || trimmed.startsWith("/") || trimmed.startsWith("./") || trimmed.startsWith("../")) return true;
  try {
    return SAFE_SCHEMES.has(new URL(trimmed, "https://muscat.invalid").protocol);
  } catch {
    return false;
  }
}

export function sanitizeRichContent(html: string, ownerDocument = document): string {
  const template = ownerDocument.createElement("template");
  template.innerHTML = html;
  sanitizeChildren(template.content, ownerDocument);
  return template.innerHTML;
}

export function appendRichContent(element: HTMLElement, html: string): void {
  const safe = sanitizeRichContent(html, element.ownerDocument);
  const template = element.ownerDocument.createElement("template");
  template.innerHTML = safe;
  element.append(template.content.cloneNode(true));
}
```

Implement the private recursive `sanitizeChildren` so disallowed elements are unwrapped except `script`, `style`, `iframe`, `object`, and `embed`, which are removed with their content. Preserve only `href` on `a`; preserve only normalized `text-align: left|center|right` on `p`; remove every `data-*`, `on*`, class, and unknown attribute.

- [ ] **Step 4: Run sanitizer tests and verify GREEN**

Run: `pnpm --filter @muscat/dom test:unit`

Expected: both sanitizer tests pass.

- [ ] **Step 5: Write failing import/render/export compatibility tests**

Extend `rich-content.test.ts` to create an `EditorNode` with `richContent`, call `createDomNode`, and assert formatted descendants exist. Add an import/export test that imports `<p><strong>Hello</strong> <a href="/docs">docs</a></p>`, applies its transaction to a document, exports it, and asserts the two inline tags survive while `data-muscat-node-id` does not.

- [ ] **Step 6: Run the new tests and verify RED**

Run: `pnpm --filter @muscat/dom test:unit`

Expected: rendering produces plain/empty content and import does not populate `richContent`.

- [ ] **Step 7: Wire rendering, import, and export**

In `create-dom-node.ts`, replace the content append branch with:

```ts
if (node.richContent !== undefined) appendRichContent(element, node.richContent);
else if (node.content) element.append(document.createTextNode(node.content));
```

In `html.ts`, detect leaf elements whose children are inline-only. Store sanitized `element.innerHTML` as `richContent` on the element node instead of creating child element/text nodes for that fragment. Keep the existing recursive behavior for elements containing block children. Ensure `sanitizeDocument` removes editor-only style and marker metadata before final export.

Export the new functions from `packages/dom/src/index.ts`.

- [ ] **Step 8: Run DOM and regression tests**

Run: `pnpm --filter @muscat/dom test:unit && pnpm --filter @muscat/dom test:browser && pnpm --filter @muscat/dom typecheck`

Expected: sanitizer, import/export, and existing browser tests pass.

- [ ] **Step 9: Commit the DOM boundary**

```bash
git add packages/dom
git commit -m "feat(dom): sanitize and render rich content"
```

---

### Task 3: Headless Tiptap Session and Bubble Menu

**Files:**
- Create: `apps/demo/src/rich-text-menu.ts`
- Create: `apps/demo/src/rich-text-editor.ts`
- Modify: `apps/demo/src/main.ts`
- Modify: `apps/demo/src/style.css`
- Modify: `apps/demo/package.json`
- Modify: `pnpm-lock.yaml`
- Test: `packages/dom/test/browser/specs/editor.spec.ts`

**Interfaces:**
- Consumes: `sanitizeRichContent(html, document)` and `commands.setNodeRichContent(...)`
- Produces: `createRichTextController(options): RichTextController`
- Produces: `RichTextController.start({ nodeId, element, initialHtml }): void`
- Produces: `RichTextController.finish(cancel: boolean): void`
- Produces: `RichTextController.isEditing(): boolean`

- [ ] **Step 1: Install exact Tiptap major dependencies**

Run:

```bash
pnpm --filter @muscat/demo add @tiptap/core@^3 @tiptap/starter-kit@^3 @tiptap/extension-underline@^3 @tiptap/extension-link@^3 @tiptap/extension-text-align@^3 @tiptap/extension-bubble-menu@^3 @floating-ui/dom@^1
```

Expected: `apps/demo/package.json` and `pnpm-lock.yaml` contain the new dependencies.

- [ ] **Step 2: Write a failing regular-node Bubble Menu test**

Add to `editor.spec.ts`:

```ts
test("formats a selected range in a regular node", async ({ page }) => {
  await page.goto(demoUrl);
  await page.getByRole("button", { name: "Add element" }).click();
  const content = page.locator('[data-editor-node-id="element-1"]');
  await content.dblclick();
  await content.press(process.platform === "darwin" ? "Meta+A" : "Control+A");

  const menu = page.getByRole("toolbar", { name: "Text formatting" });
  await expect(menu).toBeVisible();
  await menu.getByRole("button", { name: "Bold" }).click();
  await page.locator("[data-canvas]").click({ position: { x: 2, y: 2 } });

  await expect(content.locator("strong")).toHaveText("Element 1");
});
```

- [ ] **Step 3: Run the test and verify RED**

Run: `pnpm --filter @muscat/dom test:browser -- -g "formats a selected range in a regular node"`

Expected: FAIL because the formatting toolbar does not exist.

- [ ] **Step 4: Build the menu DOM helper**

In `rich-text-menu.ts`, export:

```ts
export interface RichTextMenu {
  readonly element: HTMLElement;
  update(): void;
  destroy(): void;
}

export function createRichTextMenu(editor: Editor, ownerDocument: Document): RichTextMenu;
```

Create a `role="toolbar"` element with `aria-label="Text formatting"`. Add icon buttons with stable `aria-label` and `title` values: `Bold`, `Italic`, `Underline`, `Strike`, `Align left`, `Align center`, `Align right`, and `Link`. Use `mousedown` prevention so clicking format buttons does not discard the ProseMirror selection. Use `editor.chain().focus()` commands, `aria-pressed`, and `disabled = !editor.can().chain()...run()`.

The Link button expands a form with a labeled URL input plus `Apply link` and `Remove link` buttons. Applying calls `extendMarkRange("link").setLink({ href })`; removal calls `unsetLink()`. Invalid URLs set `aria-invalid="true"` and do not execute a command.

- [ ] **Step 5: Build the Tiptap controller**

In `rich-text-editor.ts`, export:

```ts
export interface RichTextStartOptions {
  readonly nodeId: string;
  readonly element: HTMLElement;
  readonly initialHtml: string;
}

export interface RichTextController {
  start(options: RichTextStartOptions): void;
  finish(cancel: boolean): void;
  isEditing(): boolean;
  dispose(): void;
}

export function createRichTextController(options: {
  readonly onCommit: (nodeId: string, richContent: string) => void;
  readonly onEditingChange: (editing: boolean) => void;
}): RichTextController;
```

Configure `Editor` with `StarterKit`, `Underline`, `Link.configure({ openOnClick: false })`, `TextAlign.configure({ types: ["paragraph"], alignments: ["left", "center", "right"] })`, and `BubbleMenu.configure({ element: menu.element, appendTo: () => ownerDocument.body, shouldShow: ({ from, to }) => from !== to })`.

The controller records normalized initial HTML, mounts Tiptap inside the target element, focuses it, and selects its content. `finish(false)` sanitizes `editor.getHTML()` and calls `onCommit` only when changed. `finish(true)` restores the initial HTML without calling `onCommit`. Both paths destroy the editor and menu exactly once.

- [ ] **Step 6: Replace regular plaintext editing in `main.ts`**

Instantiate the controller with:

```ts
const richTextController = createRichTextController({
  onCommit(nodeId, richContent) {
    editor.dispatch(commands.setNodeRichContent({ nodeId, richContent }));
  },
  onEditingChange(isEditing) {
    canvas.classList.toggle("is-rich-text-editing", isEditing);
    updateSelectionOverlay();
  },
});
```

Replace `editing`, `startEditing`, and `finishEditing`. On double-click, resolve the leaf node, derive initial HTML from `node.richContent` or escaped `node.content`, and call `richTextController.start`. Guard all pointer drag/resize paths with `richTextController.isEditing()`. Make `Escape` call `finish(true)` and outside pointerdown call `finish(false)`.

- [ ] **Step 7: Add restrained toolbar styles**

Add `.rich-text-menu`, icon button active/focus/disabled states, `.rich-text-link-form`, and `.is-rich-text-editing` styles. Use a neutral dark toolbar, one accent color for active state, 32px fixed icon buttons, at most 8px corner radius, no gradients, and responsive `max-width: calc(100vw - 16px)`. Hide the Muscat selection overlay while `.is-rich-text-editing` is set.

- [ ] **Step 8: Run the focused test and verify GREEN**

Run: `pnpm --filter @muscat/dom test:browser -- -g "formats a selected range in a regular node"`

Expected: PASS.

- [ ] **Step 9: Add focused tests for all commands and lifecycle**

Add Playwright tests that select text and verify `em`, `u`, `s`, alignment style, safe link application/removal, collapsed-selection menu hiding, `Escape` cancellation, outside-click commit, one-step undo/redo, and drag suppression. Use accessible toolbar roles rather than CSS selectors for controls.

- [ ] **Step 10: Run regular-node browser tests and typecheck**

Run: `pnpm --filter @muscat/dom test:browser -- -g "regular node|selected range|link|cancel|undo" && pnpm --filter @muscat/demo typecheck`

Expected: all new regular-node cases pass and TypeScript reports no errors.

- [ ] **Step 11: Commit the Tiptap session**

```bash
git add apps/demo packages/dom/test/browser/specs/editor.spec.ts pnpm-lock.yaml
git commit -m "feat(demo): add Tiptap floating text toolbar"
```

---

### Task 4: Iframe Editing Through the Shared Controller

**Files:**
- Modify: `packages/dom/src/iframe-renderer.ts`
- Modify: `apps/demo/src/main.ts`
- Modify: `packages/dom/test/browser/harness/main.ts`
- Modify: `packages/dom/test/browser/specs/iframe-renderer.spec.ts`
- Modify: `packages/dom/test/browser/specs/editor.spec.ts`

**Interfaces:**
- Consumes: `RichTextController.start(...)`
- Produces: `IframeRendererOptions.onEdit?: (request: IframeEditRequest) => void`
- Produces: `IframeEditRequest = { nodeId, element, initialHtml }`
- Produces: `IframeRenderer.setEditing(editing: boolean): void`

- [ ] **Step 1: Write a failing iframe formatting test**

Add to `editor.spec.ts`:

```ts
test("formats a selected range inside imported HTML", async ({ page }) => {
  await importSample(page);
  const target = page.frameLocator("iframe").getByText("Editable target");
  await target.dblclick();
  await target.press(process.platform === "darwin" ? "Meta+A" : "Control+A");

  const menu = page.frameLocator("iframe").getByRole("toolbar", { name: "Text formatting" });
  await expect(menu).toBeVisible();
  await menu.getByRole("button", { name: "Italic" }).click();
  await page.locator(".stage-heading").click();

  await expect(target.locator("em")).toHaveText("Editable target");
});
```

- [ ] **Step 2: Run the iframe test and verify RED**

Run: `pnpm --filter @muscat/dom test:browser -- -g "formats a selected range inside imported HTML"`

Expected: FAIL because the iframe renderer still starts its private plaintext editor.

- [ ] **Step 3: Delegate iframe edit requests**

Add to `iframe-renderer.ts`:

```ts
export interface IframeEditRequest {
  readonly nodeId: string;
  readonly element: HTMLElement;
  readonly initialHtml: string;
}

readonly onEdit?: (request: IframeEditRequest) => void;
```

Remove the renderer's private `editing` state and plaintext finish logic. On a valid leaf double-click, use `element.dataset.muscatNodeId` and call `options.onEdit({ nodeId, element, initialHtml: element.innerHTML })`. Imported leaf formatting belongs to the leaf element node's `richContent`; do not target or recreate a marker-backed `#text` child. Add `setEditing(editing)` to the renderer interface and use it to suppress pointerdown drag setup while the shared controller is active.

- [ ] **Step 4: Connect iframe requests in `main.ts`**

Pass:

```ts
onEdit({ nodeId, element, initialHtml }) {
  richTextController.start({ nodeId, element, initialHtml });
},
```

When `onEditingChange` runs, call `iframeRenderer?.setEditing(isEditing)`. Ensure commit dispatches `setNodeRichContent` for the leaf element node. Update iframe `syncNodes` so an element with `richContent` replaces its children with `appendRichContent(element, node.richContent)` after attributes are synchronized.

- [ ] **Step 5: Update the renderer harness contract test**

In the browser harness, record `onEdit` node ID and initial HTML on `#app` data attributes. Replace the old `contenteditable="plaintext-only"` assertions with assertions that a double-click emits one edit request for the expected leaf element node and element.

- [ ] **Step 6: Run iframe focused tests and verify GREEN**

Run: `pnpm --filter @muscat/dom test:browser -- -g "edit request|formats a selected range inside imported HTML"`

Expected: both delegation and full iframe formatting tests pass.

- [ ] **Step 7: Run all browser tests**

Run: `pnpm --filter @muscat/dom test:browser`

Expected: all drag, resize, import/export, keyboard shortcut, regular editing, and iframe editing tests pass.

- [ ] **Step 8: Commit iframe integration**

```bash
git add packages/dom/src/iframe-renderer.ts packages/dom/test/browser apps/demo/src/main.ts
git commit -m "feat(dom): support Tiptap editing in iframes"
```

---

### Task 5: Final Accessibility, Visual, and Regression Verification

**Files:**
- Modify if failures require it: `apps/demo/src/rich-text-menu.ts`
- Modify if failures require it: `apps/demo/src/rich-text-editor.ts`
- Modify if failures require it: `apps/demo/src/main.ts`
- Modify if failures require it: `apps/demo/src/style.css`
- Modify if failures require it: `packages/dom/test/browser/specs/editor.spec.ts`

**Interfaces:**
- Consumes: complete rich text feature from Tasks 1-4.
- Produces: verified desktop/mobile UI and clean repository checks.

- [ ] **Step 1: Add explicit viewport and keyboard coverage**

Add tests at `1280x800` and `390x844` that open the Bubble Menu near canvas edges and assert its bounding box remains inside the viewport. Add a keyboard test that tabs through every toolbar control, checks visible focus, opens the link form, applies a URL, and returns focus to the editor without collapsing the selected mark range.

- [ ] **Step 2: Run the new tests and verify RED or existing compliance**

Run: `pnpm --filter @muscat/dom test:browser -- -g "viewport|keyboard"`

Expected: tests either expose a positioning/focus defect or pass because the implementation already satisfies the contract. If they pass immediately, confirm they exercise real menu visibility and bounding-box assertions before proceeding.

- [ ] **Step 3: Fix only observed positioning or focus defects**

Use Bubble Menu Floating UI options with `strategy: "fixed"`, `placement: "top"`, `offset: 8`, `flip: true`, `shift: true`, and `inline: true`. Keep the URL form in the same toolbar and emit the Bubble Menu `updatePosition` meta after expanding or collapsing it. Preserve the ProseMirror selection before focusing the URL input and restore it before applying/removing a link.

- [ ] **Step 4: Run formatting and static checks**

Run: `pnpm format && pnpm check`

Expected: formatter completes; format check, lint, and all workspace typechecks pass with no warnings.

- [ ] **Step 5: Run the complete automated suite**

Run: `pnpm test && pnpm test:browser && pnpm build`

Expected: every unit/browser test passes and all packages build.

- [ ] **Step 6: Start the demo for visual verification**

Run: `pnpm dev -- --port 5173 --strictPort`

Expected: Vite reports `http://127.0.0.1:5173/`. Keep this process running for the next step.

- [ ] **Step 7: Verify the UI in the in-app browser**

Use the browser control skill to inspect desktop `1280x800` and mobile `390x844`. Verify the toolbar is visible only for selected text, is not clipped, buttons and URL input do not overlap, iframe and regular modes look consistent, active states are clear, and content remains inspectable. Capture screenshots for both viewports and check console output for errors.

- [ ] **Step 8: Review the final diff**

Run: `git diff --check && git status --short && git diff --stat HEAD~4`

Expected: no whitespace errors, only planned files are changed, and no generated screenshots or test artifacts are tracked.

- [ ] **Step 9: Commit final verification fixes if any**

```bash
git add apps/demo packages/dom/test/browser/specs/editor.spec.ts
git commit -m "test: verify rich text editing workflows"
```

Skip the commit when Step 3 produced no code or test changes beyond already committed coverage.
