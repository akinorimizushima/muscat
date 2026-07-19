import { describe, expect, it } from "vitest";
import { createEditor } from "./editor";

describe("interaction", () => {
  it("publishes snapshots through the editor interaction facade", () => {
    const editor = createEditor();
    const modes: string[] = [];
    const unsubscribe = editor.subscribe((state) => modes.push(state.interaction));
    editor.interaction.startDrag();
    editor.interaction.cancelDrag();
    unsubscribe();
    expect(modes).toEqual(["dragging", "idle"]);
  });
});
