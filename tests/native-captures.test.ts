import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { decodeCrlNative } from "libfreeform";

const root = "tests/fixtures/freeform-4.5/";

it("keeps the genuine macOS pen result outside PencilKit ink support", () => {
  const evidence = JSON.parse(
    readFileSync(root + "macos-pen-shape-summary.json", "utf8"),
  );
  expect(evidence).toMatchObject({
    nativeFreeformCopy: true,
    itemClasses: ["Freeform.CRLWPShapeItem"],
    drawingFlavorPresent: false,
    freehandDrawingItemPresent: false,
    eraserControlObserved: false,
    pressureVerified: false,
    importedDrawingUsed: false,
  });
  expect(evidence.pasteboardTypes).toContain(
    "com.apple.freeform.CRLNativeData",
  );
  expect(evidence.pasteboardTypes).not.toContain("com.apple.drawing");
});
function objects(name: string): Record<string, any>[] {
  const all: Record<string, any>[] = [];
  function visit(value: unknown) {
    if (!value || typeof value !== "object") return;
    if (!Array.isArray(value)) all.push(value as Record<string, any>);
    for (const child of Object.values(value)) visit(child);
  }
  visit(JSON.parse(readFileSync(root + name + ".content.json", "utf8")));
  return all;
}

it("retains the actual native text, not an empty UI placeholder", () => {
  expect(
    objects("rich-text").some((v) =>
      v.attributed_string?.includes("BoardEject native text 123"),
    ),
  ).toBe(true);
});

it("retains two native connection anchors matching captured shape identities", () => {
  const board = decodeCrlNative(
    readFileSync(root + "bound-connectors.crlnative"),
  );
  const ids = board.items.map((item) => item.uuid);
  const line = objects("bound-connectors").find(
    (v) =>
      v.type_identifier === "com.apple.apps.content-language.connection-line",
  )!;
  expect(ids).toContain(line.head.anchor.object_id);
  expect(ids).toContain(line.tail.anchor.object_id);
  expect(line.head.anchor.object_id).not.toBe(line.tail.anchor.object_id);
});

it("retains two-level native grouping across separate scale and rotation captures", () => {
  for (const [name, scale, angle] of [
    ["nested-transformed-group", 1, 0],
    ["nested-transformed-group-scaled", 0.8, 0],
    ["nested-transformed-group-rotated", 0.8, 315.40924072265625],
  ] as const) {
    const groups = objects(name).filter(
      (v) => v.type_identifier === "com.apple.apps.content-language.group",
    );
    expect(groups).toHaveLength(2);
    expect(groups[0].geometry.size.width).toBeCloseTo(scale);
    expect(groups[0].geometry.angle).toBeCloseTo(angle);
  }
});

it.each([
  "rich-text",
  "bound-connectors",
  "nested-transformed-group",
  "nested-transformed-group-scaled",
  "nested-transformed-group-rotated",
])("does not weaken the unsupported-version gate for %s", (name) => {
  const board = decodeCrlNative(readFileSync(root + name + ".crlnative"));
  expect(board.compatibility).toEqual({
    kind: "unsupported",
    minimumVersion: 7,
  });
  expect(board.items.length).toBeGreaterThan(0);
});
