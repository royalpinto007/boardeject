import type { FreeformInkPoint } from "libfreeform";

/** Uniform cubic B-spline, with repeated endpoint controls.
 * Apple documents the uniform cubic basis but not endpoint extension rules.
 * Callers must report this endpoint policy as an approximation until compared
 * against PKStrokePath.interpolatedPoints on the source drawing.
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
  const at = (index: number) =>
    controls[Math.max(0, Math.min(controls.length - 1, index))];
  const result: FreeformInkPoint[] = [];
  // Two extra spans make the repeated endpoint controls reach both endpoints.
  for (let span = -1; span < controls.length; span++) {
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
