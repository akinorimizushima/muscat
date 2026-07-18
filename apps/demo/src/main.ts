import { commands, createEditor, getDragGeometry, startDragSession, type DragSession, type EditorNode, type Geometry } from "@muscat/core";
import "./style.css";

const app = document.querySelector<HTMLElement>("#app");
if (!app) throw new Error("App root was not found");

app.innerHTML = `
  <header class="topbar">
    <div>
      <p class="eyebrow">Headless HTML editor foundation</p>
      <h1>Muscat</h1>
    </div>
    <nav class="actions" aria-label="Editor actions">
      <button type="button" data-action="add">Add element</button>
      <button type="button" data-action="undo">Undo</button>
      <button type="button" data-action="redo">Redo</button>
    </nav>
  </header>
  <main class="workspace">
    <aside class="panel">
      <h2>Document</h2>
      <ol data-document-tree></ol>
    </aside>
    <section class="stage-shell" aria-label="Editor workspace">
      <div class="stage-heading">
        <span>Canvas</span>
        <output data-status aria-live="polite"></output>
      </div>
      <div class="stage" data-canvas aria-label="Editor canvas"></div>
    </section>
    <aside class="panel inspector">
      <h2>Snapshot</h2>
      <pre data-snapshot></pre>
    </aside>
  </main>
`;

const editor = createEditor();
const canvas = requiredElement<HTMLElement>("[data-canvas]");
const tree = requiredElement<HTMLOListElement>("[data-document-tree]");
const status = requiredElement<HTMLOutputElement>("[data-status]");
const snapshotOutput = requiredElement<HTMLElement>("[data-snapshot]");
let nextNodeNumber = 1;
let dragSession: DragSession | undefined;
let previewGeometry: Geometry | undefined;

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
}

function createNodeElement(node: EditorNode): HTMLElement {
  const element = document.createElement("article");
  element.className = "canvas-node";
  element.dataset.nodeId = node.id;
  element.setAttribute("aria-label", `Node ${node.id}`);
  element.innerHTML = `<span>${node.content ?? node.id}</span><small>${node.type}</small>`;
  const geometry = dragSession?.nodeId === node.id && previewGeometry ? previewGeometry : node.geometry;
  if (geometry) {
    element.style.left = `${geometry.x}px`;
    element.style.top = `${geometry.y}px`;
    element.style.width = `${geometry.width}px`;
    element.style.height = `${geometry.height}px`;
  }
  return element;
}

function render(): void {
  const snapshot = editor.getSnapshot();
  const root = snapshot.document.nodes[snapshot.document.rootId];
  const nodes = (root?.children ?? [])
    .map((id) => snapshot.document.nodes[id])
    .filter((node): node is EditorNode => node !== undefined);

  canvas.replaceChildren(...nodes.map(createNodeElement));
  tree.replaceChildren(...nodes.map((node) => {
    const item = document.createElement("li");
    item.textContent = `${node.content ?? node.id} · ${node.layout}`;
    return item;
  }));
  status.textContent = `${nodes.length} element${nodes.length === 1 ? "" : "s"}`;
  snapshotOutput.textContent = JSON.stringify(snapshot, null, 2);

  requiredElement<HTMLButtonElement>("[data-action='undo']").disabled = !snapshot.canUndo;
  requiredElement<HTMLButtonElement>("[data-action='redo']").disabled = !snapshot.canRedo;
}

document.querySelector("[data-action='add']")?.addEventListener("click", () => {
  const number = nextNodeNumber++;
  editor.dispatch(commands.addNode({
    parentId: "root",
    node: {
      id: `element-${number}`,
      type: "section",
      layout: "free",
      geometry: { x: 24 * number, y: 24 * number, width: 220, height: 120 },
      attributes: { class: "demo-element" },
      content: `Element ${number}`,
    },
  }));
});
document.querySelector("[data-action='undo']")?.addEventListener("click", () => editor.undo());
document.querySelector("[data-action='redo']")?.addEventListener("click", () => editor.redo());
canvas.addEventListener("pointerdown", (event) => {
  const target = (event.target as Element).closest<HTMLElement>("[data-node-id]");
  if (!target?.dataset.nodeId) return;
  const node = editor.getSnapshot().document.nodes[target.dataset.nodeId];
  if (!node?.geometry) return;
  target.setPointerCapture(event.pointerId);
  dragSession = startDragSession(node.id, { x: event.clientX, y: event.clientY }, node.geometry);
  previewGeometry = node.geometry;
  editor.interaction.startDrag();
});
canvas.addEventListener("pointermove", (event) => {
  if (!dragSession) return;
  previewGeometry = getDragGeometry(dragSession, { x: event.clientX, y: event.clientY });
  render();
});
canvas.addEventListener("pointerup", () => {
  if (!dragSession || !previewGeometry) return;
  const session = dragSession;
  const geometry = previewGeometry;
  dragSession = undefined;
  previewGeometry = undefined;
  editor.dispatch(commands.moveNode({ nodeId: session.nodeId, parentId: "root", geometry }));
  editor.interaction.commitDrag();
});
canvas.addEventListener("pointercancel", () => {
  if (!dragSession) return;
  dragSession = undefined;
  previewGeometry = undefined;
  editor.interaction.cancelDrag();
  render();
});

editor.subscribe(render);
render();
