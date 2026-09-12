import type { FreeformPasteboard, FreeformPaint } from "libfreeform";
import { embeddedImage, convertInk } from "./media";
import { convertTable } from "./table";
import type {
  Board,
  BoardNode,
  Appearance,
  Bounds,
} from "../board-model/index";

/** Conservative adapter: missing geometry/relationships are never guessed. */
export function normalize(pasteboard: FreeformPasteboard): Board {
  const board: Board = {
    nodes: [],
    issues: [],
    sourceItems: 0,
    source: "freeform",
  };
  const issue = (message: string, itemId?: string) =>
    board.issues.push({ severity: "unsupported", message, itemId });
  for (const diagnostic of pasteboard.diagnostics)
    issue(`${diagnostic.source}: ${diagnostic.message}`);
  for (const name of ["native", "drawing", "manifest", "metadata"] as const) {
    const tier = pasteboard[name];
    if (tier.status === "failed")
      issue(`${name}: ${tier.value.kind}. ${tier.value.message}`);
  }
  if (pasteboard.native.status !== "decoded") {
    if (pasteboard.drawing.status === "decoded") {
      board.sourceItems = pasteboard.drawing.value.strokes.length;
      board.nodes = convertInk(
        pasteboard.drawing.value.strokes,
        "drawing",
        board.issues,
      );
      return board;
    }
    issue(
      "No decoded native board. Rendered PDF/image flavors are not editable board data.",
    );
    return board;
  }
  const native = pasteboard.native.value;
  board.sourceItems = native.items.length;
  if (native.compatibility.kind !== "supported") {
    issue(
      "Native format compatibility is not supported. Export is withheld rather than guessing missing content.",
    );
    return board;
  }
  if (native.items.length > 10000)
    throw new Error("Board exceeds the 10,000 item limit.");
  const color = (
    paint: FreeformPaint | undefined,
    fallback: string,
    id: string,
  ) => {
    if (!paint) return fallback;
    if (
      paint.kind === "solid" &&
      /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(paint.color.hex)
    ) {
      if (paint.color.alpha !== 1)
        board.issues.push({
          itemId: id,
          severity: "approximation",
          message:
            "Per-paint alpha is approximated by overall element opacity.",
        });
      return paint.color.hex.slice(0, 7);
    }
    board.issues.push({
      itemId: id,
      severity: "approximation",
      message: "Unsupported paint replaced with a flat default color.",
    });
    return fallback;
  };
  for (const item of native.items) {
    const id = item.uuid;
    const frame = item.geometry.frame;
    if (item.kind.kind === "group") {
      issue(
        "Group transforms and hierarchy need validated native fixtures.",
        id,
      );
      continue;
    }
    if (
      !frame ||
      !Object.values(frame).every(Number.isFinite) ||
      frame.w <= 0 ||
      frame.h <= 0 ||
      Object.values(frame).some((n) => Math.abs(n) > 1000000)
    ) {
      issue("Missing or invalid bounds. Element omitted.", id);
      continue;
    }
    if (
      item.geometry.transform ||
      item.geometry.horizontalFlip ||
      item.geometry.verticalFlip ||
      item.parentId
    ) {
      issue(
        "Transformed or nested geometry needs a validated coordinate mapping. Element omitted.",
        id,
      );
      continue;
    }
    const bounds: Bounds = {
      x: frame.x,
      y: frame.y,
      width: frame.w,
      height: frame.h,
      rotation: frame.rotation,
    };
    const appearance: Appearance = {
      fill: color(item.style.fill, "transparent", id),
      stroke: color(item.style.stroke?.paint, "#202622", id),
      strokeWidth: Math.max(0, Math.min(100, item.style.stroke?.width ?? 1)),
      opacity: Math.round(
        Math.max(0, Math.min(1, item.style.opacity ?? 1)) * 100,
      ),
    };
    if (item.style.shadows.length || item.style.stroke?.dash.length)
      board.issues.push({
        itemId: id,
        severity: "approximation",
        message: "Shadows and custom stroke dashes are omitted.",
      });
    const base = { id, bounds, appearance, groups: [] };
    const kind = item.kind;
    if (kind.kind === "shape") {
      const presets: Record<string, "rectangle" | "ellipse" | "diamond"> = {
        rectangle: "rectangle",
        Rectangle: "rectangle",
        ellipse: "ellipse",
        Ellipse: "ellipse",
        diamond: "diamond",
        Diamond: "diamond",
      };
      const mapped = kind.preset ? presets[kind.preset] : undefined;
      if (!mapped || kind.path) {
        issue(
          `Unproven shape preset (${kind.preset ?? "missing"}) or custom path. Element omitted.`,
          id,
        );
        continue;
      }
      board.nodes.push({ ...base, kind: mapped });
    } else if (kind.kind === "textBox" || kind.kind === "stickyNote") {
      if (!kind.text) {
        issue("Text content was not recovered. Element omitted.", id);
        continue;
      }
      if (kind.text.plain.length > 100000) {
        issue("Text exceeds 100,000 characters.", id);
        continue;
      }
      if (kind.kind === "stickyNote")
        board.nodes.push({
          ...base,
          id: `${id}-background`,
          kind: "rectangle",
          groups: [id],
        });
      board.nodes.push({
        ...base,
        kind: "text",
        text: kind.text.plain,
        fontSize: Math.max(8, Math.min(500, kind.text.runs[0]?.fontSize ?? 20)),
        groups: kind.kind === "stickyNote" ? [id] : [],
      });
      board.issues.push({
        itemId: id,
        severity: "approximation",
        message:
          "Text remains editable. Font, rich runs, wrapping and sticky-note text layout use Excalidraw defaults.",
      });
    } else if (kind.kind === "connector") {
      if (!kind.tail.point || !kind.head.point || kind.path || kind.routing) {
        issue(
          "Connector endpoint geometry or routing is incomplete. Connector omitted.",
          id,
        );
        continue;
      }
      const points = [
        kind.tail.point.x,
        kind.tail.point.y,
        kind.head.point.x,
        kind.head.point.y,
      ];
      if (!points.every(Number.isFinite)) {
        issue("Invalid connector points.", id);
        continue;
      }
      board.nodes.push({
        ...base,
        kind: "arrow",
        start: [points[0], points[1]],
        end: [points[2], points[3]],
        startId: kind.tail.itemId,
        endId: kind.head.itemId,
      });
      board.issues.push({
        itemId: id,
        severity: "approximation",
        message:
          "Connector becomes a straight arrow with default arrowhead and centered binding.",
      });
    } else if (kind.kind === "table") {
      board.nodes.push(...convertTable(kind, base, board.issues));
    } else if (kind.kind === "image") {
      const asset = kind.assetId
        ? (native.assets[kind.assetId] ?? pasteboard.assets[kind.assetId])
        : undefined;
      const image = asset?.bytes ? embeddedImage(asset.bytes) : undefined;
      if (!image || kind.crop || kind.mask) {
        issue(
          "Image bytes missing, unsafe/unsupported format, or unsupported crop/mask.",
          id,
        );
        continue;
      }
      board.nodes.push({ ...base, kind: "image", ...image });
    } else if (kind.kind === "ink") {
      board.nodes.push(...convertInk(kind.strokes, id, board.issues));
    } else {
      issue(
        `${kind.kind} conversion is not yet validated. Element omitted.`,
        id,
      );
    }
  }
  const targets = new Set(
    board.nodes
      .filter((node) => node.kind !== "arrow" && node.kind !== "ink")
      .map((node) => node.id),
  );
  board.nodes = board.nodes.filter((node: BoardNode) => {
    if (
      node.kind === "arrow" &&
      ((node.startId && !targets.has(node.startId)) ||
        (node.endId && !targets.has(node.endId)))
    ) {
      issue(
        "Connector references an element that could not be converted. Connector omitted.",
        node.id,
      );
      return false;
    }
    return true;
  });
  return board;
}
