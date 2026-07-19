import type { Command } from "./commands";
import { createInteractionController, type InteractionController } from "./interaction";
import { createDocument, type EditorDocument } from "./model";
import { applyTransaction, canApply, type Transaction } from "./transaction";

export interface EditorSnapshot {
  readonly document: EditorDocument;
  readonly interaction: "idle" | "dragging";
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}

export interface Editor {
  getSnapshot(): EditorSnapshot;
  subscribe(listener: (snapshot: EditorSnapshot) => void): () => void;
  dispatch(command: Command | Transaction): void;
  can(command: Command): boolean;
  undo(): boolean;
  redo(): boolean;
  interaction: InteractionController;
  dispose(): void;
}

export interface CreateEditorOptions {
  readonly document?: EditorDocument;
}

export function createEditor(options: CreateEditorOptions = {}): Editor {
  let document = options.document ?? createDocument();
  let undoStack: Transaction[] = [];
  let redoStack: Transaction[] = [];
  const listeners = new Set<(snapshot: EditorSnapshot) => void>();
  const rawInteraction = createInteractionController();
  const snapshot = (): EditorSnapshot => ({
    document,
    interaction: rawInteraction.getMode(),
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
  });
  const emit = (): void => listeners.forEach((listener) => listener(snapshot()));
  const interaction: InteractionController = {
    getMode: rawInteraction.getMode,
    startDrag: () => {
      rawInteraction.startDrag();
      emit();
    },
    commitDrag: () => {
      rawInteraction.commitDrag();
      emit();
    },
    cancelDrag: () => {
      rawInteraction.cancelDrag();
      emit();
    },
    dispose: rawInteraction.dispose,
  };
  const execute = (transaction: Transaction, recordUndo: boolean): Transaction => {
    const applied = applyTransaction(document, transaction);
    document = applied.document;
    if (recordUndo) {
      undoStack = [...undoStack, applied.inverse];
      redoStack = [];
    }
    return applied.inverse;
  };
  return {
    getSnapshot: snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispatch(input) {
      execute("commands" in input ? input : { commands: [input] }, true);
      emit();
    },
    can: (command) => canApply(document, command),
    undo() {
      const transaction = undoStack.at(-1);
      if (!transaction) return false;
      undoStack = undoStack.slice(0, -1);
      redoStack = [...redoStack, execute(transaction, false)];
      emit();
      return true;
    },
    redo() {
      const transaction = redoStack.at(-1);
      if (!transaction) return false;
      redoStack = redoStack.slice(0, -1);
      undoStack = [...undoStack, execute(transaction, false)];
      emit();
      return true;
    },
    interaction,
    dispose() {
      listeners.clear();
      rawInteraction.dispose();
    },
  };
}
