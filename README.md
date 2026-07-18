# Muscat

An early, headless foundation for an HTML GUI editor. The first vertical slice is intentionally small: an immutable document model, pure commands and transactions, inverse-transaction undo/redo, a framework-neutral editor facade, and a minimal internal interaction state machine.

## Workspace

- `@muscat/core`: DOM-free document, command, transaction, history, and editor APIs.
- `@muscat/dom`: Safe HTML parsing into core transactions and rendering core nodes into DOM nodes.
- XState v5 is an implementation detail used only for transient workflow state (`idle` / `dragging`). It does not own the document tree and its actor types are not public.
- UI frameworks, DOM rendering, pointer-event adapters, persistence, and collaboration are deliberately outside core. Future packages can add `renderer-dom`, `interaction-dom`, `ui-lit`, and a Yjs adapter through explicit transaction boundaries.

## Example

```ts
import { commands, createEditor } from "@muscat/core";

const editor = createEditor();
const unsubscribe = editor.subscribe((snapshot) => {
  console.log(snapshot.document, snapshot.canUndo);
});

editor.dispatch(commands.addNode({
  parentId: "root",
  node: {
    id: "hero",
    type: "section",
    layout: "free",
    geometry: { x: 20, y: 40, width: 640, height: 320 },
    attributes: { class: "hero" },
  },
}));

editor.interaction.startDrag(); // transient; does not mutate the document
editor.dispatch(commands.moveNode({
  nodeId: "hero",
  parentId: "root",
  geometry: { x: 80, y: 40, width: 640, height: 320 },
})); // commit once, typically on pointerup
editor.interaction.commitDrag();

editor.undo();
unsubscribe();
editor.dispose();
```

## Development

Development tools are managed with [mise](https://mise.jdx.dev/). Install mise, then set up the pinned tools and project dependencies:

```sh
mise install
pnpm install
```

Run the development commands inside a mise-activated shell, or prefix them with `mise exec --`:

```sh
pnpm dev
pnpm typecheck
pnpm test
pnpm test:browser
pnpm test:coverage
pnpm build
```

Browser tests live beside core in `packages/core/test/browser`. A small Vite-powered GUI harness consumes only the public core API, Playwright exercises it in Chromium, and Istanbul coverage is merged with Vitest coverage into `packages/core/coverage/report`.

The demo application lives in `apps/demo` and is available at `http://127.0.0.1:5173` after running `pnpm dev`.

The core remains plain TypeScript and DOM-independent. High-frequency pointer movement belongs in a future interaction session package using `requestAnimationFrame`; only the final geometry becomes one document transaction. Collaboration should similarly translate between Yjs operations and public document transactions without exposing Yjs types.
