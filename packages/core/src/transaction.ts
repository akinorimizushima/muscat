import type { Command } from "./commands.js";
import type { EditorDocument, EditorNode, NodeId } from "./model.js";

export interface Transaction {
  readonly commands: readonly Command[];
  readonly label?: string;
}

export interface AppliedTransaction {
  readonly document: EditorDocument;
  readonly inverse: Transaction;
}

export class CommandError extends Error {}

function requiredNode(document: EditorDocument, id: NodeId): EditorNode {
  const node = document.nodes[id];
  if (!node) throw new CommandError(`Node not found: ${id}`);
  return node;
}

function insertAt(ids: readonly NodeId[], id: NodeId, index = ids.length): readonly NodeId[] {
  if (index < 0 || index > ids.length) throw new CommandError(`Invalid child index: ${index}`);
  return [...ids.slice(0, index), id, ...ids.slice(index)];
}

function isDescendant(document: EditorDocument, ancestorId: NodeId, candidateId: NodeId): boolean {
  let current: NodeId | null = candidateId;
  while (current) {
    if (current === ancestorId) return true;
    current = requiredNode(document, current).parentId;
  }
  return false;
}

function collectSubtree(document: EditorDocument, rootId: NodeId): Readonly<Record<NodeId, EditorNode>> {
  const result: Record<NodeId, EditorNode> = {};
  const visit = (id: NodeId): void => {
    const node = requiredNode(document, id);
    result[id] = node;
    node.children.forEach(visit);
  };
  visit(rootId);
  return result;
}

export function applyCommand(document: EditorDocument, command: Command): AppliedTransaction {
  const nodes = { ...document.nodes };
  switch (command.type) {
    case "node.add": {
      if (nodes[command.node.id]) throw new CommandError(`Node already exists: ${command.node.id}`);
      const parent = requiredNode(document, command.parentId);
      const index = command.index ?? parent.children.length;
      const node: EditorNode = { ...command.node, parentId: parent.id, children: command.node.children ?? [] };
      nodes[node.id] = node;
      nodes[parent.id] = { ...parent, children: insertAt(parent.children, node.id, index) };
      return {
        document: { ...document, nodes },
        inverse: { commands: [{ type: "node.remove", nodeId: node.id }] },
      };
    }
    case "node.move": {
      const node = requiredNode(document, command.nodeId);
      if (node.parentId === null) throw new CommandError("The document root cannot be moved");
      const oldParent = requiredNode(document, node.parentId);
      const newParent = requiredNode(document, command.parentId);
      if (isDescendant(document, node.id, newParent.id)) throw new CommandError("Cannot move a node into its subtree");
      const oldIndex = oldParent.children.indexOf(node.id);
      const oldGeometry = node.geometry;
      const oldParentChildren = oldParent.children.filter((id) => id !== node.id);
      const targetChildren = oldParent.id === newParent.id ? oldParentChildren : newParent.children;
      const index = command.index ?? targetChildren.length;
      nodes[oldParent.id] = { ...oldParent, children: oldParentChildren };
      nodes[newParent.id] = { ...newParent, children: insertAt(targetChildren, node.id, index) };
      nodes[node.id] = command.geometry === undefined
        ? { ...node, parentId: newParent.id }
        : { ...node, parentId: newParent.id, geometry: command.geometry };
      const inverseCommand: Command = oldGeometry === undefined
        ? { type: "node.move", nodeId: node.id, parentId: oldParent.id, index: oldIndex }
        : { type: "node.move", nodeId: node.id, parentId: oldParent.id, index: oldIndex, geometry: oldGeometry };
      return { document: { ...document, nodes }, inverse: { commands: [inverseCommand] } };
    }
    case "node.setAttributes": {
      const node = requiredNode(document, command.nodeId);
      nodes[node.id] = { ...node, attributes: { ...command.attributes } };
      return {
        document: { ...document, nodes },
        inverse: {
          commands: [{ type: "node.setAttributes", nodeId: node.id, attributes: node.attributes }],
        },
      };
    }
    case "node.setContent": {
      const node = requiredNode(document, command.nodeId);
      nodes[node.id] = { ...node, content: command.content };
      return {
        document: { ...document, nodes },
        inverse: {
          commands: [{ type: "node.setContent", nodeId: node.id, content: node.content ?? "" }],
        },
      };
    }
    case "node.remove": {
      const node = requiredNode(document, command.nodeId);
      if (node.parentId === null) throw new CommandError("The document root cannot be removed");
      const parent = requiredNode(document, node.parentId);
      const index = parent.children.indexOf(node.id);
      const subtree = collectSubtree(document, node.id);
      for (const id of Object.keys(subtree)) delete nodes[id];
      nodes[parent.id] = { ...parent, children: parent.children.filter((id) => id !== node.id) };
      return {
        document: { ...document, nodes },
        inverse: { commands: [{ type: "node.restoreSubtree", parentId: parent.id, index, nodes: subtree, rootId: node.id }] },
      };
    }
    case "node.restoreSubtree": {
      const parent = requiredNode(document, command.parentId);
      for (const id of Object.keys(command.nodes)) {
        if (nodes[id]) throw new CommandError(`Node already exists: ${id}`);
      }
      Object.assign(nodes, command.nodes);
      nodes[parent.id] = { ...parent, children: insertAt(parent.children, command.rootId, command.index) };
      return {
        document: { ...document, nodes },
        inverse: { commands: [{ type: "node.remove", nodeId: command.rootId }] },
      };
    }
  }
}

export function applyTransaction(document: EditorDocument, transaction: Transaction): AppliedTransaction {
  let current = document;
  const inverses: Command[] = [];
  for (const command of transaction.commands) {
    const applied = applyCommand(current, command);
    current = applied.document;
    inverses.unshift(...applied.inverse.commands);
  }
  const inverse: Transaction = transaction.label === undefined
    ? { commands: inverses }
    : { commands: inverses, label: transaction.label };
  return { document: current, inverse };
}

export function canApply(document: EditorDocument, command: Command): boolean {
  try {
    applyCommand(document, command);
    return true;
  } catch (error) {
    if (error instanceof CommandError) return false;
    throw error;
  }
}
