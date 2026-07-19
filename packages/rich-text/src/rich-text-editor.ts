import { Editor } from "@tiptap/core";
import { BubbleMenuPlugin } from "@tiptap/extension-bubble-menu";
import Link from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import StarterKit from "@tiptap/starter-kit";
import { isSafeRichTextUrl, sanitizeRichContent } from "@muscat/dom";
import { createRichTextMenu, type RichTextMenu } from "./rich-text-menu";
import { RICH_TEXT_STYLES } from "./rich-text-styles";

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

interface RichTextControllerDependencies {
  readonly createEditor?: (options: ConstructorParameters<typeof Editor>[0]) => Editor;
}

const adoptedStyles = new WeakMap<
  Document,
  { readonly element: HTMLStyleElement; references: number }
>();

function adoptRichTextStyles(ownerDocument: Document): () => void {
  let adopted = adoptedStyles.get(ownerDocument);
  if (!adopted) {
    const element = ownerDocument.createElement("style");
    element.dataset.muscatRichTextStyle = "controller";
    element.textContent = RICH_TEXT_STYLES;
    ownerDocument.head.append(element);
    adopted = { element, references: 0 };
    adoptedStyles.set(ownerDocument, adopted);
  }
  adopted.references++;
  return () => {
    if (--adopted.references > 0) return;
    adoptedStyles.delete(ownerDocument);
    adopted.element.remove();
  };
}

export function createRichTextController(
  options: {
    readonly onCommit: (nodeId: string, richContent: string) => void;
    readonly onEditingChange: (editing: boolean) => void;
  },
  dependencies: RichTextControllerDependencies = {},
): RichTextController {
  let session:
    | {
        nodeId: string;
        element: HTMLElement;
        initialHtml: string;
        editor: Editor;
        menu: RichTextMenu;
        disconnectOwnerDocument: () => void;
        releaseStyles: () => void;
      }
    | undefined;

  const finish = (cancel: boolean): void => {
    if (!session) return;
    const completed = session;
    session = undefined;
    try {
      const currentHtml = serializeRichContent(completed.editor, completed.element);
      completed.element.innerHTML = cancel ? completed.initialHtml : currentHtml;
      if (!cancel && currentHtml !== completed.initialHtml)
        options.onCommit(completed.nodeId, currentHtml);
    } finally {
      completed.disconnectOwnerDocument();
      completed.editor.destroy();
      completed.menu.destroy();
      completed.releaseStyles();
      options.onEditingChange(false);
    }
  };

  return {
    start(startOptions) {
      if (session) return;
      const ownerDocument = startOptions.element.ownerDocument;
      const supportsLinkMarks = startOptions.element.tagName !== "A";
      const safeInitialHtml = sanitizeRichContent(startOptions.initialHtml, ownerDocument);
      let tiptap: Editor | undefined;
      let menu: RichTextMenu | undefined;
      let releaseStyles: () => void = () => undefined;
      startOptions.element.replaceChildren();
      try {
        tiptap = (dependencies.createEditor ?? ((editorOptions) => new Editor(editorOptions)))({
          element: startOptions.element,
          content: safeInitialHtml,
          extensions: [
            StarterKit.configure({ link: false, underline: false }),
            Underline,
            ...(supportsLinkMarks
              ? [
                  Link.configure({
                    openOnClick: false,
                    HTMLAttributes: { target: null, rel: null },
                    isAllowedUri: (url) => isSafeRichTextUrl(url),
                  }),
                ]
              : []),
            TextAlign.configure({
              types: ["paragraph"],
              alignments: ["left", "center", "right"],
            }),
          ],
        });
        releaseStyles = adoptRichTextStyles(ownerDocument);
        menu = createRichTextMenu(tiptap, ownerDocument, { supportsLinkMarks });
      } catch (error) {
        menu?.destroy();
        tiptap?.destroy();
        releaseStyles();
        startOptions.element.innerHTML = safeInitialHtml;
        options.onEditingChange(false);
        throw error;
      }
      try {
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
      } catch (error) {
        menu.destroy();
        tiptap.destroy();
        releaseStyles();
        startOptions.element.innerHTML = safeInitialHtml;
        options.onEditingChange(false);
        throw error;
      }
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
        releaseStyles,
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

const inlineRichTextHostSelector = [
  "a",
  "abbr",
  "b",
  "bdi",
  "bdo",
  "button",
  "cite",
  "code",
  "data",
  "dfn",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "i",
  "kbd",
  "label",
  "legend",
  "mark",
  "meter",
  "output",
  "p",
  "q",
  "rp",
  "rt",
  "ruby",
  "s",
  "samp",
  "small",
  "span",
  "strong",
  "sub",
  "sup",
  "time",
  "u",
  "var",
].join(",");

function serializeRichContent(editor: Editor, element: HTMLElement): string {
  const document = element.ownerDocument;
  const html = sanitizeRichContent(editor.getHTML(), document);
  if (!element.matches(inlineRichTextHostSelector)) return html;
  const container = document.createElement("div");
  container.innerHTML = html;
  const paragraph = container.firstElementChild;
  if (paragraph?.tagName !== "P" || container.children.length !== 1) return html;
  return paragraph.innerHTML;
}
