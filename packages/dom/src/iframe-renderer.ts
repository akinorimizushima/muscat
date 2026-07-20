import type { EditorNode } from "@muscat/core";
import { appendRichContent } from "./rich-content";

export interface IframeEditRequest {
  readonly nodeId: string;
  readonly element: HTMLElement;
  readonly initialHtml: string;
}

export interface IframeRendererOptions {
  readonly onSelect?: (nodeId: string) => void;
  readonly onKeyDown?: (event: KeyboardEvent) => void;
  readonly onLoad?: () => void;
  readonly onViewportChange?: () => void;
  readonly onDragPreview?: (nodeId: string, deltaX: number, deltaY: number) => void;
  readonly onMove?: (nodeId: string, attributes: Readonly<Record<string, string>>) => void;
  readonly onEdit?: (request: IframeEditRequest) => void;
  readonly onEditingInvalidated?: () => void;
}

export interface IframeRenderer {
  render(srcdoc: string): void;
  getElementRect(nodeId: string): DOMRect | undefined;
  previewElementSize(nodeId: string, width: number, height: number): void;
  syncNodes(nodes: Readonly<Record<string, EditorNode>>): void;
  setEditing(editing: boolean): void;
  dispose(): void;
}

export function createIframeRenderer(
  iframe: HTMLIFrameElement,
  options: IframeRendererOptions = {},
): IframeRenderer {
  let disconnectDocument: (() => void) | undefined;
  let editing = false;
  let editingElement: HTMLElement | undefined;
  const invalidateEditing = (): void => {
    if (!editing) return;
    editing = false;
    editingElement = undefined;
    options.onEditingInvalidated?.();
  };

  const connectDocument = (): void => {
    invalidateEditing();
    disconnectDocument?.();
    const frameDocument = iframe.contentDocument;
    if (!frameDocument) return;
    let drag:
      | {
          readonly element: HTMLElement;
          readonly nodeId: string;
          readonly originX: number;
          readonly originY: number;
          readonly position: string;
          readonly initialLeft: string;
          readonly initialTop: string;
          deltaX: number;
          deltaY: number;
          moved: boolean;
        }
      | undefined;
    let suppressClick = false;
    const findNodeElement = (event: Event): HTMLElement | undefined => {
      const eventElement = event.target as Element | null;
      return eventElement?.closest<HTMLElement>("[data-muscat-node-id]") ?? undefined;
    };
    const handlePointerDown = (event: PointerEvent): void => {
      if (event.button !== 0) return;
      if (editing) {
        const target = event.target as Element | null;
        if (editingElement?.contains(target) || target?.closest('[role="toolbar"]')) return;
        suppressClick = true;
        return;
      }
      const element = findNodeElement(event);
      const nodeId = element?.dataset.muscatNodeId;
      if (!element || !nodeId) return;
      event.preventDefault();
      options.onSelect?.(nodeId);
      const computedStyle = iframe.contentWindow?.getComputedStyle(element);
      drag = {
        element,
        nodeId,
        originX: event.clientX,
        originY: event.clientY,
        position:
          element.style.position ||
          (computedStyle?.position === "static"
            ? "relative"
            : (computedStyle?.position ?? "relative")),
        initialLeft:
          element.style.left ||
          (computedStyle?.left === "auto" ? "0px" : (computedStyle?.left ?? "0px")),
        initialTop:
          element.style.top ||
          (computedStyle?.top === "auto" ? "0px" : (computedStyle?.top ?? "0px")),
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
      drag.element.style.position = drag.position;
      drag.element.style.left = `calc(${drag.initialLeft} + ${deltaX}px)`;
      drag.element.style.top = `calc(${drag.initialTop} + ${deltaY}px)`;
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
    const handleDoubleClick = (event: Event): void => {
      const element = findNodeElement(event);
      const nodeId = element?.dataset.muscatNodeId;
      if (!element || !nodeId || element.querySelector("[data-muscat-node-id]") || editing) return;
      event.preventDefault();
      event.stopPropagation();
      editingElement = element;
      options.onEdit?.({ nodeId, element, initialHtml: element.innerHTML });
    };
    const handleKeyDown = (event: KeyboardEvent): void => options.onKeyDown?.(event);
    const handleViewportChange = (): void => options.onViewportChange?.();
    frameDocument.addEventListener("pointerdown", handlePointerDown, { capture: true });
    frameDocument.addEventListener("pointermove", handlePointerMove, { capture: true });
    frameDocument.addEventListener("pointerup", handlePointerUp, { capture: true });
    frameDocument.addEventListener("pointercancel", handlePointerUp, { capture: true });
    frameDocument.addEventListener("click", handleClick, { capture: true });
    frameDocument.addEventListener("dblclick", handleDoubleClick, { capture: true });
    frameDocument.addEventListener("keydown", handleKeyDown);
    frameDocument.addEventListener("scroll", handleViewportChange, { capture: true });
    iframe.contentWindow?.addEventListener("resize", handleViewportChange);
    disconnectDocument = () => {
      frameDocument.removeEventListener("pointerdown", handlePointerDown, { capture: true });
      frameDocument.removeEventListener("pointermove", handlePointerMove, { capture: true });
      frameDocument.removeEventListener("pointerup", handlePointerUp, { capture: true });
      frameDocument.removeEventListener("pointercancel", handlePointerUp, { capture: true });
      frameDocument.removeEventListener("click", handleClick, { capture: true });
      frameDocument.removeEventListener("dblclick", handleDoubleClick, { capture: true });
      frameDocument.removeEventListener("keydown", handleKeyDown);
      frameDocument.removeEventListener("scroll", handleViewportChange, { capture: true });
      iframe.contentWindow?.removeEventListener("resize", handleViewportChange);
    };
    options.onLoad?.();
  };

  iframe.setAttribute("sandbox", "allow-same-origin");
  iframe.addEventListener("load", connectDocument);

  return {
    render(srcdoc) {
      invalidateEditing();
      iframe.srcdoc = srcdoc;
    },
    getElementRect(nodeId) {
      const frameDocument = iframe.contentDocument;
      const element = frameDocument?.querySelector<HTMLElement>(
        `[data-muscat-node-id="${CSS.escape(nodeId)}"]`,
      );
      return element?.getBoundingClientRect();
    },
    previewElementSize(nodeId, width, height) {
      const element = iframe.contentDocument?.querySelector<HTMLElement>(
        `[data-muscat-node-id="${CSS.escape(nodeId)}"]`,
      );
      if (!element) return;
      element.style.boxSizing = "border-box";
      element.style.width = `${width}px`;
      element.style.height = `${height}px`;
    },
    syncNodes(nodes) {
      const frameDocument = iframe.contentDocument;
      if (!frameDocument) return;
      for (const element of frameDocument.querySelectorAll<HTMLElement>("[data-muscat-node-id]")) {
        const nodeId = element.dataset.muscatNodeId;
        if (nodeId && !nodes[nodeId]) element.remove();
      }
      const root = Object.values(nodes).find((node) => node.parentId === null);
      if (root && !hasManagedChildren(frameDocument.body, root, nodes))
        restoreManagedChildren(frameDocument.body, root, nodes);
      for (const node of Object.values(nodes)) {
        if (node.type === "#text") {
          const textNode = findTextNode(frameDocument, node.id);
          if (textNode) textNode.data = node.content ?? "";
          continue;
        }
        if (node.type === "root") continue;
        const element = frameDocument.querySelector<HTMLElement>(
          `[data-muscat-node-id="${CSS.escape(node.id)}"]`,
        );
        if (!element) continue;
        // Take a snapshot because removing entries mutates the live NamedNodeMap.
        // oxlint-disable-next-line unicorn/no-useless-spread
        for (const attribute of [...element.attributes]) {
          if (attribute.name !== "data-muscat-node-id") element.removeAttribute(attribute.name);
        }
        for (const [name, value] of Object.entries(node.attributes))
          element.setAttribute(name, value);
        if (editing && element === editingElement) continue;
        if (node.richContent !== undefined) {
          element.replaceChildren();
          appendRichContent(element, node.richContent);
        } else if (!hasManagedChildren(element, node, nodes)) {
          restoreManagedChildren(element, node, nodes);
        }
      }
    },
    setEditing(isEditing) {
      editing = isEditing;
      if (!isEditing) editingElement = undefined;
    },
    dispose() {
      invalidateEditing();
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

function findTextNode(document: Document, nodeId: string): Text | undefined {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_COMMENT);
  while (walker.nextNode()) {
    const comment = walker.currentNode as Comment;
    if (
      comment.data === `muscat-text:${nodeId}` &&
      comment.nextSibling?.nodeType === Node.TEXT_NODE
    ) {
      return comment.nextSibling as Text;
    }
  }
  return undefined;
}

function hasManagedChildren(
  element: HTMLElement,
  node: EditorNode,
  nodes: Readonly<Record<string, EditorNode>>,
): boolean {
  if (node.children.length === 0) return element.childNodes.length === 0;
  return node.children.every((childId) => {
    const child = nodes[childId];
    if (!child) return true;
    if (child.type !== "#text")
      return [...element.children].some(
        (candidate) => candidate.getAttribute("data-muscat-node-id") === childId,
      );
    return [...element.childNodes].some(
      (candidate) =>
        candidate.nodeType === Node.COMMENT_NODE &&
        (candidate as Comment).data === `muscat-text:${childId}` &&
        candidate.nextSibling?.nodeType === Node.TEXT_NODE,
    );
  });
}

function restoreManagedChildren(
  element: HTMLElement,
  node: EditorNode,
  nodes: Readonly<Record<string, EditorNode>>,
): void {
  const document = element.ownerDocument;
  element.replaceChildren(
    ...node.children.flatMap((childId): Node[] => {
      const child = nodes[childId];
      if (!child) return [];
      if (child.type === "#text")
        return [
          document.createComment(`muscat-text:${child.id}`),
          document.createTextNode(child.content ?? ""),
        ];
      const childElement = document.createElement(child.type);
      childElement.dataset.muscatNodeId = child.id;
      for (const [name, value] of Object.entries(child.attributes))
        childElement.setAttribute(name, value);
      if (child.richContent !== undefined) appendRichContent(childElement, child.richContent);
      else restoreManagedChildren(childElement, child, nodes);
      return [childElement];
    }),
  );
}
