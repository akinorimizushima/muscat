import type { EditorNode, Geometry, NodeId } from "./model.js";

export interface AddNodeCommand {
  readonly type: "node.add";
  readonly parentId: NodeId;
  readonly index?: number;
  readonly node: Omit<EditorNode, "parentId" | "children"> & {
    readonly children?: readonly NodeId[];
  };
}

export interface MoveNodeCommand {
  readonly type: "node.move";
  readonly nodeId: NodeId;
  readonly parentId: NodeId;
  readonly index?: number;
  readonly geometry?: Geometry;
}

export interface RemoveNodeCommand {
  readonly type: "node.remove";
  readonly nodeId: NodeId;
}

export interface SetNodeAttributesCommand {
  readonly type: "node.setAttributes";
  readonly nodeId: NodeId;
  readonly attributes: Readonly<Record<string, string>>;
}

export interface SetNodeContentCommand {
  readonly type: "node.setContent";
  readonly nodeId: NodeId;
  readonly content: string;
}

export interface RestoreSubtreeCommand {
  readonly type: "node.restoreSubtree";
  readonly parentId: NodeId;
  readonly index: number;
  readonly nodes: Readonly<Record<NodeId, EditorNode>>;
  readonly rootId: NodeId;
}

export type Command =
  | AddNodeCommand
  | MoveNodeCommand
  | SetNodeAttributesCommand
  | SetNodeContentCommand
  | RemoveNodeCommand
  | RestoreSubtreeCommand;

export const commands = {
  addNode(command: Omit<AddNodeCommand, "type">): AddNodeCommand {
    return { type: "node.add", ...command };
  },
  moveNode(command: Omit<MoveNodeCommand, "type">): MoveNodeCommand {
    return { type: "node.move", ...command };
  },
  removeNode(command: Omit<RemoveNodeCommand, "type">): RemoveNodeCommand {
    return { type: "node.remove", ...command };
  },
  setNodeAttributes(command: Omit<SetNodeAttributesCommand, "type">): SetNodeAttributesCommand {
    return { type: "node.setAttributes", ...command };
  },
  setNodeContent(command: Omit<SetNodeContentCommand, "type">): SetNodeContentCommand {
    return { type: "node.setContent", ...command };
  },
};
