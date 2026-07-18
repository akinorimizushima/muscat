import { commands, createDocument, createEditor, type EditorNode } from "../src/index.js";
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
});
