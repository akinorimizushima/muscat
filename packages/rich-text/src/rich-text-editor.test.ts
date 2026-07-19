import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRichTextController } from "./rich-text-editor";
import { createRichTextMenu } from "./rich-text-menu";

afterEach(() => document.body.replaceChildren());

describe("createRichTextController", () => {
  it("commits and cleans the current session before starting another in the same document", () => {
    const first = document.createElement("p");
    const second = document.createElement("p");
    first.innerHTML = "First";
    second.innerHTML = "Second";
    document.body.append(first, second);
    const editors: Editor[] = [];
    const commits = vi.fn();
    const editingChanges: boolean[] = [];
    const controller = createRichTextController(
      {
        onCommit: commits,
        onEditingChange: (editing) => editingChanges.push(editing),
      },
      {
        createEditor(options) {
          const editor = new Editor(options);
          editors.push(editor);
          return editor;
        },
      },
    );

    controller.start({ nodeId: "first", element: first, initialHtml: "First" });
    const firstDescendant = first.querySelector(".ProseMirror")!.firstChild;
    editors[0]!.commands.setContent("<strong>First changed</strong>");
    controller.start({ nodeId: "second", element: second, initialHtml: "Second" });

    expect(commits).toHaveBeenCalledTimes(1);
    expect(commits).toHaveBeenCalledWith("first", "<strong>First changed</strong>");
    expect(first.innerHTML).toBe("<strong>First changed</strong>");
    expect(first.querySelector(".ProseMirror")).toBeNull();
    expect(controller.contains(firstDescendant)).toBe(false);
    expect(controller.contains(second.querySelector(".ProseMirror")!.firstChild)).toBe(true);
    expect(
      document.querySelectorAll('style[data-muscat-rich-text-style="controller"]'),
    ).toHaveLength(1);
    expect(editingChanges).toEqual([true, false, true]);

    controller.dispose();
    expect(controller.isEditing()).toBe(false);
    expect(document.querySelector(".rich-text-menu")).toBeNull();
    expect(document.querySelector("style[data-muscat-rich-text-style]")).toBeNull();
  });

  it("switches owner documents without leaving listeners or styles in the first document", () => {
    const firstFrame = document.createElement("iframe");
    const secondFrame = document.createElement("iframe");
    document.body.append(firstFrame, secondFrame);
    const firstDocument = firstFrame.contentDocument!;
    const secondDocument = secondFrame.contentDocument!;
    const first = firstDocument.createElement("p");
    const second = secondDocument.createElement("p");
    first.innerHTML = "First";
    second.innerHTML = "Second";
    firstDocument.body.append(first);
    secondDocument.body.append(second);
    const editors: Editor[] = [];
    const commits = vi.fn();
    const controller = createRichTextController(
      { onCommit: commits, onEditingChange: vi.fn() },
      {
        createEditor(options) {
          const editor = new Editor(options);
          editors.push(editor);
          return editor;
        },
      },
    );

    controller.start({ nodeId: "first", element: first, initialHtml: "First" });
    editors[0]!.commands.setContent("First changed");
    controller.start({ nodeId: "second", element: second, initialHtml: "Second" });

    expect(commits).toHaveBeenCalledOnce();
    expect(firstDocument.querySelector("style[data-muscat-rich-text-style]")).toBeNull();
    expect(
      secondDocument.querySelectorAll('style[data-muscat-rich-text-style="controller"]'),
    ).toHaveLength(1);
    expect(controller.contains(first)).toBe(false);
    expect(controller.contains(second.querySelector(".ProseMirror")!.firstChild)).toBe(true);
    firstDocument.body.dispatchEvent(new firstDocument.defaultView!.PointerEvent("pointerdown"));
    expect(controller.isEditing()).toBe(true);
    expect(commits).toHaveBeenCalledOnce();

    controller.dispose();
    expect(firstDocument.querySelector("style[data-muscat-rich-text-style]")).toBeNull();
    expect(secondDocument.querySelector("style[data-muscat-rich-text-style]")).toBeNull();
    expect(firstDocument.querySelector(".rich-text-menu")).toBeNull();
    expect(secondDocument.querySelector(".rich-text-menu")).toBeNull();
  });

  it("does not start the requested session when committing the current session throws", () => {
    const first = document.createElement("p");
    const second = document.createElement("p");
    first.innerHTML = "First";
    second.innerHTML = "Second";
    document.body.append(first, second);
    const editors: Editor[] = [];
    const editingChanges: boolean[] = [];
    const controller = createRichTextController(
      {
        onCommit() {
          throw new Error("switch commit failed");
        },
        onEditingChange: (editing) => editingChanges.push(editing),
      },
      {
        createEditor(options) {
          const editor = new Editor(options);
          editors.push(editor);
          return editor;
        },
      },
    );

    controller.start({ nodeId: "first", element: first, initialHtml: "First" });
    editors[0]!.commands.setContent("Changed");

    expect(() =>
      controller.start({ nodeId: "second", element: second, initialHtml: "Second" }),
    ).toThrow("switch commit failed");
    expect(editors).toHaveLength(1);
    expect(controller.isEditing()).toBe(false);
    expect(first.querySelector(".ProseMirror")).toBeNull();
    expect(second.innerHTML).toBe("Second");
    expect(second.querySelector(".ProseMirror")).toBeNull();
    expect(document.querySelector(".rich-text-menu")).toBeNull();
    expect(document.querySelector("style[data-muscat-rich-text-style]")).toBeNull();
    expect(editingChanges).toEqual([true, false]);
  });

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
