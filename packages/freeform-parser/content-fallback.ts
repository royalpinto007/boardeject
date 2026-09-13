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
