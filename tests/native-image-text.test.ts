import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { decodePasteboard } from "libfreeform";
import { normalize } from "../packages/freeform-parser/normalize";
import { embeddedImage } from "../packages/freeform-parser/media";
import { convert } from "../packages/excalidraw-converter/index";
import { fontArchive } from "../packages/freeform-parser/font-archive";

const root = "tests/fixtures/freeform-4.5/";
const content = (name: string) =>
  JSON.parse(readFileSync(root + name + ".content.json", "utf8"))[0];

it("preserves the native image resource identity and bytes across a move", () => {
  const before = content("image-baseline"),
    after = content("image-moved");
  expect(before.type_identifier).toBe("com.apple.apps.content-language.image");
  expect(before.resource.indirect.encoding_format).toBe("passthrough");
  expect(after.resource.indirect.identifier).toBe(
    before.resource.indirect.identifier,
  );
  expect(before.geometry.size).toMatchObject({ width: 64, height: 48 });
  expect(after.geometry.position.x - before.geometry.position.x).toBe(11);
  expect(after.geometry.position.y).toBe(before.geometry.position.y);
  const original = readFileSync(root + "image-baseline.resource.png");
  expect(readFileSync(root + "image-moved.resource.png")).toEqual(original);
  expect(embeddedImage(original)?.mimeType).toBe("image/png");
  // The original pixels do not include these Freeform appearance effects.
  expect(before.mask.path.primary_case).toBe("bezier");
  expect(before.shadow.primary_case).toBe("dropShadow");
});

it("retains genuine plain, bold and mixed text run boundaries", () => {
  for (const name of ["text-plain", "text-bold", "text-mixed"]) {
    const runs = content(name).text.attributed_string;
    expect(runs.filter((v: unknown) => typeof v === "string").join("")).toBe(
      "Plain Bold Italic",
    );
    expect(
      runs
        .filter((v: unknown) => typeof v !== "string")
        .every((v: any) => typeof v.NSFont === "string"),
    ).toBe(true);
  }
  const mixed = content("text-mixed").text.attributed_string;
  expect([mixed[0], mixed[2], mixed[4]]).toEqual(["Plain ", "Bold ", "Italic"]);
  expect(
    Buffer.from(mixed[3].NSFont, "base64").includes(
      Buffer.from("Helvetica-Bold"),
    ),
  ).toBe(true);
  expect(
    Buffer.from(mixed[5].NSFont, "base64").includes(
      Buffer.from("Helvetica-Oblique"),
    ),
  ).toBe(true);
  expect(content("text-plain").text.attributed_string[1].NSFont).not.toBe(
    content("text-bold").text.attributed_string[1].NSFont,
  );
});

it.each([
  "image-baseline",
  "image-moved",
  "text-plain",
  "text-bold",
  "text-mixed",
])(
  "converts the verified single object with an explicit approximation for %s",
  (name) => {
    const flavors = [
      {
        uti: "com.apple.freeform.CRLNativeData",
        bytes: readFileSync(root + name + ".crlnative"),
      },
      {
        uti: "com.apple.apps.content-language.canvas-object-1.0",
        bytes: readFileSync(root + name + ".content.json"),
      },
    ];
    if (name.startsWith("image"))
      flavors.push({
        uti: content(name).resource.indirect.identifier,
        bytes: readFileSync(root + name + ".resource.png"),
      });
    const board = normalize(decodePasteboard({ flavors }));
    expect(board.nodes).toHaveLength(1);
    expect(board.issues.some((i) => i.severity === "approximation")).toBe(true);
    const output = convert(board);
    if (name.startsWith("image")) {
      const svg = atob(Object.values(output.files)[0].dataURL.split(",")[1]);
      expect(svg).toContain(content(name).mask.path.bezier.path);
      expect(svg).toContain(
        'dy="2" stdDeviation="1.5" flood-color="rgb(0,0,0)" flood-opacity="0.25"',
      );
      expect(svg).toContain(
        embeddedImage(readFileSync(root + name + ".resource.png"))!.dataURL,
      );
      expect(output.elements[0].x).toBe(content(name).geometry.position.x - 16);
    } else if (name === "text-mixed")
      expect(
        output.elements[0].customData?.boardejectSourceStyle,
      ).toMatchObject({
        runs: [
          { start: 0, end: 6 },
          { start: 6, end: 11, bold: true },
          { start: 11, end: 17, italic: true },
        ],
      });
    if (name.startsWith("text"))
      expect(board.nodes[0]).toMatchObject({
        kind: "text",
        text: "Plain Bold Italic",
        fontSize: 18,
        textAlign: "center",
      });
    else
      expect(board.nodes[0]).toMatchObject({
        kind: "image",
        mimeType: "image/svg+xml",
      });
  },
);

it("rejects malformed font archives with bounded errors", () => {
  for (const input of ["", "!!!!", btoa("bplist00"), "a".repeat(70000)])
    expect(() => fontArchive(input)).toThrow();
});

it("preserves native multiline combined-style metadata and editable line breaks", () => {
  const name = "text-multiline-combined";
  const board = normalize(
    decodePasteboard({
      flavors: [
        {
          uti: "com.apple.freeform.CRLNativeData",
          bytes: readFileSync(root + name + ".crlnative"),
        },
        {
          uti: "com.apple.apps.content-language.canvas-object-1.0",
          bytes: readFileSync(root + name + ".content.json"),
        },
      ],
    }),
  );
  const element = convert(board).elements[0];
  expect(element).toMatchObject({
    type: "text",
    text: "First Bold\nBoth",
    fontSize: 18,
    textAlign: "center",
  });
  expect(element.customData?.boardejectSourceStyle).toMatchObject({
    runs: [
      { text: "First " },
      { text: "Bold\n", bold: true },
      {
        text: "Both",
        bold: true,
        italic: true,
        fontFamily: "Helvetica-BoldOblique",
      },
    ],
  });
});

it("preserves verified text size and alignment fields in editable output (adapter variations)", () => {
  // Output-model tests, not native evidence that the attempted size shortcut worked.
  for (const fontSize of [12, 18, 36])
    for (const textAlign of ["left", "center", "right"] as const) {
      const document = convert({
        source: "synthetic-example",
        sourceItems: 1,
        issues: [],
        nodes: [
          {
            id: "size-case",
            kind: "text",
            text: "First\nSecond",
            fontSize,
            textAlign,
            bounds: { x: 10, y: 20, width: 200, height: 100, rotation: 0 },
            groups: ["logical-text"],
            appearance: {
              fill: "transparent",
              stroke: "#000000",
              strokeWidth: 1,
              opacity: 100,
            },
          },
        ],
      });
      expect(document.elements[0]).toMatchObject({
        fontSize,
        textAlign,
        groupIds: ["logical-text"],
        text: "First\nSecond",
      });
    }
});

it("withholds an absent shadow variant until a genuine capture proves it", () => {
  const o = content("image-baseline");
  delete o.shadow;
  const board = normalize(
    decodePasteboard({
      flavors: [
        {
          uti: "com.apple.freeform.CRLNativeData",
          bytes: readFileSync(root + "image-baseline.crlnative"),
        },
        {
          uti: "com.apple.apps.content-language.canvas-object-1.0",
          bytes: new TextEncoder().encode(JSON.stringify([o])),
        },
        {
          uti: o.resource.indirect.identifier,
          bytes: readFileSync(root + "image-baseline.resource.png"),
        },
      ],
    }),
  );
  expect(board.nodes).toHaveLength(0);
  expect(board.issues.some((i) => i.severity === "unsupported")).toBe(true);
});

it.each([
  "missing-resource",
  "script-path",
  "huge-path",
  "rotated-mask",
  "other-shadow-radius",
  "other-shadow-color",
])("withholds unsupported image effects: %s", (mutation) => {
  const o = content("image-baseline");
  if (mutation === "missing-resource")
    o.resource.indirect.identifier += "missing";
  if (mutation === "script-path")
    o.mask.path.bezier.path = 'M 0 0"/><script>alert(1)</script>';
  if (mutation === "huge-path") o.mask.path.bezier.path = "M 1e999 0";
  if (mutation === "rotated-mask") o.mask.geometry.angle = 30;
  if (mutation === "other-shadow-radius") o.shadow.dropShadow.radius = 6;
  if (mutation === "other-shadow-color") o.shadow.dropShadow.color.rgba.red = 1;
  const board = normalize(
    decodePasteboard({
      flavors: [
        {
          uti: "com.apple.freeform.CRLNativeData",
          bytes: readFileSync(root + "image-baseline.crlnative"),
        },
        {
          uti: "com.apple.apps.content-language.canvas-object-1.0",
          bytes: new TextEncoder().encode(JSON.stringify([o])),
        },
        {
          uti: content("image-baseline").resource.indirect.identifier,
          bytes: readFileSync(root + "image-baseline.resource.png"),
        },
      ],
    }),
  );
  expect(board.nodes).toHaveLength(0);
  expect(board.issues.some((i) => i.severity === "unsupported")).toBe(true);
});
