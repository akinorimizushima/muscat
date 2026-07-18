import { commands, createEditor, getDragGeometry, startDragSession, type DragSession, type Geometry } from "../../../src/index.js";
import "./style.css";

const editor = createEditor();
function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Harness element is missing: ${selector}`);
  return element;
}

const canvas = requiredElement<HTMLElement>("#canvas");
const status = requiredElement<HTMLOutputElement>("#status");
let dragSession: DragSession | undefined;
let previewGeometry: Geometry | undefined;

function render(): void {
  const snapshot = editor.getSnapshot();
  canvas.replaceChildren();
  for (const id of snapshot.document.nodes[snapshot.document.rootId]?.children ?? []) {
    const node = snapshot.document.nodes[id];
    if (!node) continue;
    const element = document.createElement("article");
    element.setAttribute("aria-label", `Node ${node.id}`);
    element.dataset.nodeId = node.id;
    element.textContent = node.content ?? node.id;
    const geometry = dragSession?.nodeId === node.id && previewGeometry ? previewGeometry : node.geometry;
    if (geometry) {
      element.style.left = `${geometry.x}px`;
      element.style.top = `${geometry.y}px`;
      element.style.width = `${geometry.width}px`;
      element.style.height = `${geometry.height}px`;
    }
    canvas.append(element);
  }
  status.textContent = `${canvas.children.length} nodes`;
}

editor.subscribe(render);
document.querySelector("#add-node")?.addEventListener("click", () => {
  editor.dispatch(commands.addNode({
    parentId: "root",
    node: {
      id: `node-${editor.getSnapshot().document.nodes.root?.children.length ?? 0}`,
      type: "div",
      layout: "free",
      geometry: { x: 20, y: 20, width: 120, height: 80 },
      attributes: {},
      content: "New node",
    },
  }));
});
document.querySelector("#undo")?.addEventListener("click", () => editor.undo());
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
canvas.addEventListener("pointerup", (event) => {
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
render();
