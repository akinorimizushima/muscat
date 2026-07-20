import { commands, type Editor } from "@muscat/core";

export interface ElementDeletionControllerOptions {
  readonly editor: Editor;
  readonly getSelectedNodeId: () => string | undefined;
  readonly clearSelection: () => void;
  readonly isEditing: () => boolean;
}

export interface ElementDeletionController {
  handleKeyDown(event: KeyboardEvent): void;
}

export function createElementDeletionController(
  options: ElementDeletionControllerOptions,
): ElementDeletionController {
  return {
    handleKeyDown(event) {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.altKey ||
        event.metaKey ||
        event.ctrlKey ||
        (event.key !== "Backspace" && event.key !== "Delete") ||
        options.isEditing() ||
        isTextEntryTarget(event.target)
      )
        return;
      const nodeId = options.getSelectedNodeId();
      if (!nodeId) return;
      const command = commands.removeNode({ nodeId });
      if (!options.editor.can(command)) return;
      event.preventDefault();
      options.clearSelection();
      options.editor.dispatch(command);
    },
  };
}

export function isTextEntryTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return Boolean(
    element &&
    typeof element.closest === "function" &&
    (element.closest("input, textarea, select") || element.isContentEditable),
  );
}
