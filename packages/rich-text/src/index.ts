import {
  createRichTextController as createInternalRichTextController,
  type RichTextController,
} from "./rich-text-editor";

export type { RichTextController, RichTextStartOptions } from "./rich-text-editor";

export function createRichTextController(options: {
  readonly onCommit: (nodeId: string, richContent: string) => void;
  readonly onEditingChange: (editing: boolean) => void;
}): RichTextController {
  return createInternalRichTextController(options);
}
