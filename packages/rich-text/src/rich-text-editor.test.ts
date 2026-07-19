import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRichTextController } from "./rich-text-editor";
import { createRichTextMenu } from "./rich-text-menu";

afterEach(() => document.body.replaceChildren());

describe("createRichTextController", () => {
  it("reports editor and menu descendants only while the main-document session is active", () => {
    const element = document.createElement("p");
    element.innerHTML = "Original";
    document.body.append(element);
    const outside = document.createElement("button");
    document.body.append(outside);
    let menuElement: HTMLElement | undefined;
    const controller = createRichTextController(
      { onCommit: vi.fn(), onEditingChange: vi.fn() },
      {
        createMenu(...args) {
          const menu = createRichTextMenu(...args);
          menuElement = menu.element;
          return menu;
        },
      },
    );

    expect(controller.contains(element)).toBe(false);
    controller.start({ nodeId: "paragraph", element, initialHtml: "Original" });
    expect(controller.contains(element.querySelector(".ProseMirror")!.firstChild)).toBe(true);
    expect(controller.contains(menuElement!.firstChild)).toBe(true);
    expect(controller.contains(outside)).toBe(false);

    controller.dispose();
    expect(controller.contains(element)).toBe(false);
  });

  it("reports descendants from an iframe owner document", () => {
    const iframe = document.createElement("iframe");
    document.body.append(iframe);
    const iframeDocument = iframe.contentDocument!;
    const element = iframeDocument.createElement("p");
    element.innerHTML = "Original";
    iframeDocument.body.append(element);
    let menuElement: HTMLElement | undefined;
    const controller = createRichTextController(
      { onCommit: vi.fn(), onEditingChange: vi.fn() },
      {
        createMenu(...args) {
          const menu = createRichTextMenu(...args);
          menuElement = menu.element;
          return menu;
        },
      },
    );

    controller.start({ nodeId: "paragraph", element, initialHtml: "Original" });
    expect(controller.contains(element.querySelector(".ProseMirror")!.firstChild)).toBe(true);
    expect(controller.contains(menuElement!.firstChild)).toBe(true);
    expect(controller.contains(document.body)).toBe(false);

    controller.finish(true);
    expect(controller.contains(element)).toBe(false);
  });

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
    expect(
      document.querySelectorAll('style[data-muscat-rich-text-style="controller"]'),
    ).toHaveLength(1);

    expect(() => controller.finish(false)).toThrow("commit failed");
    expect(controller.isEditing()).toBe(false);
    expect(element.querySelector(".ProseMirror")).toBeNull();
    expect(document.querySelector(".rich-text-menu")).toBeNull();
    expect(document.querySelector("style[data-muscat-rich-text-style]")).toBeNull();
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
