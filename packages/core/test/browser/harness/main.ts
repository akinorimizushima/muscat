import { commands, createEditor } from "../../../src/index.js";
import "./style.css";

const editor = createEditor();
function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Harness element is missing: ${selector}`);
  return element;
}

const canvas = requiredElement<HTMLElement>("#canvas");
const status = requiredElement<HTMLOutputElement>("#status");

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
render();
