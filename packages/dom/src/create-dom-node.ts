import type { EditorNode } from "@muscat/core";

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
