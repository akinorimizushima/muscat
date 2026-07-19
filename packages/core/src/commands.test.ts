import { describe, expect, it } from "vitest";
import { commands } from "./commands";
import { createEditor } from "./editor";
import type { EditorNode } from "./model";

const box = (id: string): Omit<EditorNode, "parentId" | "children"> => ({
  id,
  type: "div",
  layout: "free",
  geometry: { x: 0, y: 0, width: 100, height: 80 },
  attributes: {},
});

describe("commands", () => {
  it("updates node attributes as an undoable command", () => {
    const editor = createEditor();
    editor.dispatch(commands.addNode({ parentId: "root", node: box("a") }));
    editor.dispatch(
      commands.setNodeAttributes({
        nodeId: "a",
        attributes: { class: "selected", style: "transform: translate(20px, 10px)" },
      }),
    );
    expect(editor.getSnapshot().document.nodes.a?.attributes.style).toContain(
      "translate(20px, 10px)",
    );
    editor.undo();
    expect(editor.getSnapshot().document.nodes.a?.attributes).toEqual({});
    editor.redo();
    expect(editor.getSnapshot().document.nodes.a?.attributes.class).toBe("selected");
  });

  it("updates text content as an undoable command", () => {
    const editor = createEditor();
    editor.dispatch(
      commands.addNode({
        parentId: "root",
        node: { ...box("text"), type: "#text", content: "Before" },
      }),
    );
    editor.dispatch(commands.setNodeContent({ nodeId: "text", content: "After" }));
    expect(editor.getSnapshot().document.nodes.text?.content).toBe("After");
    editor.undo();
    expect(editor.getSnapshot().document.nodes.text?.content).toBe("Before");
    editor.redo();
    expect(editor.getSnapshot().document.nodes.text?.content).toBe("After");
  });

  it("updates rich content as one undoable command", () => {
    const editor = createEditor();
    editor.dispatch(
      commands.addNode({
        parentId: "root",
        node: { ...box("text"), type: "p", content: "Before" },
      }),
    );

    editor.dispatch(
      commands.setNodeRichContent({ nodeId: "text", richContent: "<strong>After</strong>" }),
    );
    expect(editor.getSnapshot().document.nodes.text?.richContent).toBe("<strong>After</strong>");

    editor.undo();
    expect(editor.getSnapshot().document.nodes.text?.richContent).toBeUndefined();

    editor.redo();
    expect(editor.getSnapshot().document.nodes.text?.richContent).toBe("<strong>After</strong>");
  });
});
