import { commands, type Command, type EditorNode, type Geometry, type Transaction } from "@muscat/core";

const BLOCKED_ELEMENTS = new Set(["script", "style", "link", "meta", "base", "iframe", "object", "embed"]);
const URL_ATTRIBUTES = new Set(["href", "src", "poster", "action", "formaction"]);

export interface HtmlImportResult {
  readonly transaction: Transaction;
  readonly topLevelIds: readonly string[];
  readonly srcdoc: string;
}

export function importHtml(html: string, nextId: () => string): HtmlImportResult {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const commandsList: Command[] = [];
  const topLevelIds: string[] = [];
  let topLevelIndex = 0;

  const addElement = (element: Element, parentId: string, geometry?: Geometry): string | undefined => {
    const tagName = element.tagName.toLowerCase();
    if (BLOCKED_ELEMENTS.has(tagName)) return undefined;

    const id = nextId();
    const attributes: Record<string, string> = {};
    for (const attribute of element.attributes) {
      const name = attribute.name.toLowerCase();
      if (name.startsWith("on") || name === "srcdoc") continue;
      if (URL_ATTRIBUTES.has(name) && !isSafeUrl(attribute.value)) continue;
      if (name === "style" && /(?:javascript\s*:|expression\s*\(|url\s*\()/i.test(attribute.value)) continue;
      attributes[name] = attribute.value;
    }
    element.setAttribute("data-muscat-node-id", id);

    commandsList.push(commands.addNode({
      parentId,
      node: {
        id,
        type: tagName,
        layout: geometry ? "free" : "flow",
        ...(geometry ? { geometry } : {}),
        attributes,
      },
    }));

    for (const child of element.childNodes) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        addElement(child as Element, id);
      } else if (child.nodeType === Node.TEXT_NODE && child.textContent?.trim()) {
        commandsList.push(commands.addNode({
          parentId: id,
          node: { id: nextId(), type: "#text", layout: "flow", attributes: {}, content: child.textContent },
        }));
      }
    }
    return id;
  };

  for (const child of parsed.body.childNodes) {
    const geometry = defaultGeometry(topLevelIndex);
    if (child.nodeType === Node.ELEMENT_NODE) {
      const id = addElement(child as Element, "root", geometry);
      if (id) {
        topLevelIds.push(id);
        topLevelIndex++;
      }
    } else if (child.nodeType === Node.TEXT_NODE && child.textContent?.trim()) {
      const id = nextId();
      commandsList.push(commands.addNode({
        parentId: "root",
        node: { id, type: "p", layout: "free", geometry, attributes: {}, content: child.textContent.trim() },
      }));
      topLevelIds.push(id);
      topLevelIndex++;
    }
  }

  sanitizeDocument(parsed);
  return {
    transaction: { commands: commandsList, label: "Import HTML" },
    topLevelIds,
    srcdoc: serializeDocument(parsed),
  };
}

function defaultGeometry(index: number): Geometry {
  return { x: 24, y: 24 + index * 204, width: 720, height: 180 };
}

function isSafeUrl(value: string): boolean {
  const normalized = value.trim().replace(/[\u0000-\u0020]/g, "").toLowerCase();
  return !normalized.startsWith("javascript:") && !normalized.startsWith("data:text/html");
}

function sanitizeDocument(document: Document): void {
  document.querySelectorAll("script, iframe, object, embed").forEach((element) => element.remove());
  document.querySelectorAll("*").forEach((element) => {
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      if (name.startsWith("on") || name === "srcdoc") element.removeAttribute(attribute.name);
      if (URL_ATTRIBUTES.has(name) && !isSafeUrl(attribute.value)) element.removeAttribute(attribute.name);
    }
  });
  const editorStyle = document.createElement("style");
  editorStyle.dataset.muscatEditorStyle = "";
  editorStyle.textContent = "[data-muscat-node-id] { cursor: move !important; }";
  document.head.append(editorStyle);
}

function serializeDocument(document: Document): string {
  const doctype = document.doctype
    ? `<!doctype ${document.doctype.name}>\n`
    : "<!doctype html>\n";
  return `${doctype}${document.documentElement.outerHTML}`;
}

export interface IframeRendererOptions {
  readonly onSelect?: (nodeId: string) => void;
  readonly onLoad?: () => void;
  readonly onViewportChange?: () => void;
  readonly onDragPreview?: (nodeId: string, deltaX: number, deltaY: number) => void;
  readonly onMove?: (nodeId: string, attributes: Readonly<Record<string, string>>) => void;
}

export interface IframeRenderer {
  render(srcdoc: string): void;
  getElementRect(nodeId: string): DOMRect | undefined;
  syncNodes(nodes: Readonly<Record<string, EditorNode>>): void;
  dispose(): void;
}

export function createIframeRenderer(
  iframe: HTMLIFrameElement,
  options: IframeRendererOptions = {},
): IframeRenderer {
  let disconnectDocument: (() => void) | undefined;

  const connectDocument = (): void => {
    disconnectDocument?.();
    const frameDocument = iframe.contentDocument;
    if (!frameDocument) return;
    let drag: {
      readonly element: HTMLElement;
      readonly nodeId: string;
      readonly originX: number;
      readonly originY: number;
      readonly initialTransform: string;
      deltaX: number;
      deltaY: number;
      moved: boolean;
    } | undefined;
    let suppressClick = false;
    const findNodeElement = (event: Event): HTMLElement | undefined => {
      const eventElement = event.target as Element | null;
      return eventElement?.closest<HTMLElement>("[data-muscat-node-id]") ?? undefined;
    };
    const handlePointerDown = (event: PointerEvent): void => {
      if (event.button !== 0) return;
      const element = findNodeElement(event);
      const nodeId = element?.dataset.muscatNodeId;
      if (!element || !nodeId) return;
      event.preventDefault();
      options.onSelect?.(nodeId);
      drag = {
        element,
        nodeId,
        originX: event.clientX,
        originY: event.clientY,
        initialTransform: element.style.transform,
        deltaX: 0,
        deltaY: 0,
        moved: false,
      };
    };
    const handlePointerMove = (event: PointerEvent): void => {
      if (!drag) return;
      const deltaX = event.clientX - drag.originX;
      const deltaY = event.clientY - drag.originY;
      drag.moved = true;
      drag.deltaX = deltaX;
      drag.deltaY = deltaY;
      const suffix = drag.initialTransform ? ` ${drag.initialTransform}` : "";
      drag.element.style.transform = `translate(${deltaX}px, ${deltaY}px)${suffix}`;
      options.onDragPreview?.(drag.nodeId, deltaX, deltaY);
    };
    const handlePointerUp = (): void => {
      if (!drag) return;
      const completed = drag;
      drag = undefined;
      if (!completed.moved) return;
      suppressClick = true;
      options.onSelect?.(completed.nodeId);
      options.onMove?.(completed.nodeId, elementAttributes(completed.element));
    };
    const handleClick = (event: Event): void => {
      if (suppressClick) {
        suppressClick = false;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      const target = findNodeElement(event);
      if (!target?.dataset.muscatNodeId) return;
      event.preventDefault();
      options.onSelect?.(target.dataset.muscatNodeId);
    };
    const handleViewportChange = (): void => options.onViewportChange?.();
    frameDocument.addEventListener("pointerdown", handlePointerDown, { capture: true });
    frameDocument.addEventListener("pointermove", handlePointerMove, { capture: true });
    frameDocument.addEventListener("pointerup", handlePointerUp, { capture: true });
    frameDocument.addEventListener("pointercancel", handlePointerUp, { capture: true });
    frameDocument.addEventListener("click", handleClick, { capture: true });
    frameDocument.addEventListener("scroll", handleViewportChange, { capture: true });
    iframe.contentWindow?.addEventListener("resize", handleViewportChange);
    disconnectDocument = () => {
      frameDocument.removeEventListener("pointerdown", handlePointerDown, { capture: true });
      frameDocument.removeEventListener("pointermove", handlePointerMove, { capture: true });
      frameDocument.removeEventListener("pointerup", handlePointerUp, { capture: true });
      frameDocument.removeEventListener("pointercancel", handlePointerUp, { capture: true });
      frameDocument.removeEventListener("click", handleClick, { capture: true });
      frameDocument.removeEventListener("scroll", handleViewportChange, { capture: true });
      iframe.contentWindow?.removeEventListener("resize", handleViewportChange);
    };
    options.onLoad?.();
  };

  iframe.setAttribute("sandbox", "allow-same-origin");
  iframe.addEventListener("load", connectDocument);

  return {
    render(srcdoc) {
      iframe.srcdoc = srcdoc;
    },
    getElementRect(nodeId) {
      const frameDocument = iframe.contentDocument;
      const element = frameDocument?.querySelector<HTMLElement>(
        `[data-muscat-node-id="${CSS.escape(nodeId)}"]`,
      );
      return element?.getBoundingClientRect();
    },
    syncNodes(nodes) {
      const frameDocument = iframe.contentDocument;
      if (!frameDocument) return;
      for (const node of Object.values(nodes)) {
        if (node.type === "#text" || node.type === "root") continue;
        const element = frameDocument.querySelector<HTMLElement>(
          `[data-muscat-node-id="${CSS.escape(node.id)}"]`,
        );
        if (!element) continue;
        for (const attribute of [...element.attributes]) {
          if (attribute.name !== "data-muscat-node-id") element.removeAttribute(attribute.name);
        }
        for (const [name, value] of Object.entries(node.attributes)) element.setAttribute(name, value);
      }
    },
    dispose() {
      disconnectDocument?.();
      iframe.removeEventListener("load", connectDocument);
      iframe.removeAttribute("srcdoc");
    },
  };
}

function elementAttributes(element: HTMLElement): Readonly<Record<string, string>> {
  const attributes: Record<string, string> = {};
  for (const attribute of element.attributes) {
    if (attribute.name !== "data-muscat-node-id") attributes[attribute.name] = attribute.value;
  }
  return attributes;
}

export interface CreateDomNodeOptions {
  readonly onElement?: (node: EditorNode, element: HTMLElement) => void;
}

export function createDomNode(
  node: EditorNode,
  nodes: Readonly<Record<string, EditorNode>>,
  options: CreateDomNodeOptions = {},
): Node {
  if (node.type === "#text") return document.createTextNode(node.content ?? "");
  const element = document.createElement(node.type);
  for (const [name, value] of Object.entries(node.attributes)) {
    try {
      element.setAttribute(name, value);
    } catch {
      // Invalid attribute names are ignored at the renderer boundary.
    }
  }
  options.onElement?.(node, element);
  if (node.content) element.append(document.createTextNode(node.content));
  for (const childId of node.children) {
    const child = nodes[childId];
    if (child) element.append(createDomNode(child, nodes, options));
  }
  return element;
}
