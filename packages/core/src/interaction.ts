import { createActor, setup } from "xstate";

type InteractionEvent =
  | { readonly type: "DRAG_START" }
  | { readonly type: "DRAG_COMMIT" }
  | { readonly type: "DRAG_CANCEL" };

const interactionMachine = setup({
  types: { events: {} as InteractionEvent },
}).createMachine({
  id: "interaction",
  initial: "idle",
  states: {
    idle: { on: { DRAG_START: "dragging" } },
    dragging: { on: { DRAG_COMMIT: "idle", DRAG_CANCEL: "idle" } },
  },
});

export type InteractionMode = "idle" | "dragging";

export interface InteractionController {
  getMode(): InteractionMode;
  startDrag(): void;
  commitDrag(): void;
  cancelDrag(): void;
  dispose(): void;
}

export function createInteractionController(): InteractionController {
  const actor = createActor(interactionMachine);
  actor.start();
  return {
    getMode: () => actor.getSnapshot().value as InteractionMode,
    startDrag: () => actor.send({ type: "DRAG_START" }),
    commitDrag: () => actor.send({ type: "DRAG_COMMIT" }),
    cancelDrag: () => actor.send({ type: "DRAG_CANCEL" }),
    dispose: () => actor.stop(),
  };
}
