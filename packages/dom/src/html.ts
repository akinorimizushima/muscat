import {
  commands,
  type Command,
  type EditorDocument,
  type Geometry,
  type Transaction,
} from "@muscat/core";
import { createDomNode } from "./create-dom-node";
import { sanitizeRichContent } from "./rich-content";

const BLOCKED_ELEMENTS = new Set([
  "script",
  "style",
  "link",
  "meta",
  "base",
  "iframe",
  "object",
  "embed",
]);
const URL_ATTRIBUTES = new Set(["href", "src", "poster", "action", "formaction"]);
const BLOCK_ELEMENTS = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "details",
  "dialog",
  "div",
  "dl",
  "fieldset",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "main",
  "nav",
  "ol",
  "p",
  "pre",
  "section",
  "table",
  "ul",
]);

export interface HtmlImportResult {
  readonly transaction: Transaction;
  readonly topLevelIds: readonly string[];
  readonly srcdoc: string;
}

export interface HtmlExportOptions {
  readonly language?: string;
  readonly title?: string;
}

export function exportHtml(
  editorDocument: EditorDocument,
  options: HtmlExportOptions = {},
): string {
  const root = editorDocument.nodes[editorDocument.rootId];
  if (!root) throw new Error(`Document root was not found: ${editorDocument.rootId}`);

  const exportedDocument = document.implementation.createHTMLDocument(options.title ?? "");
  if (options.language) exportedDocument.documentElement.lang = options.language;
  const charset = exportedDocument.createElement("meta");
  charset.setAttribute("charset", "UTF-8");
  exportedDocument.head.prepend(charset);

  for (const childId of root.children) {
    const child = editorDocument.nodes[childId];
    if (child) exportedDocument.body.append(createDomNode(child, editorDocument.nodes));
  }

  sanitizeDocument(exportedDocument, false);

  return `<!doctype html>\n${exportedDocument.documentElement.outerHTML}`;
}

export function importHtml(html: string, nextId: () => string): HtmlImportResult {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const commandsList: Command[] = [];
  const topLevelIds: string[] = [];
  let topLevelIndex = 0;

  const addElement = (
    element: Element,
    parentId: string,
    geometry?: Geometry,
  ): string | undefined => {
    const tagName = element.tagName.toLowerCase();
    if (BLOCKED_ELEMENTS.has(tagName)) return undefined;

    const id = nextId();
    const attributes: Record<string, string> = {};
    for (const attribute of element.attributes) {
      const name = attribute.name.toLowerCase();
      if (name.startsWith("on") || name === "srcdoc") continue;
      if (URL_ATTRIBUTES.has(name) && !isSafeUrl(attribute.value)) continue;
      if (name === "style" && /(?:javascript\s*:|expression\s*\(|url\s*\()/i.test(attribute.value))
        continue;
      attributes[name] = attribute.value;
    }
    element.setAttribute("data-muscat-node-id", id);

    const descendants = [...element.querySelectorAll("*")];
    const hasBlockChildren = descendants.some((child) => {
      const display = (child as HTMLElement).style.display.toLowerCase();
      return (
        BLOCK_ELEMENTS.has(child.tagName.toLowerCase()) ||
        display === "block" ||
        display === "flex" ||
        display === "grid" ||
        display === "table" ||
        display === "list-item"
      );
    });
    const richContent =
      hasBlockChildren || descendants.length === 0
        ? undefined
        : sanitizeRichContent(element.innerHTML, parsed);

    commandsList.push(
      commands.addNode({
        parentId,
        node: {
          id,
          type: tagName,
          layout: geometry ? "free" : "flow",
          ...(geometry ? { geometry } : {}),
          attributes,
          ...(richContent === undefined ? {} : { richContent }),
        },
      }),
    );

    if (richContent !== undefined) return id;

    // Take a snapshot because this loop inserts marker comments into the live NodeList.
    // oxlint-disable-next-line unicorn/no-useless-spread
    for (const child of [...element.childNodes]) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        addElement(child as Element, id);
      } else if (child.nodeType === Node.TEXT_NODE && child.textContent?.trim()) {
        const textId = nextId();
        element.insertBefore(parsed.createComment(`muscat-text:${textId}`), child);
        commandsList.push(
          commands.addNode({
            parentId: id,
            node: {
              id: textId,
              type: "#text",
              layout: "flow",
              attributes: {},
              content: child.textContent,
            },
          }),
        );
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
      commandsList.push(
        commands.addNode({
          parentId: "root",
          node: {
            id,
            type: "p",
            layout: "free",
            geometry,
            attributes: {},
            content: child.textContent.trim(),
          },
        }),
      );
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
  /* oxlint-disable eslint/no-control-regex -- URL normalization intentionally strips ASCII control characters. */
  const normalized = value
    .trim()
    .replace(/[\u0000-\u0020]/g, "")
    .toLowerCase();
  /* oxlint-enable eslint/no-control-regex */
  return !normalized.startsWith("javascript:") && !normalized.startsWith("data:text/html");
}

function sanitizeDocument(document: Document, editorDocument = true): void {
  document.querySelectorAll("script, iframe, object, embed").forEach((element) => element.remove());
  document.querySelectorAll("*").forEach((element) => {
    // Take a snapshot because removing entries mutates the live NamedNodeMap.
    // oxlint-disable-next-line unicorn/no-useless-spread
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      if (name.startsWith("on") || name === "srcdoc") element.removeAttribute(attribute.name);
      if (URL_ATTRIBUTES.has(name) && !isSafeUrl(attribute.value))
        element.removeAttribute(attribute.name);
      if (!editorDocument && name === "data-muscat-node-id")
        element.removeAttribute(attribute.name);
    }
  });
  document
    .querySelectorAll("style[data-muscat-editor-style]")
    .forEach((element) => element.remove());
  if (!editorDocument) return;
  const editorStyle = document.createElement("style");
  editorStyle.dataset.muscatEditorStyle = "";
  editorStyle.textContent = `
    [data-muscat-node-id] { cursor: move !important; }
    [contenteditable] { cursor: text !important; }
  `;
  document.head.append(editorStyle);
}

function serializeDocument(document: Document): string {
  const doctype = document.doctype ? `<!doctype ${document.doctype.name}>\n` : "<!doctype html>\n";
  return `${doctype}${document.documentElement.outerHTML}`;
}
