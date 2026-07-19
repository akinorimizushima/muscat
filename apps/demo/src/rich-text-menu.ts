import type { Editor } from "@tiptap/core";
import { isSafeRichTextUrl } from "@muscat/dom";

export interface RichTextMenu {
  readonly element: HTMLElement;
  update(): void;
  destroy(): void;
}

interface FormatButton {
  readonly element: HTMLButtonElement;
  readonly active: () => boolean;
  readonly enabled: () => boolean;
}

export function createRichTextMenu(editor: Editor, ownerDocument: Document): RichTextMenu {
  const element = ownerDocument.createElement("div");
  element.className = "rich-text-menu";
  element.setAttribute("role", "toolbar");
  element.setAttribute("aria-label", "Text formatting");

  const buttons: FormatButton[] = [];
  const updatePosition = (): void => {
    editor.commands.setMeta("bubbleMenu", "updatePosition");
  };
  const addButton = (
    label: string,
    text: string,
    command: () => void,
    active: () => boolean,
    enabled: () => boolean,
  ): HTMLButtonElement => {
    const button = ownerDocument.createElement("button");
    button.type = "button";
    button.className = "rich-text-menu__button";
    button.setAttribute("aria-label", label);
    button.title = label;
    button.textContent = text;
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", command);
    element.append(button);
    buttons.push({ element: button, active, enabled });
    return button;
  };

  addButton(
    "Bold",
    "B",
    () => editor.chain().focus().toggleBold().run(),
    () => editor.isActive("bold"),
    () => editor.can().chain().focus().toggleBold().run(),
  );
  addButton(
    "Italic",
    "I",
    () => editor.chain().focus().toggleItalic().run(),
    () => editor.isActive("italic"),
    () => editor.can().chain().focus().toggleItalic().run(),
  );
  addButton(
    "Underline",
    "U",
    () => editor.chain().focus().toggleUnderline().run(),
    () => editor.isActive("underline"),
    () => editor.can().chain().focus().toggleUnderline().run(),
  );
  addButton(
    "Strike",
    "S",
    () => editor.chain().focus().toggleStrike().run(),
    () => editor.isActive("strike"),
    () => editor.can().chain().focus().toggleStrike().run(),
  );
  for (const [label, text, alignment] of [
    ["Align left", "L", "left"],
    ["Align center", "C", "center"],
    ["Align right", "R", "right"],
  ] as const) {
    addButton(
      label,
      text,
      () => editor.chain().focus().setTextAlign(alignment).run(),
      () => editor.isActive({ textAlign: alignment }),
      () => editor.can().chain().focus().setTextAlign(alignment).run(),
    );
  }

  addButton(
    "Link",
    "Link",
    () => {
      linkForm.hidden = !linkForm.hidden;
      if (!linkForm.hidden) {
        urlInput.value = editor.getAttributes("link").href ?? "";
        urlInput.removeAttribute("aria-invalid");
        urlInput.focus();
      }
      updatePosition();
    },
    () => editor.isActive("link"),
    () => editor.can().chain().focus().extendMarkRange("link").run(),
  );

  const linkForm = ownerDocument.createElement("form");
  linkForm.className = "rich-text-link-form";
  linkForm.hidden = true;
  const urlLabel = ownerDocument.createElement("label");
  urlLabel.textContent = "URL";
  const urlInput = ownerDocument.createElement("input");
  urlInput.type = "url";
  urlInput.placeholder = "https://example.com";
  urlLabel.append(urlInput);
  const apply = ownerDocument.createElement("button");
  apply.type = "submit";
  apply.textContent = "Apply link";
  const remove = ownerDocument.createElement("button");
  remove.type = "button";
  remove.textContent = "Remove link";
  for (const control of [urlInput, apply, remove]) {
    control.addEventListener("mousedown", (event) => event.stopPropagation());
  }
  linkForm.append(urlLabel, apply, remove);
  element.append(linkForm);

  linkForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const href = urlInput.value.trim();
    if (!href || !isSafeRichTextUrl(href)) {
      urlInput.setAttribute("aria-invalid", "true");
      return;
    }
    urlInput.removeAttribute("aria-invalid");
    editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    linkForm.hidden = true;
    updatePosition();
  });
  remove.addEventListener("click", () => {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    linkForm.hidden = true;
    updatePosition();
  });

  const update = (): void => {
    for (const button of buttons) {
      button.element.setAttribute("aria-pressed", String(button.active()));
      button.element.disabled = !button.enabled();
    }
  };
  editor.on("selectionUpdate", update);
  editor.on("transaction", update);
  update();

  return {
    element,
    update,
    destroy() {
      editor.off("selectionUpdate", update);
      editor.off("transaction", update);
      element.remove();
    },
  };
}
