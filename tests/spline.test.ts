import { expect, it } from "vitest";
import { sampleSpline } from "../packages/freeform-parser/spline";

it("evaluates the cubic basis rather than connecting control points", () => {
  const p = sampleSpline(
    [
      { x: 0, y: 0 },
      { x: 6, y: 6 },
      { x: 12, y: 0 },
      { x: 18, y: 6 },
    ],
    8,
  );
  // Span 1 at t=0: (P0 + 4 P1 + P2) / 6.
  expect(p[16].x).toBeCloseTo(6);
  expect(p[16].y).toBeCloseTo(4);
  expect(p[0]).toMatchObject({ x: 0, y: 0 });
  expect(p.at(-1)).toMatchObject({ x: 18, y: 6 });
});
it("preserves a straight line and stays within the control hull", () => {
  const result = sampleSpline([
    { x: 0, y: 4 },
    { x: 10, y: 4 },
  ]);
  expect(
    result.every((p) => Math.abs(p.y - 4) < 1e-10 && p.x >= 0 && p.x <= 10),
  ).toBe(true);
});
it("interpolates known widths without inventing missing channels", () => {
  const p = sampleSpline([
    { x: 0, y: 0, width: 2 },
    { x: 10, y: 0, width: 6 },
  ]);
  expect(p.every((p) => p.width! >= 2 - 1e-10 && p.width! <= 6 + 1e-10)).toBe(
    true,
  );
  expect(p.every((p) => p.force === undefined)).toBe(true);
});
it("bounds work and rejects malformed input", () => {
  expect(() => sampleSpline([{ x: NaN, y: 0 }])).toThrow();
  expect(() => sampleSpline([{ x: 0, y: 0 }], 0)).toThrow();
});
