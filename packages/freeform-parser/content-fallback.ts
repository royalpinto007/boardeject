import type { FreeformPasteboard } from "libfreeform";
import type { BoardNode, Issue } from "../board-model/index";
import { embeddedImage } from "./media";
import { fontArchive, attributeArchive } from "./font-archive";

function validPath(path: string): boolean {
  const tokens = path.match(
    /[MLCZ]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g,
  );
  if (!tokens || tokens[0] !== "M" || tokens.length > 3000) return false;
  if (tokens.join("") !== path.replace(/[\s,]/g, "")) return false;
  let at = 0;
  while (at < tokens.length) {
    const command = tokens[at++];
    const count = ({ M: 2, L: 2, C: 6, Z: 0 } as Record<string, number>)[
      command
    ];
    if (count === undefined) return false;
    for (let i = 0; i < count; i++) {
      const token = tokens[at++],
        n = Number(token);
      if (token === undefined || !Number.isFinite(n) || Math.abs(n) > 100000)
        return false;
    }
  }
  return true;
}

type ContentObject = Record<string, any>;

const finite = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  Math.abs(value) < 100000;

function contentGeometry(value: unknown) {
  const geometry = value as ContentObject | undefined;
  const x = geometry?.position?.x,
    y = geometry?.position?.y,
    width = geometry?.size?.width,
    height = geometry?.size?.height,
    angle = geometry?.angle;
  if (
    geometry?.type_identifier !== "com.apple.apps.content-language.geometry" ||
    geometry.version !== "1.0" ||
    geometry.flip_horizontally !== false ||
    geometry.flip_vertically === true ||
    ![x, y, width, height, angle].every(finite) ||
    width <= 0 ||
    height <= 0
  )
    return;
  return { x, y, width, height, angle } as const;
}

function solidFill(value: unknown): string | undefined {
  const fill = value as ContentObject | undefined,
    color = fill?.color?.rgba;
  if (
    fill?.type_identifier !== "com.apple.apps.content-language.fill" ||
    fill.version !== "1.0" ||
    fill.primary_case !== "color" ||
    fill.color?.type_identifier !== "com.apple.apps.content-language.color" ||
    fill.color?.version !== "1.0" ||
    fill.color?.primary_case !== "rgba" ||
    color?.type_identifier !== "com.apple.apps.content-language.color.rgba" ||
    color.version !== "1.1" ||
    color.color_space !== "srgb" ||
    ![color.red, color.green, color.blue, color.alpha].every(
      (component) =>
        typeof component === "number" &&
        Number.isFinite(component) &&
        component >= 0 &&
        component <= 1,
    ) ||
    color.alpha !== 1
  )
    return;
  return `#${[color.red, color.green, color.blue]
    .map((component) =>
      Math.round(component * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

/** Recover the exact nested-group subset established by genuine Freeform 4.5
 * translation, scale and rotation differentials. Their content-language leaf
 * geometry is already in canvas space, so applying the group transform again
 * would be incorrect. Unknown shapes, labels, flips and malformed hierarchies
 * fail as one unit instead of leaking a partial group.
 */
export function contentGroupFallback(
  p: FreeformPasteboard,
): { nodes: BoardNode[]; issues: Issue[] } | undefined {
  const flavor = p.unknownFlavors.find(
    (entry) =>
      entry.uti === "com.apple.apps.content-language.canvas-object-1.0",
  );
  if (
    !flavor ||
    flavor.bytes.length > 1024 * 1024 ||
    p.native.status !== "decoded" ||
    p.native.value.items.length !== 1
  )
    return;
  try {
    const values: unknown = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(flavor.bytes),
    );
    if (!Array.isArray(values) || values.length !== 1) return;
    const root = values[0] as ContentObject,
      rootGeometry = contentGeometry(root.geometry);
    if (
      root.type_identifier !== "com.apple.apps.content-language.group" ||
      root.version !== "1.0" ||
      root.opacity !== 1 ||
      !rootGeometry ||
      rootGeometry.width !== rootGeometry.height ||
      !Array.isArray(root.children) ||
      !root.children.length
    )
      return;
    const rootId = p.native.value.items[0].uuid,
      nodes: BoardNode[] = [],
      issues: Issue[] = [],
      seenIds = new Set<string>();
    let visited = 0;

    const visit = (
      wrapper: ContentObject,
      path: readonly number[],
      groups: readonly string[],
    ): boolean => {
      if (++visited > 10000 || path.length > 128) return false;
      const primary = wrapper.primary_case,
        value = wrapper[primary],
        id = `${rootId}-${path.join("-")}`;
      if (
        wrapper.type_identifier !==
          "com.apple.apps.content-language.canvas-object" ||
        wrapper.version !== "1.0" ||
        !value ||
        typeof value !== "object" ||
        seenIds.has(id)
      )
        return false;
      seenIds.add(id);
      if (primary === "group") {
        const geometry = contentGeometry(value.geometry);
        if (
          value.type_identifier !== "com.apple.apps.content-language.group" ||
          value.version !== "1.0" ||
          value.opacity !== 1 ||
          !geometry ||
          geometry.x !== 0 ||
          geometry.y !== 0 ||
          geometry.angle !== 0 ||
          geometry.width !== rootGeometry.width ||
          geometry.height !== rootGeometry.height ||
          !Array.isArray(value.children) ||
          !value.children.length
        )
          return false;
        return value.children.every((child: unknown, index: number) =>
          visit(child as ContentObject, [...path, index], [id, ...groups]),
        );
      }
      if (primary !== "shape") return false;
      const geometry = contentGeometry(value.geometry),
        fill = solidFill(value.fill),
        attributed = value.text?.attributed_string;
      if (
        value.type_identifier !== "com.apple.apps.content-language.shape" ||
        value.version !== "1.0" ||
        value.opacity !== 1 ||
        value.stroke !== "empty" ||
        !geometry ||
        geometry.angle !== rootGeometry.angle ||
        !fill ||
        !Array.isArray(attributed) ||
        attributed
          .filter((entry: unknown) => typeof entry === "string")
          .join("") !== "\u200b"
      )
        return false;
      let kind: "rectangle" | "ellipse" = "rectangle";
      if (value.path !== undefined) {
        const pathValue = value.path?.bezier?.path;
        if (
          value.path?.type_identifier !==
            "com.apple.apps.content-language.path" ||
          value.path?.version !== "1.0" ||
          value.path?.primary_case !== "bezier" ||
          value.path?.bezier?.type_identifier !==
            "com.apple.apps.content-language.path.bezier-path" ||
          value.path?.bezier?.version !== "1.0" ||
          typeof pathValue !== "string" ||
          !validPath(pathValue) ||
          Math.abs(geometry.width - geometry.height) > 0.01
        )
          return false;
        kind = "ellipse";
        issues.push({
          itemId: id,
          severity: "approximation",
          message:
            "The verified Freeform oval path remains editable as an Excalidraw ellipse.",
        });
      }
      nodes.push({
        id,
        kind,
        bounds: {
          x: geometry.x,
          y: geometry.y,
          width: geometry.width,
          height: geometry.height,
          rotation: (geometry.angle * Math.PI) / 180,
        },
        groups: [...groups],
        appearance: {
          fill,
          stroke: "transparent",
          strokeWidth: 1,
          opacity: 100,
        },
      });
      return true;
    };

    if (
      !root.children.every((child: unknown, index: number) =>
        visit(child as ContentObject, [index], [rootId]),
      ) ||
      !nodes.length
    )
      return;
    issues.push({
      itemId: rootId,
      severity: "approximation",
      message:
        "Verified Freeform 4.5 nested-group translation, uniform scale and rotation are preserved from canvas-space clipboard geometry. Derived child identities retain editable nested grouping; flips, labels and unknown group structures remain unsupported.",
    });
    return { nodes, issues };
  } catch {
    return;
  }
}

function connectorShape(value: ContentObject):
  | {
      geometry: NonNullable<ReturnType<typeof contentGeometry>>;
      fill: string;
      kind: "rectangle" | "ellipse";
      label?: {
        text: string;
        fontSize: number;
        alignment: "center";
        runs: Array<{
          start: number;
          end: number;
          text: string;
          fontFamily: string;
          fontSize: number;
          bold: boolean;
          italic: boolean;
          alignment: number;
        }>;
      };
    }
  | undefined {
  const geometry = contentGeometry(value.geometry),
    fill = solidFill(value.fill),
    attributed = value.text?.attributed_string;
  if (
    value.type_identifier !== "com.apple.apps.content-language.shape" ||
    value.version !== "1.0" ||
    value.opacity !== 1 ||
    value.stroke !== "empty" ||
    !geometry ||
    geometry.angle !== 0 ||
    !fill ||
    !Array.isArray(attributed) ||
    !attributed.length ||
    attributed.length > 256 ||
    attributed.length % 2
  )
    return;
  let label:
    | {
        text: string;
        fontSize: number;
        alignment: "center";
        runs: Array<{
          start: number;
          end: number;
          text: string;
          fontFamily: string;
          fontSize: number;
          bold: boolean;
          italic: boolean;
          alignment: number;
        }>;
      }
    | undefined;
  const plain = attributed
    .filter((entry: unknown) => typeof entry === "string")
    .join("");
  if (plain !== "\u200b") {
    if (!plain || plain.length > 100000) return;
    const runs = [];
    let text = "";
    for (let index = 0; index < attributed.length; index += 2) {
      if (
        typeof attributed[index] !== "string" ||
        typeof attributed[index + 1]?.NSFont !== "string" ||
        typeof attributed[index + 1]?.NSParagraphStyle !== "string"
      )
        return;
      const font = fontArchive(attributed[index + 1].NSFont),
        alignment = attributeArchive(attributed[index + 1].NSParagraphStyle)
          .root.NSAlignment;
      if (
        ![
          ".AppleSystemUIFont",
          ".AppleSystemUIFontDemi",
          "Helvetica-Bold",
          "Helvetica-Oblique",
          "Helvetica-BoldOblique",
        ].includes(font.name) ||
        font.size !== 18 ||
        alignment !== 2
      )
        return;
      runs.push({
        start: text.length,
        end: text.length + attributed[index].length,
        text: attributed[index],
        fontFamily: font.name,
        fontSize: font.size,
        bold: ["Helvetica-Bold", "Helvetica-BoldOblique"].includes(font.name),
        italic: ["Helvetica-Oblique", "Helvetica-BoldOblique"].includes(
          font.name,
        ),
        alignment,
      });
      text += attributed[index];
    }
    label = { text, fontSize: 18, alignment: "center", runs };
  }
  if (value.path === undefined)
    return { geometry, fill, kind: "rectangle", label };
  const pathValue = value.path?.bezier?.path;
  if (
    value.path?.type_identifier !== "com.apple.apps.content-language.path" ||
    value.path?.version !== "1.0" ||
    value.path?.primary_case !== "bezier" ||
    value.path?.bezier?.type_identifier !==
      "com.apple.apps.content-language.path.bezier-path" ||
    value.path?.bezier?.version !== "1.0" ||
    typeof pathValue !== "string" ||
    !validPath(pathValue) ||
    Math.abs(geometry.width - geometry.height) > 0.01
  )
    return;
  return { geometry, fill, kind: "ellipse", label };
}

/** Recover the genuine two-shape connector capture without correlating by
 * array order. Anchor UUIDs must be native item identities and each endpoint
 * must uniquely match the center of its shape.
 */
export function contentConnectorFallback(
  p: FreeformPasteboard,
): { nodes: BoardNode[]; issues: Issue[] } | undefined {
  const flavor = p.unknownFlavors.find(
    (entry) =>
      entry.uti === "com.apple.apps.content-language.canvas-object-1.0",
  );
  if (
    !flavor ||
    flavor.bytes.length > 1024 * 1024 ||
    p.native.status !== "decoded" ||
    p.native.value.items.length !== 3
  )
    return;
  try {
    const values: unknown = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(flavor.bytes),
    );
    if (!Array.isArray(values) || values.length !== 3) return;
    const shapes = values.filter(
        (value: ContentObject) =>
          value.type_identifier === "com.apple.apps.content-language.shape",
      ),
      lines = values.filter(
        (value: ContentObject) =>
          value.type_identifier ===
          "com.apple.apps.content-language.connection-line",
      );
    if (shapes.length !== 2 || lines.length !== 1) return;
    const line = lines[0] as ContentObject,
      nativeIds = new Set(p.native.value.items.map((item) => item.uuid)),
      usedIds = new Set<string>();
    if (
      line.version !== "1.0" ||
      line.opacity !== 1 ||
      line.path != null ||
      line.routing != null ||
      line.stroke?.type_identifier !==
        "com.apple.apps.content-language.stroke" ||
      line.stroke?.version !== "1.0" ||
      line.stroke?.primary_case !== "line" ||
      line.stroke?.line?.type_identifier !==
        "com.apple.apps.content-language.stroke.line" ||
      line.stroke?.line?.version !== "1.0" ||
      line.stroke?.line?.pattern !== "solid" ||
      !finite(line.stroke?.line?.width) ||
      line.stroke.line.width < 0 ||
      line.stroke.line.width > 100
    )
      return;
    const endpoint = (value: unknown) => {
      const end = value as ContentObject | undefined,
        point = end?.end_point,
        id = end?.anchor?.object_id;
      if (
        end?.type_identifier !==
          "com.apple.apps.content-language.connection-line.end" ||
        end.version !== "1.0" ||
        end.line_end !== "none" ||
        end.outset !== 0 ||
        end.anchor?.type_identifier !==
          "com.apple.apps.content-language.connection-line.end.anchor" ||
        end.anchor?.version !== "1.0" ||
        end.anchor?.magnet !== "center" ||
        typeof id !== "string" ||
        !nativeIds.has(id) ||
        point?.type_identifier !== "com.apple.apps.content-language.position" ||
        point.version !== "1.0" ||
        !finite(point.x) ||
        !finite(point.y)
      )
        return;
      return { id, x: point.x as number, y: point.y as number };
    };
    const tail = endpoint(line.tail),
      head = endpoint(line.head);
    if (!tail || !head || tail.id === head.id) return;
    const nodes: BoardNode[] = [];
    for (const shape of shapes) {
      const parsed = connectorShape(shape);
      if (!parsed) return;
      const center = {
          x: parsed.geometry.x + parsed.geometry.width / 2,
          y: parsed.geometry.y + parsed.geometry.height / 2,
        },
        matches = [tail, head].filter(
          (candidate) =>
            Math.abs(candidate.x - center.x) < 0.01 &&
            Math.abs(candidate.y - center.y) < 0.01,
        );
      if (matches.length !== 1 || usedIds.has(matches[0].id)) return;
      usedIds.add(matches[0].id);
      const labelGroup = parsed.label ? `${matches[0].id}-label-group` : null;
      nodes.push({
        id: matches[0].id,
        kind: parsed.kind,
        bounds: { ...parsed.geometry, rotation: 0 },
        groups: labelGroup ? [labelGroup] : [],
        appearance: {
          fill: parsed.fill,
          stroke: "transparent",
          strokeWidth: 1,
          opacity: 100,
        },
      });
      if (parsed.label)
        nodes.push({
          id: `${matches[0].id}-label`,
          kind: "text",
          bounds: {
            x: parsed.geometry.x + 10,
            y: parsed.geometry.y + 10,
            width: Math.max(1, parsed.geometry.width - 20),
            height: Math.max(1, parsed.geometry.height - 20),
            rotation: 0,
          },
          groups: [labelGroup!],
          appearance: {
            fill: "transparent",
            stroke: "#000000",
            strokeWidth: 1,
            opacity: 100,
          },
          text: parsed.label.text,
          fontSize: parsed.label.fontSize,
          textAlign: parsed.label.alignment,
          sourceStyle: { runs: parsed.label.runs },
        });
    }
    const connectorIds = [...nativeIds].filter((id) => !usedIds.has(id));
    if (connectorIds.length !== 1) return;
    const stroke = line.stroke.line.color?.rgba;
    if (
      line.stroke.line.color?.type_identifier !==
        "com.apple.apps.content-language.color" ||
      line.stroke.line.color?.version !== "1.0" ||
      line.stroke.line.color?.primary_case !== "rgba" ||
      stroke?.type_identifier !==
        "com.apple.apps.content-language.color.rgba" ||
      stroke?.version !== "1.1" ||
      stroke?.color_space !== "srgb" ||
      ![stroke.red, stroke.green, stroke.blue, stroke.alpha].every(
        (component) =>
          typeof component === "number" &&
          Number.isFinite(component) &&
          component >= 0 &&
          component <= 1,
      )
    )
      return;
    nodes.push({
      id: connectorIds[0],
      kind: "arrow",
      bounds: {
        x: Math.min(tail.x, head.x),
        y: Math.min(tail.y, head.y),
        width: Math.abs(head.x - tail.x),
        height: Math.abs(head.y - tail.y),
        rotation: 0,
      },
      groups: [],
      appearance: {
        fill: "transparent",
        stroke: `#${[stroke.red, stroke.green, stroke.blue]
          .map((component) =>
            Math.round(component * 255)
              .toString(16)
              .padStart(2, "0"),
          )
          .join("")}`,
        strokeWidth: line.stroke.line.width,
        opacity: Math.round(stroke.alpha * 100),
      },
      start: [tail.x, tail.y],
      end: [head.x, head.y],
      startId: tail.id,
      endId: head.id,
    });
    return {
      nodes,
      issues: [
        {
          itemId: connectorIds[0],
          severity: "approximation",
          message:
            "Verified Freeform 4.5 center-anchor identities remain reciprocal Excalidraw bindings. Captured labels remain editable and grouped with their shapes; exact font metrics and vertical centering are approximated. The connector is editable; routing and arrowheads use the captured straight, no-arrowhead subset.",
        },
      ],
    };
  } catch {
    return;
  }
}

/** Narrow fallback for the verified single-object content-language representation.
 * Does not reinterpret native CRL fields or join different objects by array order.
 */
export function contentFallback(
  p: FreeformPasteboard,
): { node: BoardNode; issues: Issue[] } | undefined {
  const flavor = p.unknownFlavors.find(
    (f) => f.uti === "com.apple.apps.content-language.canvas-object-1.0",
  );
  if (
    !flavor ||
    flavor.bytes.length > 1024 * 1024 ||
    p.native.status !== "decoded" ||
    p.native.value.items.length !== 1
  )
    return;
  try {
    const objects = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(flavor.bytes),
    );
    if (!Array.isArray(objects) || objects.length !== 1) return;
    const o = objects[0],
      g = o.geometry;
    if (
      o.version !== "1.0" ||
      g?.version !== "1.0" ||
      g.angle !== 0 ||
      g.flip_horizontally ||
      g.flip_vertically
    )
      return;
    const { x, y } = g.position ?? {},
      { width, height } = g.size ?? {};
    if (
      ![x, y, width, height].every(
        (n) => Number.isFinite(n) && Math.abs(n) < 100000,
      ) ||
      width <= 0 ||
      height <= 0
    )
      return;
    const id = p.native.value.items[0].uuid;
    const bounds = { x, y, width, height, rotation: 0 };
    const appearance = {
      fill: "transparent",
      stroke: "#000000",
      strokeWidth: 1,
      opacity: 100,
    };
    const issues: Issue[] = [];
    const warn = (message: string) =>
      issues.push({ itemId: id, severity: "approximation", message });
    if (
      o.type_identifier === "com.apple.apps.content-language.shape" &&
      o.text?.primary_case === "attributed_string"
    ) {
      if (o.stroke !== "empty" || o.fill || o.opacity !== 1) return;
      const values = o.text.attributed_string;
      if (
        !Array.isArray(values) ||
        !values.length ||
        values.length > 256 ||
        values.length % 2
      )
        return;
      const runs = [];
      let text = "";
      for (let i = 0; i < values.length; i += 2) {
        if (
          typeof values[i] !== "string" ||
          typeof values[i + 1]?.NSFont !== "string"
        )
          return;
        const font = fontArchive(values[i + 1].NSFont);
        const alignment = attributeArchive(values[i + 1].NSParagraphStyle).root
          .NSAlignment;
        // The native captures currently prove only these descriptors at 18 pt
        // with centered paragraph alignment. Reject other variants until a
        // genuine Freeform capture establishes their representation.
        if (
          ![
            ".AppleSystemUIFont",
            "Helvetica-Bold",
            "Helvetica-Oblique",
            "Helvetica-BoldOblique",
          ].includes(font.name) ||
          font.size !== 18 ||
          alignment !== 2
        )
          return;
        runs.push({
          start: text.length,
          end: text.length + values[i].length,
          text: values[i],
          fontFamily: font.name,
          fontSize: font.size,
          bold: ["Helvetica-Bold", "Helvetica-BoldOblique"].includes(font.name),
          italic: ["Helvetica-Oblique", "Helvetica-BoldOblique"].includes(
            font.name,
          ),
          alignment,
        });
        text += values[i];
      }
      if (!text || text.length > 100000) return;
      warn(
        "Native text remains editable as one text element. Excalidraw cannot represent mixed bold/italic runs; original run styles are retained in customData. Font family, color, padding and wrapping use defaults; the first run supplies font size and alignment.",
      );
      return {
        node: {
          id,
          bounds,
          appearance,
          groups: [],
          kind: "text",
          text,
          fontSize: runs[0].fontSize,
          textAlign: (["left", "right", "center"] as const)[runs[0].alignment],
          sourceStyle: { runs },
        },
        issues,
      };
    }
    if (
      o.type_identifier !== "com.apple.apps.content-language.image" ||
      o.is_placeholder ||
      o.opacity !== 1
    )
      return;
    const resource = o.resource?.indirect;
    if (
      o.resource?.primary_case !== "indirect" ||
      resource?.encoding_format !== "passthrough" ||
      !/^com\.apple\.apps\.content-language\.resource-[A-F0-9-]{36}$/.test(
        resource.identifier,
      )
    )
      return;
    const bytes = p.unknownFlavors.find(
      (f) => f.uti === resource.identifier,
    )?.bytes;
    const image = bytes && embeddedImage(bytes);
    if (!image || width > 4096 || height > 4096 || width * height > 16000000)
      return;
    const mask = o.mask;
    if (
      !mask ||
      mask.path?.primary_case !== "bezier" ||
      mask.geometry?.angle !== 0
    )
      return;
    if (
      mask.geometry.position.x !== x ||
      mask.geometry.position.y !== y ||
      mask.geometry.size.width !== width ||
      mask.geometry.size.height !== height
    )
      return;
    const path = mask.path.bezier?.path;
    // Only the absolute numeric path commands found in the verified capture.
    if (
      typeof path !== "string" ||
      path.length > 20000 ||
      !/^[MLCZ0-9eE+.,\s-]+$/.test(path) ||
      !validPath(path)
    )
      return;
    const shadow = o.shadow?.dropShadow;
    if (o.shadow?.primary_case !== "dropShadow" || shadow?.angle !== 90) return;
    const color = shadow.color?.rgba;
    if (shadow.color?.primary_case !== "rgba" || color?.color_space !== "srgb")
      return;
    if (
      ![shadow.radius, shadow.offset].every(
        (n) => Number.isFinite(n) && n >= 0 && n <= 100,
      ) ||
      ![shadow.opacity, color.red, color.green, color.blue, color.alpha].every(
        (n) => Number.isFinite(n) && n >= 0 && n <= 1,
      )
    )
      return;
    // These exact values are backed by both the baseline and moved native
    // captures. Other shadows, including an absent-shadow representation,
    // remain unsupported rather than being inferred from synthetic variants.
    if (
      shadow.radius !== 3 ||
      shadow.offset !== 2 ||
      shadow.opacity !== 0.25 ||
      color.red !== 0 ||
      color.green !== 0 ||
      color.blue !== 0 ||
      color.alpha !== 1
    )
      return;
    const pad = Math.ceil(shadow.radius * 4 + shadow.offset + 2),
      rgb = [color.red, color.green, color.blue].map((n) =>
        Math.round(n * 255),
      );
    // Calibrated against the genuine radius-3 downward-shadow render.
    const sigma = 1.5;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width + 2 * pad}" height="${height + 2 * pad}" viewBox="${-pad} ${-pad} ${width + 2 * pad} ${height + 2 * pad}"><defs><clipPath id="m"><path d="${path}"/></clipPath><filter id="s" x="-100%" y="-100%" width="300%" height="300%"><feDropShadow dx="0" dy="${shadow.offset}" stdDeviation="${sigma}" flood-color="rgb(${rgb})" flood-opacity="${shadow.opacity * color.alpha}"/></filter></defs><g filter="url(#s)"><image width="${width}" height="${height}" href="${image.dataURL}" clip-path="url(#m)"/></g></svg>`;
    warn(
      "Native image bytes and verified Bezier mask are retained in an embedded SVG image. Shadow offset, color and opacity are retained; blur appearance is approximate. Mask and shadow are baked into the image asset, not separately editable Excalidraw effects. Other crops, transforms and effects remain unsupported.",
    );
    return {
      node: {
        id,
        bounds: {
          ...bounds,
          x: x - pad,
          y: y - pad,
          width: width + 2 * pad,
          height: height + 2 * pad,
        },
        appearance,
        groups: [],
        kind: "image",
        mimeType: "image/svg+xml",
        dataURL: `data:image/svg+xml;base64,${btoa(svg)}`,
        sourceStyle: { mask, shadow: o.shadow, originalBounds: bounds },
      },
      issues,
    };
  } catch {
    return;
  }
}
