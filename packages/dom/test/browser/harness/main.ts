import { commands, createEditor } from "@muscat/core";
import { createIframeRenderer, exportHtml, importHtml } from "../../../src/index";

const app = document.querySelector<HTMLElement>("#app");
if (!app) throw new Error("Missing app root");
app.innerHTML = `
  <div id="canvas" style="height:240px;position:relative;width:500px">
    <iframe title="Imported document" style="border:0;height:100%;width:100%"></iframe>
  </div>
  <textarea id="exported-html" hidden></textarea>
`;
const canvas = document.querySelector<HTMLElement>("#canvas");
const iframe = document.querySelector<HTMLIFrameElement>("iframe");
if (!canvas || !iframe) throw new Error("Missing harness elements");

const imported = importHtml(
  `
  <section style="background:#173f35;color:#f7f4eb;padding:24px;font-family:Arial,sans-serif">
    <p style="font-size:12px;text-transform:uppercase">Quarterly report</p>
    <h1 style="font-size:32px;margin:8px 0">A clearer view of growth</h1>
    <p style="line-height:1.5;margin:0">Revenue increased across every active region this quarter.</p>
  </section>
  <article style="background:#ffffff;border:1px solid #c9c4b8;padding:20px;font-family:Arial,sans-serif">
    <h2 style="font-size:18px;margin:0 0 16px">Key metrics</h2>
    <div style="display:flex;gap:24px">
      <div>
        <strong style="display:block;font-size:26px">+18%</strong>
        <span>Revenue</span>
      </div>
      <div>
        <strong style="display:block;font-size:26px">1,284</strong>
        <span>New accounts</span>
      </div>
    </div>
  </article>
  <form style="background:#f3ddd0;padding:20px;font-family:Arial,sans-serif">
    <label for="sample-email" style="display:block;margin-bottom:8px">Email report</label>
    <input id="sample-email" type="email" placeholder="name@example.com" style="padding:10px;width:220px">
    <button type="button" onclick="alert('This handler must be removed')" style="padding:10px 16px">Send</button>
  </form>
  <script>window.unsafeImportExecuted = true;</script>
  <div id="scroller" style="height:180px;overflow:auto">
    <div style="height:240px"></div>
    <h2>Scrollable target</h2>
    <p>Inline <span>movable span</span></p>
    <div style="height:240px"></div>
  </div>
`,
  (() => {
    let id = 0;
    return () => `node-${id++}`;
  })(),
);
const editor = createEditor();
editor.dispatch(imported.transaction);
const exportedHtml = document.querySelector<HTMLTextAreaElement>("#exported-html");
if (!exportedHtml) throw new Error("Missing exported HTML output");
exportedHtml.value = exportHtml(editor.getSnapshot().document, {
  language: "en",
  title: "Exported sample",
});
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
  onMove(nodeId, attributes) {
    editor.dispatch(commands.setNodeAttributes({ nodeId, attributes }));
  },
  onViewportChange: updateOverlay,
  onTextChange(nodeId, content) {
    app.dataset.changedNodeId = nodeId;
    app.dataset.changedContent = content;
  },
});
editor.subscribe((snapshot) => renderer.syncNodes(snapshot.document.nodes));
renderer.render(imported.srcdoc);
