import type { Geometry, NodeId } from "./model";

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface DragSession {
  readonly nodeId: NodeId;
  readonly origin: Point;
  readonly initialGeometry: Geometry;
}

export function startDragSession(nodeId: NodeId, origin: Point, geometry: Geometry): DragSession {
  return { nodeId, origin, initialGeometry: geometry };
}

export function getDragGeometry(session: DragSession, pointer: Point): Geometry {
  return {
    ...session.initialGeometry,
    x: session.initialGeometry.x + pointer.x - session.origin.x,
    y: session.initialGeometry.y + pointer.y - session.origin.y,
  };
}
