# Rich Text Package Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the reusable rich-text editor from `apps/demo` into `@muscat/rich-text` while keeping Tiptap and ProseMirror private implementation details.

**Architecture:** `@muscat/rich-text` depends on `@muscat/dom`, owns the controller, menu, stylesheet adoption, and all Tiptap dependencies, and exports only Muscat-owned interfaces. The demo depends on this package and retains only application coordination. The package injects its internal stylesheet into every owner document so its compiled output has no Vite-specific CSS import contract.

**Tech Stack:** TypeScript 7, Vitest 3, Vite 7, Tiptap 3, Floating UI, pnpm 11.

## Global Constraints

- Public package name is `@muscat/rich-text`; no public API or declaration exposes Tiptap or ProseMirror types.
- Dependency direction is `@muscat/core <- @muscat/dom <- @muscat/rich-text <- @muscat/demo`.
- `@muscat/core` and `@muscat/dom` must not acquire Tiptap dependencies.
- Preserve all current formatting, security, iframe, lifecycle, undo/redo, accessibility, and responsive behavior.
- The compiled package must work without Vite-specific `?inline` imports or missing CSS assets.
- Follow test-first RED/GREEN cycles and keep the Draft PR branch history reviewable.

---

### Task 1: Create the Reusable `@muscat/rich-text` Package

**Files:**

- Create: `packages/rich-text/package.json`
- Create: `packages/rich-text/tsconfig.json`
- Create: `packages/rich-text/tsconfig.build.json`
- Create: `packages/rich-text/vitest.config.ts`
- Create: `packages/rich-text/src/index.ts`
- Create: `packages/rich-text/src/rich-text-editor.ts`
- Create: `packages/rich-text/src/rich-text-menu.ts`
- Create: `packages/rich-text/src/rich-text-styles.ts`
- Create: `packages/rich-text/src/rich-text-editor.test.ts`

**Interfaces:**

- Consumes: `sanitizeRichContent` and `isSafeRichTextUrl` from `@muscat/dom`.
- Produces: `createRichTextController(options): RichTextController`.
- Produces: `RichTextController` and `RichTextStartOptions` as Muscat-owned public types.
- Keeps `RichTextMenu`, Tiptap `Editor`, Bubble Menu, extensions, and dependency injection types private.

- [ ] **Step 1: Write a failing public-package test**

Create the package test by moving the two controller lifecycle tests from `apps/demo/src/rich-text-editor.test.ts`. Import only from `./index`:

```ts
import { createRichTextController } from "./index";
```

Keep the existing initialization rollback and throwing-commit assertions unchanged.

- [ ] **Step 2: Verify RED**

Run: `pnpm --filter @muscat/rich-text test`

Expected: FAIL because the workspace package and public entry point do not exist.

- [ ] **Step 3: Scaffold package metadata**

Create `package.json` with name `@muscat/rich-text`, ESM exports from `dist/index.js`, build/test/typecheck scripts matching `@muscat/dom`, Tiptap/Floating UI plus `@muscat/dom` under `dependencies`, and Vitest/happy-dom under `devDependencies`.

Create TypeScript configs following `packages/dom`, with DOM libraries and a source path only for `@muscat/dom`. Create a Vitest config using `happy-dom` and `src/**/*.test.ts`.

- [ ] **Step 4: Move implementation behind the public entry point**

Move the controller and menu implementations without behavioral changes. Export from `src/index.ts` only:

```ts
export {
  createRichTextController,
  type RichTextController,
  type RichTextStartOptions,
} from "./rich-text-editor";
```

Do not export `RichTextControllerDependencies`, `RichTextMenu`, the menu factory, style constants, or any Tiptap type.

- [ ] **Step 5: Replace Vite CSS import with package-owned style adoption**

Move the rich-text rules into an internal `RICH_TEXT_STYLES` string in `rich-text-styles.ts`. Make the existing reference-counted `WeakMap<Document, ...>` adoption path run for both the main document and foreign documents. Each active document receives exactly one controller-owned `<style>` node and cleanup removes only that exact node at reference count zero.

Remove the `./rich-text.css?inline` dependency entirely. Preserve every computed value covered by browser tests, including fixed 32px controls, contrast, focus outline, Floating UI containment, and responsive link-form layout.

- [ ] **Step 6: Verify package GREEN**

Run: `pnpm --filter @muscat/rich-text test && pnpm --filter @muscat/rich-text typecheck && pnpm --filter @muscat/rich-text build`

Expected: 2 controller tests pass, typecheck passes, and `dist/index.js` plus declarations are emitted.

- [ ] **Step 7: Commit**

```bash
git add packages/rich-text pnpm-lock.yaml
git commit -m "feat(rich-text): add reusable editor package"
```

---

### Task 2: Convert the Demo to a Package Consumer

**Files:**

- Modify: `apps/demo/package.json`
- Modify: `apps/demo/tsconfig.json`
- Modify: `apps/demo/src/main.ts`
- Modify: `apps/demo/src/style.css`
- Delete: `apps/demo/src/rich-text-editor.ts`
- Delete: `apps/demo/src/rich-text-menu.ts`
- Delete: `apps/demo/src/rich-text.css`
- Delete: `apps/demo/src/rich-text-editor.test.ts`
- Delete: `apps/demo/vitest.config.ts`
- Modify: `pnpm-lock.yaml`
- Test: `packages/dom/test/browser/specs/editor.spec.ts`

**Interfaces:**

- Consumes: `createRichTextController`, `RichTextController`, and `RichTextStartOptions` from `@muscat/rich-text`.
- Produces: no reusable rich-text implementation in the demo.

- [ ] **Step 1: Write a failing boundary assertion**

Add a browser-harness startup assertion or focused static test that resolves `@muscat/rich-text` through the demo and verifies the old demo implementation modules are absent. The behavior test `formats a selected range in a regular node` remains the user-facing contract.

- [ ] **Step 2: Remove direct demo dependencies**

Replace all Tiptap and Floating UI dependencies plus demo-only happy-dom with:

```json
"@muscat/rich-text": "workspace:*"
```

Add this TypeScript source path:

```json
"@muscat/rich-text": ["../../packages/rich-text/src/index.ts"]
```

- [ ] **Step 3: Replace imports and delete implementation files**

In `main.ts`, import the public controller factory from `@muscat/rich-text`. Delete the four implementation/test files and demo Vitest config. Remove rich-text rules from demo CSS; keep only application rules such as hiding the selection overlay while the canvas has `is-rich-text-editing`.

- [ ] **Step 4: Verify focused regular and iframe behavior**

Run:

```bash
pnpm --filter @muscat/dom test:browser --grep "formats a selected range|adopts rich text styles|nested links"
```

Expected: regular formatting, iframe formatting/styling, and anchor-host validity cases pass through the package boundary.

- [ ] **Step 5: Verify demo boundary**

Run: `pnpm --filter @muscat/demo typecheck && pnpm --filter @muscat/demo build`

Expected: the demo builds with no direct Tiptap imports or dependencies.

- [ ] **Step 6: Commit**

```bash
git add apps/demo packages/dom/test/browser/specs/editor.spec.ts pnpm-lock.yaml
git commit -m "refactor(demo): consume rich text package"
```

---

### Task 3: Verify the Public Boundary and Full Workspace

**Files:**

- Modify: `packages/rich-text/src/index.ts`
- Modify: `packages/rich-text/package.json`
- Modify: `README.md`
- Test: `packages/rich-text/src/rich-text-editor.test.ts`

**Interfaces:**

- Consumes: completed package extraction.
- Produces: documented public package and verified declarations without implementation leakage.

- [ ] **Step 1: Add a declaration-boundary test**

After building `@muscat/rich-text`, inspect `packages/rich-text/dist/index.d.ts` and its referenced public declarations. Fail if public declarations contain `@tiptap`, `prosemirror`, `Editor`, `RichTextMenu`, or `RichTextControllerDependencies`.

- [ ] **Step 2: Update workspace documentation**

Add `@muscat/rich-text` to the README workspace list as the optional headless rich-text editing adapter. State that Tiptap is private and the demo consumes only Muscat-owned APIs.

- [ ] **Step 3: Run final formatting and static checks**

Run: `pnpm format && pnpm check`

Expected: format, lint, and all four workspace typechecks pass with no warnings.

- [ ] **Step 4: Run all tests and builds**

Run: `pnpm test && pnpm test:browser && pnpm build`

Expected: controller, core, DOM, demo integration, all 43 existing browser tests, and all four builds pass.

- [ ] **Step 5: Inspect dependency ownership**

Run:

```bash
rg -n '"@tiptap|"@floating-ui' apps/demo/package.json packages/core/package.json packages/dom/package.json packages/rich-text/package.json
rg -n 'from "@tiptap|from "@floating-ui' apps/demo packages/core packages/dom packages/rich-text/src
```

Expected: package dependencies and imports appear only under `packages/rich-text`; the demo references only `@muscat/rich-text`.

- [ ] **Step 6: Commit documentation and boundary checks**

```bash
git add README.md packages/rich-text
git commit -m "docs: document rich text package"
```

- [ ] **Step 7: Update the Draft PR**

Push `codex/tiptap-rich-text` and update PR #1 summary to describe `@muscat/rich-text` as the reusable public boundary and Tiptap as its private implementation.
