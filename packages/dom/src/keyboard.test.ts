import { commands, createEditor } from "@muscat/core";
import { describe, expect, it, vi } from "vitest";
import { createElementDeletionController } from "./keyboard";

function createSelectedEditor() {
  const editor = createEditor();
  editor.dispatch(
    commands.addNode({
      parentId: "root",
      node: {
        id: "selected",
        type: "section",
        layout: "flow",
        attributes: {},
      },
    }),
  );
  return editor;
}

describe("createElementDeletionController", () => {
  it.each(["Backspace", "Delete"])("removes the selected node with %s", (key) => {
    const editor = createSelectedEditor();
    const clearSelection = vi.fn();
    const controller = createElementDeletionController({
      editor,
      getSelectedNodeId: () => "selected",
      clearSelection,
      isEditing: () => false,
    });
    const target = document.createElement("div");
    target.addEventListener("keydown", controller.handleKeyDown);
    const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });

    target.dispatchEvent(event);

    expect(editor.getSnapshot().document.nodes.selected).toBeUndefined();
    expect(clearSelection).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
  });

  it("leaves deletion to editable targets", () => {
    const editor = createSelectedEditor();
    const clearSelection = vi.fn();
    const controller = createElementDeletionController({
      editor,
      getSelectedNodeId: () => "selected",
      clearSelection,
      isEditing: () => false,
    });
    const target = document.createElement("textarea");
    target.addEventListener("keydown", controller.handleKeyDown);
    const event = new KeyboardEvent("keydown", {
      key: "Backspace",
      bubbles: true,
      cancelable: true,
    });

    target.dispatchEvent(event);

    expect(editor.getSnapshot().document.nodes.selected).toBeDefined();
    expect(clearSelection).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });
});
