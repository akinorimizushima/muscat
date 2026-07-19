export type NodeId = string;

export type LayoutMode = "flow" | "flex" | "grid" | "free";

export interface Geometry {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotation?: number;
}

export interface EditorNode {
  readonly id: NodeId;
  readonly type: string;
  readonly parentId: NodeId | null;
  readonly children: readonly NodeId[];
  readonly layout: LayoutMode;
  readonly geometry?: Geometry;
  readonly attributes: Readonly<Record<string, string>>;
  readonly content?: string;
  readonly richContent?: string;
}

export interface EditorDocument {
  readonly rootId: NodeId;
  readonly nodes: Readonly<Record<NodeId, EditorNode>>;
}

export function createDocument(rootId = "root"): EditorDocument {
  return {
    rootId,
    nodes: {
      [rootId]: {
        id: rootId,
        type: "root",
        parentId: null,
        children: [],
        layout: "flow",
        attributes: {},
      },
    },
  };
}
