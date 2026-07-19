import { describe, expect, it } from "vitest";
import { applyTransaction, createDocument, type EditorNode } from "@muscat/core";
import { createDomNode } from "./create-dom-node";
import { exportHtml, importHtml } from "./html";
import { sanitizeRichContent } from "./rich-content";

describe("sanitizeRichContent", () => {
  it("keeps supported marks, alignment, and safe links", () => {
    expect(
      sanitizeRichContent(
        '<p style="text-align: center; color: red"><strong><u>A</u></strong> <a href="/docs">B</a></p>',
      ),
    ).toBe('<p style="text-align: center"><strong><u>A</u></strong> <a href="/docs">B</a></p>');
  });

  it("removes executable markup and unsafe links", () => {
    expect(
      sanitizeRichContent(
        '<script>alert(1)</script><a href="javascript:alert(1)" onclick="alert(2)">Unsafe</a>',
      ),
    ).toBe("<a>Unsafe</a>");
  });
});

describe("rich content DOM compatibility", () => {
  it("renders formatted descendants from rich content", () => {
    const node: EditorNode = {
      id: "paragraph",
      type: "p",
      parentId: "root",
      children: [],
      layout: "flow",
      attributes: {},
      richContent: '<strong>Hello</strong> <a href="/docs">docs</a>',
    };

    const element = createDomNode(node, { paragraph: node }) as HTMLElement;

    expect(element.querySelector("strong")?.textContent).toBe("Hello");
    expect(element.querySelector("a")?.getAttribute("href")).toBe("/docs");
  });

  it("preserves inline markup across import and export without editor markers", () => {
    let nextId = 0;
    const imported = importHtml(
      '<p><strong>Hello</strong> <a href="/docs">docs</a></p>',
      () => `node-${++nextId}`,
    );
    const applied = applyTransaction(createDocument(), imported.transaction);

    expect(applied.document.nodes["node-1"]?.richContent).toBe(
      '<strong>Hello</strong> <a href="/docs">docs</a>',
    );
    const exported = exportHtml(applied.document);
    expect(exported).toContain('<strong>Hello</strong> <a href="/docs">docs</a>');
    expect(exported).not.toContain("data-muscat-node-id");
  });
});
