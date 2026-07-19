import {
  commands,
  createEditor,
  getDragGeometry,
  getResizeGeometry,
  startDragSession,
  startResizeSession,
  type DragSession,
  type EditorNode,
  type Geometry,
  type ResizeHandle,
  type ResizeSession,
} from "@muscat/core";
import {
  createDomNode,
  createIframeRenderer,
  exportHtml,
  importHtml,
  type IframeRenderer,
} from "@muscat/dom";
import { createRichTextController } from "./rich-text-editor";
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
      <button type="button" data-action="import">Import HTML</button>
      <button type="button" data-action="export">Export HTML</button>
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
  <dialog data-import-dialog>
    <form method="dialog" class="import-form">
      <div class="dialog-heading">
        <div><p class="eyebrow">Source</p><h2>Import HTML</h2></div>
        <button class="icon-button" value="cancel" aria-label="Close" title="Close">&times;</button>
      </div>
      <label for="html-source">HTML</label>
      <textarea id="html-source" data-html-source spellcheck="false" placeholder="<section>...</section>"></textarea>
      <output class="import-error" data-import-error aria-live="polite"></output>
      <div class="dialog-actions">
        <button value="cancel">Cancel</button>
        <button type="button" data-action="confirm-import">Import</button>
      </div>
    </form>
  </dialog>
`;

const editor = createEditor();
const canvas = requiredElement<HTMLElement>("[data-canvas]");
const tree = requiredElement<HTMLOListElement>("[data-document-tree]");
const status = requiredElement<HTMLOutputElement>("[data-status]");
const snapshotOutput = requiredElement<HTMLElement>("[data-snapshot]");
let nextNodeNumber = 1;
let nextImportedNodeNumber = 1;
let dragSession: DragSession | undefined;
let resizeSession: ResizeSession | undefined;
let resizingImportedElement = false;
let resizeInitialAttributes: Readonly<Record<string, string>> | undefined;
let previewGeometry: Geometry | undefined;
let selectedNodeId: string | undefined;
let importedPage: { readonly srcdoc: string; readonly topLevelIds: readonly string[] } | undefined;
let iframeRenderer: IframeRenderer | undefined;

const richTextController = createRichTextController({
  onCommit(nodeId, richContent) {
    editor.dispatch(commands.setNodeRichContent({ nodeId, richContent }));
  },
  onEditingChange(isEditing) {
    canvas.classList.toggle("is-rich-text-editing", isEditing);
    iframeRenderer?.setEditing(isEditing);
    updateSelectionOverlay();
  },
});

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
}

function withElementSize(
  attributes: Readonly<Record<string, string>>,
  geometry: Geometry,
): Readonly<Record<string, string>> {
  const style = document.createElement("div").style;
  style.cssText = attributes.style ?? "";
  style.boxSizing = "border-box";
  style.width = `${geometry.width}px`;
  style.height = `${geometry.height}px`;
  return { ...attributes, style: style.cssText };
}

function previewImportedResize(geometry: Geometry): void {
  if (!resizeSession) return;
  iframeRenderer?.previewElementSize(resizeSession.nodeId, geometry.width, geometry.height);
  const overlay = canvas.querySelector<HTMLElement>("[data-selection-overlay]");
  if (!overlay) return;
  overlay.style.transform = `translate(${geometry.x - resizeSession.initialGeometry.x}px, ${geometry.y - resizeSession.initialGeometry.y}px)`;
  overlay.style.width = `${geometry.width}px`;
  overlay.style.height = `${geometry.height}px`;
}

function createNodeElement(
  node: EditorNode,
  nodes: Readonly<Record<string, EditorNode>>,
): HTMLElement {
  const element = document.createElement("div");
  element.className = "canvas-node";
  element.dataset.nodeId = node.id;
  element.setAttribute("aria-label", `Node ${node.id}`);
  const content = document.createElement("div");
  content.className = "node-content";
  if (node.children.length > 0 || Object.keys(node.attributes).length > 0) {
    content.append(
      createDomNode(node, nodes, {
        onElement(importedNode, importedElement) {
          importedElement.dataset.editorNodeId = importedNode.id;
        },
      }),
    );
  } else {
    element.classList.add("is-placeholder");
    content.dataset.editorNodeId = node.id;
    content.textContent = node.content ?? node.id;
  }
  element.append(content);
  const geometry =
    (dragSession?.nodeId === node.id || resizeSession?.nodeId === node.id) && previewGeometry
      ? previewGeometry
      : node.geometry;
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

  const hasImportedPage =
    importedPage?.topLevelIds.some((id) => snapshot.document.nodes[id]) ?? false;
  if (hasImportedPage) {
    renderIframe(snapshot.document.nodes);
  } else {
    iframeRenderer?.dispose();
    iframeRenderer = undefined;
    canvas.replaceChildren(
      ...nodes.map((node) => createNodeElement(node, snapshot.document.nodes)),
    );
  }
  tree.replaceChildren(
    ...nodes.map((node) => {
      const item = document.createElement("li");
      item.textContent = `${node.content ?? node.id} · ${node.layout}`;
      return item;
    }),
  );
  status.textContent = `${nodes.length} element${nodes.length === 1 ? "" : "s"}`;
  snapshotOutput.textContent = JSON.stringify(snapshot, null, 2);

  requiredElement<HTMLButtonElement>("[data-action='undo']").disabled = !snapshot.canUndo;
  requiredElement<HTMLButtonElement>("[data-action='redo']").disabled = !snapshot.canRedo;
  updateSelectionOverlay();
}

function renderIframe(nodes: Readonly<Record<string, EditorNode>>): void {
  if (iframeRenderer) {
    iframeRenderer.syncNodes(nodes);
    return;
  }
  if (!importedPage) return;
  const iframe = document.createElement("iframe");
  iframe.className = "canvas-frame";
  iframe.title = "Imported HTML document";
  canvas.replaceChildren(iframe);
  iframeRenderer = createIframeRenderer(iframe, {
    onSelect(nodeId) {
      selectedNodeId = nodeId;
      updateSelectionOverlay();
    },
    onLoad() {
      iframeRenderer?.syncNodes(editor.getSnapshot().document.nodes);
      updateSelectionOverlay();
    },
    onViewportChange: updateSelectionOverlay,
    onDragPreview(_nodeId, deltaX, deltaY) {
      const overlay = canvas.querySelector<HTMLElement>("[data-selection-overlay]");
      if (overlay) overlay.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
    },
    onMove(nodeId, attributes) {
      editor.dispatch(commands.setNodeAttributes({ nodeId, attributes }));
    },
    onEdit({ nodeId, element, initialHtml }) {
      richTextController.start({ nodeId, element, initialHtml });
    },
  });
  iframeRenderer.render(importedPage.srcdoc);
}

function updateSelectionOverlay(): void {
  if (resizeSession && resizingImportedElement && canvas.querySelector("[data-selection-overlay]"))
    return;
  canvas.querySelector("[data-selection-overlay]")?.remove();
  if (!selectedNodeId) return;
  const node = editor.getSnapshot().document.nodes[selectedNodeId];
  if (!node) return;

  const canvasRect = canvas.getBoundingClientRect();
  const frame = canvas.querySelector<HTMLIFrameElement>(".canvas-frame");
  const frameRect = frame?.getBoundingClientRect();
  const iframeElementRect = iframeRenderer?.getElementRect(selectedNodeId);
  const selected =
    node.geometry && !iframeRenderer
      ? canvas.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(selectedNodeId)}"]`)
      : canvas.querySelector<HTMLElement>(`[data-editor-node-id="${CSS.escape(selectedNodeId)}"]`);
  const selectedRect =
    iframeElementRect && frameRect
      ? new DOMRect(
          frameRect.left + iframeElementRect.left,
          frameRect.top + iframeElementRect.top,
          iframeElementRect.width,
          iframeElementRect.height,
        )
      : selected?.getBoundingClientRect();
  if (!selectedRect) return;
  const overlay = document.createElement("div");
  overlay.className = "selection-overlay";
  overlay.dataset.selectionOverlay = "";
  overlay.style.left = `${selectedRect.left - canvasRect.left + canvas.scrollLeft}px`;
  overlay.style.top = `${selectedRect.top - canvasRect.top + canvas.scrollTop}px`;
  overlay.style.width = `${selectedRect.width}px`;
  overlay.style.height = `${selectedRect.height}px`;
  const label = document.createElement("span");
  label.className = "selection-label";
  label.textContent = node.type;
  overlay.append(label);
  if (node.type !== "#text" && node.type !== "root") {
    const handles: readonly ResizeHandle[] = [
      "north-west",
      "north-east",
      "south-east",
      "south-west",
    ];
    for (const handleName of handles) {
      const handle = document.createElement("button");
      handle.type = "button";
      handle.className = `resize-handle resize-handle--${handleName}`;
      handle.dataset.resizeHandle = handleName;
      handle.dataset.nodeId = node.id;
      handle.setAttribute("aria-label", `Resize ${handleName}`);
      overlay.append(handle);
    }
  }
  canvas.append(overlay);
}

function startEditing(element: HTMLElement, nodeId: string): void {
  if (richTextController.isEditing()) return;
  const node = editor.getSnapshot().document.nodes[nodeId];
  if (!node || node.children.length > 0) return;
  const escapedContent = document.createElement("div");
  escapedContent.textContent = node.content ?? node.id;
  richTextController.start({
    element,
    nodeId,
    initialHtml: node.richContent ?? escapedContent.innerHTML,
  });
}

function findEditableElement(target: EventTarget | null): HTMLElement | undefined {
  if (!(target instanceof Element)) return undefined;
  return (
    target.closest<HTMLElement>("[data-editor-node-id]") ??
    target
      .closest<HTMLElement>("[data-node-id]")
      ?.querySelector<HTMLElement>("[data-editor-node-id]") ??
    undefined
  );
}

document.querySelector("[data-action='add']")?.addEventListener("click", () => {
  const number = nextNodeNumber++;
  editor.dispatch(
    commands.addNode({
      parentId: "root",
      node: {
        id: `element-${number}`,
        type: "section",
        layout: "free",
        geometry: { x: 24 * number, y: 24 * number, width: 220, height: 120 },
        attributes: { class: "demo-element" },
        content: `Element ${number}`,
      },
    }),
  );
});
const importDialog = requiredElement<HTMLDialogElement>("[data-import-dialog]");
const htmlSource = requiredElement<HTMLTextAreaElement>("[data-html-source]");
const importError = requiredElement<HTMLOutputElement>("[data-import-error]");
document.querySelector("[data-action='import']")?.addEventListener("click", () => {
  importError.textContent = "";
  importDialog.showModal();
  htmlSource.focus();
});
document.querySelector("[data-action='confirm-import']")?.addEventListener("click", () => {
  const result = importHtml(htmlSource.value, () => `imported-${nextImportedNodeNumber++}`);
  if (result.topLevelIds.length === 0) {
    importError.textContent = "Importable HTML elements were not found.";
    return;
  }
  iframeRenderer?.dispose();
  iframeRenderer = undefined;
  importedPage = { srcdoc: result.srcdoc, topLevelIds: result.topLevelIds };
  editor.dispatch(result.transaction);
  importDialog.close();
  htmlSource.value = "";
});
document.querySelector("[data-action='export']")?.addEventListener("click", () => {
  const html = exportHtml(editor.getSnapshot().document, { title: "Muscat export" });
  const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "muscat-export.html";
  link.click();
  URL.revokeObjectURL(url);
});
document.querySelector("[data-action='undo']")?.addEventListener("click", () => editor.undo());
document.querySelector("[data-action='redo']")?.addEventListener("click", () => editor.redo());
function isInsideRichTextSession(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest(".rich-text-menu")) return true;
  const canvasNode = target.closest<HTMLElement>("[data-node-id]");
  return Boolean(canvasNode?.querySelector(".ProseMirror"));
}

const editingCommitPointerEvents = new WeakSet<Event>();
document.addEventListener(
  "pointerdown",
  (event) => {
    if (!richTextController.isEditing() || isInsideRichTextSession(event.target)) return;
    if (event.target instanceof Node && canvas.contains(event.target))
      editingCommitPointerEvents.add(event);
    richTextController.finish(false);
  },
  true,
);
document.addEventListener("focusin", (event) => {
  if (!richTextController.isEditing() || isInsideRichTextSession(event.target)) return;
  richTextController.finish(false);
});
document.addEventListener("keydown", (event) => {
  if (event.defaultPrevented || event.isComposing || event.altKey) return;
  if (richTextController.isEditing() && event.key === "Escape") {
    event.preventDefault();
    richTextController.finish(true);
    return;
  }
  const target = event.target;
  if (
    target instanceof Element &&
    (target.closest("input, textarea, select") ||
      (target instanceof HTMLElement && target.isContentEditable))
  )
    return;
  if (!event.metaKey && !event.ctrlKey) return;

  const key = event.key.toLowerCase();
  const undo = key === "z" && !event.shiftKey;
  const redo = (key === "z" && event.shiftKey) || (key === "y" && event.ctrlKey);
  if (!undo && !redo) return;

  event.preventDefault();
  if (undo) editor.undo();
  else editor.redo();
});
canvas.addEventListener("pointerdown", (event) => {
  if (editingCommitPointerEvents.has(event)) return;
  if (richTextController.isEditing()) return;
  const editable = findEditableElement(event.target);
  if (event.detail >= 2 && editable?.dataset.editorNodeId) {
    event.preventDefault();
    startEditing(editable, editable.dataset.editorNodeId);
    return;
  }
  const resizeHandle = (event.target as Element).closest<HTMLElement>("[data-resize-handle]");
  const resizeNodeId = resizeHandle?.dataset.nodeId;
  const resizeHandleName = resizeHandle?.dataset.resizeHandle as ResizeHandle | undefined;
  if (resizeHandle && resizeNodeId && resizeHandleName) {
    const node = editor.getSnapshot().document.nodes[resizeNodeId];
    if (!node) return;
    const iframeRect = iframeRenderer?.getElementRect(resizeNodeId);
    const initialGeometry = iframeRect
      ? { x: iframeRect.x, y: iframeRect.y, width: iframeRect.width, height: iframeRect.height }
      : node.geometry;
    if (!initialGeometry) return;
    event.preventDefault();
    resizeHandle.setPointerCapture(event.pointerId);
    resizingImportedElement = iframeRect !== undefined;
    resizeInitialAttributes = resizingImportedElement ? node.attributes : undefined;
    resizeSession = startResizeSession(
      node.id,
      resizeHandleName,
      { x: event.clientX, y: event.clientY },
      initialGeometry,
    );
    previewGeometry = initialGeometry;
    editor.interaction.startDrag();
    return;
  }
  const selected = (event.target as Element).closest<HTMLElement>("[data-editor-node-id]");
  const target = (event.target as Element).closest<HTMLElement>("[data-node-id]");
  selectedNodeId = selected?.dataset.editorNodeId ?? target?.dataset.nodeId;
  updateSelectionOverlay();
  if (!target?.dataset.nodeId) return;
  const node = editor.getSnapshot().document.nodes[target.dataset.nodeId];
  if (!node?.geometry) return;
  target.setPointerCapture(event.pointerId);
  dragSession = startDragSession(node.id, { x: event.clientX, y: event.clientY }, node.geometry);
  previewGeometry = node.geometry;
});
canvas.addEventListener("dblclick", (event) => {
  const element = findEditableElement(event.target);
  const nodeId = element?.dataset.editorNodeId;
  if (!element || !nodeId) return;
  event.preventDefault();
  event.stopPropagation();
  startEditing(element, nodeId);
});
canvas.addEventListener("keydown", (event) => {
  if (!richTextController.isEditing()) return;
  if (event.key === "Escape") {
    event.preventDefault();
    richTextController.finish(true);
  }
});
canvas.addEventListener("scroll", updateSelectionOverlay);
canvas.addEventListener("pointermove", (event) => {
  if (richTextController.isEditing()) return;
  if (resizeSession) {
    previewGeometry = getResizeGeometry(resizeSession, { x: event.clientX, y: event.clientY });
    if (resizingImportedElement) previewImportedResize(previewGeometry);
    else render();
    return;
  }
  if (!dragSession) return;
  if (editor.getSnapshot().interaction !== "dragging") editor.interaction.startDrag();
  previewGeometry = getDragGeometry(dragSession, { x: event.clientX, y: event.clientY });
  render();
});
canvas.addEventListener("pointerup", () => {
  if (richTextController.isEditing()) return;
  if (resizeSession && previewGeometry) {
    const session = resizeSession;
    const geometry = previewGeometry;
    const importedAttributes = resizeInitialAttributes;
    const wasImportedElement = resizingImportedElement;
    resizeSession = undefined;
    previewGeometry = undefined;
    resizingImportedElement = false;
    resizeInitialAttributes = undefined;
    if (
      geometry.width !== session.initialGeometry.width ||
      geometry.height !== session.initialGeometry.height
    ) {
      if (wasImportedElement && importedAttributes) {
        editor.dispatch(
          commands.setNodeAttributes({
            nodeId: session.nodeId,
            attributes: withElementSize(importedAttributes, geometry),
          }),
        );
      } else {
        editor.dispatch(commands.moveNode({ nodeId: session.nodeId, parentId: "root", geometry }));
      }
    } else if (wasImportedElement) {
      updateSelectionOverlay();
    }
    editor.interaction.commitDrag();
    return;
  }
  if (!dragSession || !previewGeometry) return;
  const session = dragSession;
  const geometry = previewGeometry;
  dragSession = undefined;
  previewGeometry = undefined;
  const moved =
    geometry.x !== session.initialGeometry.x || geometry.y !== session.initialGeometry.y;
  if (moved) {
    editor.dispatch(commands.moveNode({ nodeId: session.nodeId, parentId: "root", geometry }));
    editor.interaction.commitDrag();
  }
});
canvas.addEventListener("pointercancel", () => {
  if (richTextController.isEditing()) return;
  if (resizeSession) {
    const wasImportedElement = resizingImportedElement;
    resizeSession = undefined;
    previewGeometry = undefined;
    resizingImportedElement = false;
    resizeInitialAttributes = undefined;
    editor.interaction.cancelDrag();
    if (wasImportedElement) iframeRenderer?.syncNodes(editor.getSnapshot().document.nodes);
    render();
    return;
  }
  if (!dragSession) return;
  dragSession = undefined;
  previewGeometry = undefined;
  if (editor.getSnapshot().interaction === "dragging") editor.interaction.cancelDrag();
  render();
});

editor.subscribe(render);
render();
