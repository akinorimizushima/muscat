import { createRichTextController as createInternalRichTextController } from "./rich-text-editor";

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

export interface RichTextControllerOptions {
  readonly onCommit: (nodeId: string, richContent: string) => void;
  readonly onEditingChange: (editing: boolean) => void;
}

export function createRichTextController(options: RichTextControllerOptions): RichTextController {
  return createInternalRichTextController(options);
}
