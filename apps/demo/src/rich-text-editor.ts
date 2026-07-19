import { Editor } from "@tiptap/core";
import { BubbleMenuPlugin } from "@tiptap/extension-bubble-menu";
import Link from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import StarterKit from "@tiptap/starter-kit";
import { isSafeRichTextUrl, sanitizeRichContent } from "@muscat/dom";
import { createRichTextMenu, type RichTextMenu } from "./rich-text-menu";

export interface RichTextStartOptions {
  readonly nodeId: string;
  readonly element: HTMLElement;
  readonly initialHtml: string;
}

export interface RichTextController {
  start(options: RichTextStartOptions): void;
  finish(cancel: boolean): void;
  isEditing(): boolean;
  dispose(): void;
}

export function createRichTextController(options: {
  readonly onCommit: (nodeId: string, richContent: string) => void;
  readonly onEditingChange: (editing: boolean) => void;
}): RichTextController {
  let session:
    | {
        nodeId: string;
        element: HTMLElement;
        initialHtml: string;
        editor: Editor;
        menu: RichTextMenu;
        disconnectOwnerDocument: () => void;
      }
    | undefined;

  const finish = (cancel: boolean): void => {
    if (!session) return;
    const completed = session;
    session = undefined;
    completed.disconnectOwnerDocument();
    const currentHtml = serializeRichContent(completed.editor, completed.element);
    completed.editor.destroy();
    completed.menu.destroy();
    completed.element.innerHTML = cancel ? completed.initialHtml : currentHtml;
    if (!cancel && currentHtml !== completed.initialHtml)
      options.onCommit(completed.nodeId, currentHtml);
    options.onEditingChange(false);
  };

  return {
    start(startOptions) {
      if (session) return;
      const ownerDocument = startOptions.element.ownerDocument;
      const safeInitialHtml = sanitizeRichContent(startOptions.initialHtml, ownerDocument);
      startOptions.element.replaceChildren();
      const tiptap = new Editor({
        element: startOptions.element,
        content: safeInitialHtml,
        extensions: [
          StarterKit.configure({ link: false, underline: false }),
          Underline,
          Link.configure({
            openOnClick: false,
            HTMLAttributes: { target: null, rel: null },
            isAllowedUri: (url) => isSafeRichTextUrl(url),
          }),
          TextAlign.configure({ types: ["paragraph"], alignments: ["left", "center", "right"] }),
        ],
      });
      const menu = createRichTextMenu(tiptap, ownerDocument);
      tiptap.registerPlugin(
        BubbleMenuPlugin({
          pluginKey: "muscatRichTextMenu",
          editor: tiptap,
          element: menu.element,
          appendTo: () => ownerDocument.body,
          shouldShow: ({ from, to }) => from !== to,
          options: {
            strategy: "fixed",
            placement: "top",
            offset: 8,
            flip: true,
            shift: true,
            inline: true,
          },
        }),
      );
      const initialHtml = serializeRichContent(tiptap, startOptions.element);
      const isInsideSession = (target: EventTarget | null): boolean =>
        target instanceof ownerDocument.defaultView!.Node &&
        (startOptions.element.contains(target) || menu.element.contains(target));
      const handlePointerDown = (event: PointerEvent): void => {
        if (!isInsideSession(event.target)) finish(false);
      };
      const handleKeyDown = (event: KeyboardEvent): void => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        finish(true);
      };
      const ownsDocumentEvents = ownerDocument !== document;
      if (ownsDocumentEvents) {
        ownerDocument.addEventListener("pointerdown", handlePointerDown, { capture: true });
        ownerDocument.addEventListener("keydown", handleKeyDown, { capture: true });
      }
      session = {
        nodeId: startOptions.nodeId,
        element: startOptions.element,
        initialHtml,
        editor: tiptap,
        menu,
        disconnectOwnerDocument() {
          if (!ownsDocumentEvents) return;
          ownerDocument.removeEventListener("pointerdown", handlePointerDown, { capture: true });
          ownerDocument.removeEventListener("keydown", handleKeyDown, { capture: true });
        },
      };
      options.onEditingChange(true);
      tiptap.commands.focus("all");
    },
    finish,
    isEditing: () => session !== undefined,
    dispose() {
      finish(true);
    },
  };
}

const phrasingContentHosts = new Set([
  "ABBR",
  "B",
  "BUTTON",
  "CITE",
  "CODE",
  "EM",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "I",
  "KBD",
  "LABEL",
  "LEGEND",
  "MARK",
  "Q",
  "S",
  "SAMP",
  "SMALL",
  "SPAN",
  "STRONG",
  "SUB",
  "SUP",
  "TIME",
  "U",
  "VAR",
]);

function serializeRichContent(editor: Editor, element: HTMLElement): string {
  const document = element.ownerDocument;
  const html = sanitizeRichContent(editor.getHTML(), document);
  if (!phrasingContentHosts.has(element.tagName)) return html;
  const container = document.createElement("div");
  container.innerHTML = html;
  const paragraph = container.firstElementChild;
  if (paragraph?.tagName !== "P" || container.children.length !== 1) return html;
  return paragraph.innerHTML;
}
