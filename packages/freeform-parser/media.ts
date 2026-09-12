import type { FreeformInkStroke } from "libfreeform";
import type { BoardNode, Issue } from "../board-model/index";

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
    if (stroke.visibleRanges?.length || stroke.pointRole !== "renderedSample") {
      issues.push({
        itemId: id,
        severity: "unsupported",
        message:
          "Masked ink or PencilKit spline controls require a validated sampler. Stroke omitted.",
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
    const t = stroke.transform;
    const points = stroke.points.map((p): [number, number] => [
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
    const x = Math.min(...points.map((p) => p[0])),
      y = Math.min(...points.map((p) => p[1]));
    const width = Math.max(...points.map((p) => p[0])) - x,
      height = Math.max(...points.map((p) => p[1])) - y;
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
          strokeWidth: 2,
          opacity: 100,
        },
        groups: [id],
        points: points.map((p) => [p[0] - x, p[1] - y]),
      },
    ];
  });
}
