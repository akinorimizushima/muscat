import { createIframeRenderer, importHtml } from "../../../src/index.js";

const app = document.querySelector<HTMLElement>("#app");
if (!app) throw new Error("Missing app root");
app.innerHTML = `
  <div id="canvas" style="height:240px;position:relative;width:500px">
    <iframe title="Imported document" style="border:0;height:100%;width:100%"></iframe>
  </div>
`;
const canvas = document.querySelector<HTMLElement>("#canvas");
const iframe = document.querySelector<HTMLIFrameElement>("iframe");
if (!canvas || !iframe) throw new Error("Missing harness elements");

const imported = importHtml(
  `
  <div id="scroller" style="height:180px;overflow:auto">
    <div style="height:240px"></div>
    <h2>Scrollable target</h2>
    <div style="height:240px"></div>
  </div>
`,
  (() => {
    let id = 0;
    return () => `node-${id++}`;
  })(),
);
let selectedId: string | undefined;

function updateOverlay(): void {
  canvas.querySelector("[data-overlay]")?.remove();
  if (!selectedId) return;
  const rect = renderer.getElementRect(selectedId);
  if (!rect) return;
  const overlay = document.createElement("div");
  overlay.dataset.overlay = "";
  overlay.style.cssText = `border:2px solid green;left:${rect.left}px;pointer-events:none;position:absolute;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px`;
  canvas.append(overlay);
}

const renderer = createIframeRenderer(iframe, {
  onSelect(nodeId) {
    selectedId = nodeId;
    updateOverlay();
  },
  onDragPreview(_nodeId, deltaX, deltaY) {
    const overlay = canvas.querySelector<HTMLElement>("[data-overlay]");
    if (overlay) overlay.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
  },
  onViewportChange: updateOverlay,
  onTextChange(nodeId, content) {
    app.dataset.changedNodeId = nodeId;
    app.dataset.changedContent = content;
  },
});
renderer.render(imported.srcdoc);
