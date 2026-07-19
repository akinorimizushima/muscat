import { afterEach, describe, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
import { createRichTextController } from "./rich-text-editor";

afterEach(() => document.body.replaceChildren());

describe("createRichTextController", () => {
  it("cleans up the session and propagates a commit error", () => {
    const element = document.createElement("p");
    element.innerHTML = "Original";
    document.body.append(element);
    const editingChanges: boolean[] = [];
    let editor: Editor | undefined;
    const controller = createRichTextController(
      {
        onCommit() {
          throw new Error("commit failed");
        },
        onEditingChange: (editing) => editingChanges.push(editing),
      },
      {
        createEditor(options) {
          editor = new Editor(options);
          return editor;
        },
      },
    );

    controller.start({ nodeId: "paragraph", element, initialHtml: "Original" });
    editor!.commands.setContent("Changed");

    expect(() => controller.finish(false)).toThrow("commit failed");
    expect(controller.isEditing()).toBe(false);
    expect(element.querySelector(".ProseMirror")).toBeNull();
    expect(document.querySelector(".rich-text-menu")).toBeNull();
    expect(editingChanges).toEqual([true, false]);
    expect(() => controller.finish(false)).not.toThrow();
  });

  it("rolls back the host when editor initialization throws", () => {
    const element = document.createElement("p");
    element.innerHTML = "Original <strong>content</strong>";
    document.body.append(element);
    const editingChanges: boolean[] = [];
    const controller = createRichTextController(
      {
        onCommit: vi.fn(),
        onEditingChange: (editing) => editingChanges.push(editing),
      },
      {
        createEditor() {
          throw new Error("initialization failed");
        },
      },
    );

    expect(() =>
      controller.start({ nodeId: "paragraph", element, initialHtml: element.innerHTML }),
    ).toThrow("initialization failed");
    expect(element.innerHTML).toBe("Original <strong>content</strong>");
    expect(controller.isEditing()).toBe(false);
    expect(document.querySelector(".rich-text-menu")).toBeNull();
    expect(editingChanges).toEqual([false]);
  });
});
