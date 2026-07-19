import { describe, expect, it } from "vitest";
import { commands } from "./commands";
import { createDocument, type EditorNode } from "./model";
import { applyCommand, applyTransaction, canApply, CommandError } from "./transaction";

const node = (id: string): Omit<EditorNode, "parentId" | "children"> => ({
  id,
  type: "div",
  layout: "flow",
  attributes: {},
});

describe("transaction", () => {
  it("applies multiple commands and returns a reverse-order inverse", () => {
    const initial = createDocument();
    const applied = applyTransaction(initial, {
      label: "Add nested nodes",
      commands: [
        commands.addNode({ parentId: "root", node: node("parent") }),
        commands.addNode({ parentId: "parent", node: node("child") }),
      ],
    });

    expect(applied.document.nodes.root?.children).toEqual(["parent"]);
    expect(applied.document.nodes.parent?.children).toEqual(["child"]);
    expect(applied.inverse.label).toBe("Add nested nodes");
    expect(applied.inverse.commands.map((command) => command.type)).toEqual([
      "node.remove",
      "node.remove",
    ]);
    expect(applyTransaction(applied.document, applied.inverse).document).toEqual(initial);
  });

  it("restores a removed subtree with its original position", () => {
    const populated = applyTransaction(createDocument(), {
      commands: [
        commands.addNode({ parentId: "root", node: node("before") }),
        commands.addNode({ parentId: "root", node: node("parent") }),
        commands.addNode({ parentId: "parent", node: node("child") }),
        commands.addNode({ parentId: "root", node: node("after") }),
      ],
    }).document;

    const removed = applyCommand(populated, commands.removeNode({ nodeId: "parent" }));
    expect(removed.document.nodes.root?.children).toEqual(["before", "after"]);
    expect(removed.document.nodes.parent).toBeUndefined();
    expect(removed.document.nodes.child).toBeUndefined();
    expect(applyTransaction(removed.document, removed.inverse).document).toEqual(populated);
  });

  it("reports invalid commands without mutating the document", () => {
    const initial = createDocument();
    const addRootAgain = commands.addNode({ parentId: "root", node: node("root") });
    const removeRoot = commands.removeNode({ nodeId: "root" });

    expect(canApply(initial, addRootAgain)).toBe(false);
    expect(canApply(initial, removeRoot)).toBe(false);
    expect(() => applyCommand(initial, removeRoot)).toThrow(CommandError);
    expect(initial).toEqual(createDocument());
  });
});
