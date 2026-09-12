import type { FreeformInkPoint } from "libfreeform";

/** Uniform cubic B-spline with linearly extrapolated endpoint controls.
 * Compared against Apple PKStrokePath interpolation on a macOS runner.
 * This validates centerline sampling, not erasure masks or brush rendering.
 */
export function sampleSpline(
  controls: readonly FreeformInkPoint[],
  subdivisions = 8,
): FreeformInkPoint[] {
  if (!Number.isInteger(subdivisions) || subdivisions < 1 || subdivisions > 64)
    throw new Error("Invalid spline subdivision count.");
  if (
    !controls.length ||
    controls.length > 12500 ||
    controls.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))
  )
    throw new Error("Invalid spline controls.");
  if (controls.length === 1) return [{ ...controls[0] }];
  const at = (index: number): FreeformInkPoint => {
    if (index >= 0 && index < controls.length) return controls[index];
    const edge = index < 0 ? controls[0] : controls[controls.length - 1];
    const next = index < 0 ? controls[1] : controls[controls.length - 2];
    return { ...edge, x: 2 * edge.x - next.x, y: 2 * edge.y - next.y };
  };
  const result: FreeformInkPoint[] = [];
  for (let span = 0; span < controls.length - 1; span++) {
    for (let step = 0; step < subdivisions; step++) {
      const t = step / subdivisions,
        t2 = t * t,
        t3 = t2 * t;
      const weights = [
        (1 - 3 * t + 3 * t2 - t3) / 6,
        (4 - 6 * t2 + 3 * t3) / 6,
        (1 + 3 * t + 3 * t2 - 3 * t3) / 6,
        t3 / 6,
      ];
      const points = [at(span - 1), at(span), at(span + 1), at(span + 2)];
      const value = (key: "x" | "y" | "width" | "force" | "opacity") =>
        points.every((p) => p[key] !== undefined && Number.isFinite(p[key]))
          ? points.reduce((sum, p, i) => sum + p[key]! * weights[i], 0)
          : undefined;
      result.push({
        x: value("x")!,
        y: value("y")!,
        width: value("width"),
        force: value("force"),
        opacity: value("opacity"),
      });
    }
  }
  result.push({ ...controls[controls.length - 1] });
  return result;
}
