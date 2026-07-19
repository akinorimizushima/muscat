import { describe, expect, it } from "vitest";
import { getResizeGeometry, startResizeSession } from "./resize";

describe("resize", () => {
  it("calculates previews from every corner and enforces a minimum size", () => {
    const geometry = { x: 10, y: 20, width: 100, height: 80, rotation: 5 };
    expect(
      getResizeGeometry(startResizeSession("a", "south-east", { x: 110, y: 100 }, geometry), {
        x: 140,
        y: 125,
      }),
    ).toEqual({ x: 10, y: 20, width: 130, height: 105, rotation: 5 });
    expect(
      getResizeGeometry(startResizeSession("a", "north-west", { x: 10, y: 20 }, geometry), {
        x: 90,
        y: 90,
      }),
    ).toEqual({ x: 78, y: 68, width: 32, height: 32, rotation: 5 });
    expect(
      getResizeGeometry(startResizeSession("a", "north-east", { x: 110, y: 20 }, geometry), {
        x: 130,
        y: 5,
      }),
    ).toEqual({ x: 10, y: 5, width: 120, height: 95, rotation: 5 });
    expect(
      getResizeGeometry(startResizeSession("a", "south-west", { x: 10, y: 100 }, geometry), {
        x: -10,
        y: 110,
      }),
    ).toEqual({ x: -10, y: 20, width: 120, height: 90, rotation: 5 });
    expect(geometry).toEqual({ x: 10, y: 20, width: 100, height: 80, rotation: 5 });
  });
});
