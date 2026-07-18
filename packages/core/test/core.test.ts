import { commands, createDocument, createEditor, getDragGeometry, startDragSession, type EditorNode } from "../src/index.js";
import { describe, expect, it } from "vitest";

const box = (id: string): Omit<EditorNode, "parentId" | "children"> => ({
  id,
  type: "div",
  layout: "free",
  geometry: { x: 0, y: 0, width: 100, height: 80 },
  attributes: {},
});

describe("headless editor", () => {
  it("adds, moves, undoes, and redoes nodes immutably", () => {
    const initial = createDocument();
    const editor = createEditor({ document: initial });
    editor.dispatch(commands.addNode({ parentId: "root", node: box("a") }));
    const afterAdd = editor.getSnapshot().document;
    expect(initial.nodes.a).toBeUndefined();
    expect(afterAdd.nodes.root?.children).toEqual(["a"]);

    editor.dispatch(commands.moveNode({
      nodeId: "a",
      parentId: "root",
      geometry: { x: 20, y: 30, width: 100, height: 80, rotation: 5 },
    }));
    expect(editor.getSnapshot().document.nodes.a?.geometry?.x).toBe(20);
    expect(editor.undo()).toBe(true);
    expect(editor.getSnapshot().document.nodes.a?.geometry?.x).toBe(0);
    expect(editor.undo()).toBe(true);
    expect(editor.getSnapshot().document.nodes.a).toBeUndefined();
    expect(editor.redo()).toBe(true);
    expect(editor.getSnapshot().document.nodes.a).toBeDefined();
  });

  it("publishes snapshots and keeps XState behind an interaction facade", () => {
    const editor = createEditor();
    const modes: string[] = [];
    const unsubscribe = editor.subscribe((state) => modes.push(state.interaction));
    editor.interaction.startDrag();
    editor.interaction.cancelDrag();
    unsubscribe();
    expect(modes).toEqual(["dragging", "idle"]);
  });

  it("rejects invalid moves through can", () => {
    const editor = createEditor();
    expect(editor.can(commands.moveNode({ nodeId: "root", parentId: "root" }))).toBe(false);
  });

  it("publishes updated history availability after undo and redo", () => {
    const editor = createEditor();
    const history: Array<[boolean, boolean]> = [];
    editor.subscribe((snapshot) => history.push([snapshot.canUndo, snapshot.canRedo]));
    editor.dispatch(commands.addNode({ parentId: "root", node: box("a") }));
    editor.undo();
    editor.redo();
    expect(history).toEqual([
      [true, false],
      [false, true],
      [true, false],
    ]);
  });

  it("updates node attributes as an undoable command", () => {
    const editor = createEditor();
    editor.dispatch(commands.addNode({ parentId: "root", node: box("a") }));
    editor.dispatch(commands.setNodeAttributes({
      nodeId: "a",
      attributes: { class: "selected", style: "transform: translate(20px, 10px)" },
    }));
    expect(editor.getSnapshot().document.nodes.a?.attributes.style).toContain("translate(20px, 10px)");
    editor.undo();
    expect(editor.getSnapshot().document.nodes.a?.attributes).toEqual({});
    editor.redo();
    expect(editor.getSnapshot().document.nodes.a?.attributes.class).toBe("selected");
  });

  it("updates text content as an undoable command", () => {
    const editor = createEditor();
    editor.dispatch(commands.addNode({
      parentId: "root",
      node: { ...box("text"), type: "#text", content: "Before" },
    }));
    editor.dispatch(commands.setNodeContent({ nodeId: "text", content: "After" }));
    expect(editor.getSnapshot().document.nodes.text?.content).toBe("After");
    editor.undo();
    expect(editor.getSnapshot().document.nodes.text?.content).toBe("Before");
    editor.redo();
    expect(editor.getSnapshot().document.nodes.text?.content).toBe("After");
  });

  it("calculates drag previews without mutating the document", () => {
    const geometry = { x: 10, y: 20, width: 100, height: 80, rotation: 5 };
    const session = startDragSession("a", { x: 50, y: 70 }, geometry);
    expect(getDragGeometry(session, { x: 85, y: 100 })).toEqual({
      x: 45,
      y: 50,
      width: 100,
      height: 80,
      rotation: 5,
    });
    expect(geometry).toEqual({ x: 10, y: 20, width: 100, height: 80, rotation: 5 });
  });
});
