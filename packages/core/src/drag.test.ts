import { describe, expect, it } from "vitest";
import { getDragGeometry, startDragSession } from "./drag";

describe("drag", () => {
  it("calculates previews without mutating the initial geometry", () => {
    const geometry = { x: 10, y: 20, width: 100, height: 80, rotation: 5 };
    const session = startDragSession("a", { x: 50, y: 70 }, geometry);
    expect(getDragGeometry(session, { x: 85, y: 100 })).toEqual({
      x: 45,
      y: 50,
      width: 100,
      height: 80,
      rotation: 5,
    });
    expect(geometry).toEqual({ x: 10, y: 20, width: 100, height: 80, rotation: 5 });
  });
});
