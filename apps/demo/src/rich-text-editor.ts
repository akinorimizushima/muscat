import { Editor } from "@tiptap/core";
import { BubbleMenuPlugin } from "@tiptap/extension-bubble-menu";
import Link from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import StarterKit from "@tiptap/starter-kit";
import { sanitizeRichContent } from "@muscat/dom";
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
      }
    | undefined;

  const finish = (cancel: boolean): void => {
    if (!session) return;
    const completed = session;
    session = undefined;
    const currentHtml = sanitizeRichContent(
      completed.editor.getHTML(),
      completed.element.ownerDocument,
    );
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
          StarterKit,
          Underline,
          Link.configure({ openOnClick: false }),
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
          options: { placement: "bottom", offset: 8 },
        }),
      );
      const initialHtml = sanitizeRichContent(tiptap.getHTML(), ownerDocument);
      session = {
        nodeId: startOptions.nodeId,
        element: startOptions.element,
        initialHtml,
        editor: tiptap,
        menu,
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
