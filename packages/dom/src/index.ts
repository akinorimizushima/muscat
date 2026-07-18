import { commands, type Command, type EditorNode, type Geometry, type Transaction } from "@muscat/core";

const BLOCKED_ELEMENTS = new Set(["script", "style", "link", "meta", "base", "iframe", "object", "embed"]);
const URL_ATTRIBUTES = new Set(["href", "src", "poster", "action", "formaction"]);

export interface HtmlImportResult {
  readonly transaction: Transaction;
  readonly topLevelIds: readonly string[];
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
    const geometry = defaultGeometry(topLevelIndex++);
    if (child.nodeType === Node.ELEMENT_NODE) {
      const id = addElement(child as Element, "root", geometry);
      if (id) topLevelIds.push(id);
    } else if (child.nodeType === Node.TEXT_NODE && child.textContent?.trim()) {
      const id = nextId();
      commandsList.push(commands.addNode({
        parentId: "root",
        node: { id, type: "p", layout: "free", geometry, attributes: {}, content: child.textContent.trim() },
      }));
      topLevelIds.push(id);
    }
  }

  return { transaction: { commands: commandsList, label: "Import HTML" }, topLevelIds };
}

function defaultGeometry(index: number): Geometry {
  return { x: 24 + (index % 3) * 32, y: 24 + index * 36, width: 360, height: 180 };
}

function isSafeUrl(value: string): boolean {
  const normalized = value.trim().replace(/[\u0000-\u0020]/g, "").toLowerCase();
  return !normalized.startsWith("javascript:") && !normalized.startsWith("data:text/html");
}

export function createDomNode(node: EditorNode, nodes: Readonly<Record<string, EditorNode>>): Node {
  if (node.type === "#text") return document.createTextNode(node.content ?? "");
  const element = document.createElement(node.type);
  for (const [name, value] of Object.entries(node.attributes)) {
    try {
      element.setAttribute(name, value);
    } catch {
      // Invalid attribute names are ignored at the renderer boundary.
    }
  }
  if (node.content) element.append(document.createTextNode(node.content));
  for (const childId of node.children) {
    const child = nodes[childId];
    if (child) element.append(createDomNode(child, nodes));
  }
  return element;
}
