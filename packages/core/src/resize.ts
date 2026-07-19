import type { Geometry, NodeId } from "./model";
import type { Point } from "./drag";

export type ResizeHandle = "north-west" | "north-east" | "south-east" | "south-west";

export interface ResizeSession {
  readonly nodeId: NodeId;
  readonly handle: ResizeHandle;
  readonly origin: Point;
  readonly initialGeometry: Geometry;
  readonly minimumSize: number;
}

export function startResizeSession(
  nodeId: NodeId,
  handle: ResizeHandle,
  origin: Point,
  geometry: Geometry,
  minimumSize = 32,
): ResizeSession {
  return { nodeId, handle, origin, initialGeometry: geometry, minimumSize };
}

export function getResizeGeometry(session: ResizeSession, pointer: Point): Geometry {
  const deltaX = pointer.x - session.origin.x;
  const deltaY = pointer.y - session.origin.y;
  const fromWest = session.handle.endsWith("west");
  const fromNorth = session.handle.startsWith("north");
  const width = Math.max(
    session.minimumSize,
    session.initialGeometry.width + (fromWest ? -deltaX : deltaX),
  );
  const height = Math.max(
    session.minimumSize,
    session.initialGeometry.height + (fromNorth ? -deltaY : deltaY),
  );

  return {
    ...session.initialGeometry,
    x: fromWest
      ? session.initialGeometry.x + session.initialGeometry.width - width
      : session.initialGeometry.x,
    y: fromNorth
      ? session.initialGeometry.y + session.initialGeometry.height - height
      : session.initialGeometry.y,
    width,
    height,
  };
}
