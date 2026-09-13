import type { FreeformInkStroke } from "libfreeform";
import type { BoardNode, Issue } from "../board-model/index";
import { sampleSpline } from "./spline";
import { hasUnresolvedInkMask } from "./ink-mask";

export function embeddedImage(
  bytes: Uint8Array,
): { dataURL: string; mimeType: "image/png" | "image/jpeg" } | undefined {
  if (bytes.length > 16 * 1024 * 1024) return;
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v);
  const jpeg =
    bytes.length > 4 &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes[2] === 255 &&
    bytes.at(-2) === 255 &&
    bytes.at(-1) === 217;
  if (!png && !jpeg) return;
  const mimeType = png ? "image/png" : "image/jpeg";
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return { mimeType, dataURL: `data:${mimeType};base64,${btoa(binary)}` };
}

export function convertInk(
  strokes: readonly FreeformInkStroke[],
  id: string,
  issues: Issue[],
): BoardNode[] {
  if (strokes.length > 10000) throw new Error("Too many ink strokes.");
  return strokes.flatMap((stroke, index): BoardNode[] => {
    if (stroke.visibleRanges?.length || hasUnresolvedInkMask(stroke.rawData)) {
      issues.push({
        itemId: id,
        severity: "unsupported",
        message:
          "Masked ink or an unreadable native stroke record requires validated clipping semantics. Stroke omitted to avoid restoring hidden regions.",
      });
      return [];
    }
    if (stroke.points.length < 2 || stroke.points.length > 100000) {
      issues.push({
        itemId: id,
        severity: "unsupported",
        message: "Invalid or oversized ink stroke.",
      });
      return [];
    }
    if (stroke.pointRole === "splineControl" && stroke.points.length > 12500) {
      issues.push({
        itemId: id,
        severity: "unsupported",
        message: "Spline exceeds the sampling limit.",
      });
      return [];
    }
    const samples =
      stroke.pointRole === "splineControl"
        ? sampleSpline(stroke.points)
        : stroke.points;
    if (stroke.pointRole === "splineControl")
      issues.push({
        itemId: id,
        severity: "approximation",
        message:
          "Uniform cubic PencilKit spline sampled with repeated endpoint controls. Endpoint behavior awaits comparison with Apple interpolation.",
      });
    const t = stroke.transform;
    const points = samples.map((p): [number, number] => [
      t.a * p.x + t.c * p.y + t.tx,
      t.b * p.x + t.d * p.y + t.ty,
    ]);
    if (
      points.some((p) =>
        p.some((n) => !Number.isFinite(n) || Math.abs(n) > 1000000),
      )
    ) {
      issues.push({
        itemId: id,
        severity: "unsupported",
        message: "Invalid transformed ink coordinates.",
      });
      return [];
    }
    let x = Infinity,
      y = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const p of points) {
      x = Math.min(x, p[0]);
      y = Math.min(y, p[1]);
      maxX = Math.max(maxX, p[0]);
      maxY = Math.max(maxY, p[1]);
    }
    const width = maxX - x,
      height = maxY - y;
    const widths = samples
      .map((p) => p.width)
      .filter(
        (n): n is number => n !== undefined && Number.isFinite(n) && n > 0,
      );
    const meanWidth = widths.length
      ? widths.reduce((a, b) => a + b, 0) / widths.length
      : 2;
    const scale = Math.sqrt(Math.abs(t.a * t.d - t.b * t.c));
    issues.push({
      itemId: id,
      severity: "approximation",
      message:
        "Ink remains editable; variable nib width, pressure and tilt use a uniform Excalidraw stroke.",
    });
    return [
      {
        id: `${id}-stroke-${index}`,
        kind: "ink",
        bounds: { x, y, width, height, rotation: 0 },
        appearance: {
          fill: "transparent",
          stroke: /^#[0-9a-f]{6}$/i.test(stroke.color?.hex ?? "")
            ? stroke.color!.hex
            : "#202622",
          strokeWidth: Math.max(0.1, Math.min(100, meanWidth * scale)),
          opacity: 100,
        },
        groups: [id],
        points: points.map((p) => [p[0] - x, p[1] - y]),
      },
    ];
  });
}
