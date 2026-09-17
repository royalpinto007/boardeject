import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { decodePasteboard } from "libfreeform";
import { normalize } from "../packages/freeform-parser/normalize";
import { convert } from "../packages/excalidraw-converter/index";

const root = "tests/fixtures/freeform-4.5/";

function parse(
  name = "bound-connectors",
  content: Uint8Array = readFileSync(`${root}${name}.content.json`),
) {
  return normalize(
    decodePasteboard({
      flavors: [
        {
          uti: "com.apple.freeform.CRLNativeData",
          bytes: readFileSync(`${root}${name}.crlnative`),
        },
        {
          uti: "com.apple.apps.content-language.canvas-object-1.0",
          bytes: content,
        },
      ],
    }),
  );
}

it("recovers genuine shape identities and reciprocal connector bindings", () => {
  const board = parse(),
    arrow = board.nodes.find((node) => node.kind === "arrow");
  expect(board.nodes).toHaveLength(3);
  expect(arrow).toMatchObject({
    kind: "arrow",
    startId: "1401CC30-5B03-484D-BE16-ECAE428DA40D",
    endId: "A3F660A7-1D08-471B-BED6-085C8171B0B9",
    start: [216, 312.5],
    end: [196, 312.5],
  });
  const output = convert(board),
    outputArrow = output.elements.find((element) => element.type === "arrow"),
    targets = output.elements.filter((element) => element.type !== "arrow");
  expect(outputArrow).toMatchObject({
    startBinding: {
      elementId: "1401CC30-5B03-484D-BE16-ECAE428DA40D",
    },
    endBinding: {
      elementId: "A3F660A7-1D08-471B-BED6-085C8171B0B9",
    },
  });
  for (const target of targets)
    expect(target.boundElements).toEqual([{ id: arrow!.id, type: "arrow" }]);
});

it("keeps genuine connected-shape labels editable and grouped", () => {
  const board = parse("labelled-connector"),
    arrow = board.nodes.find((node) => node.kind === "arrow"),
    labels = board.nodes.filter((node) => node.kind === "text");
  expect(arrow?.kind).toBe("arrow");
  if (!arrow || arrow.kind !== "arrow") throw new Error("Missing connector");
  expect(board.nodes).toHaveLength(5);
  expect(labels).toMatchObject([
    { kind: "text", text: "Source", fontSize: 18, textAlign: "center" },
    { kind: "text", text: "Target", fontSize: 18, textAlign: "center" },
  ]);
  for (const label of labels) {
    const shape = board.nodes.find((node) =>
      node.groups.includes(label.groups[0]),
    );
    expect(shape?.id).toBe(
      arrow.startId === shape?.id ? arrow.startId : arrow.endId,
    );
  }
  const output = convert(board),
    outputArrow = output.elements.find((element) => element.type === "arrow");
  expect(outputArrow).toMatchObject({
    startBinding: { elementId: "468A9321-460B-41EA-93F3-305C06E26F2A" },
    endBinding: { elementId: "7FFE2E1E-4223-4DE4-9F2C-8D3FC6DC7172" },
  });
  expect(
    output.elements.flatMap((element) =>
      element.type === "text" && "text" in element ? [element.text] : [],
    ),
  ).toEqual(["Source", "Target"]);
});

it("rejects ambiguous endpoint-to-shape correlation", () => {
  const content = JSON.parse(
    readFileSync(`${root}bound-connectors.content.json`, "utf8"),
  );
  content[1].geometry.position = content[0].geometry.position;
  const board = parse(
    "bound-connectors",
    new TextEncoder().encode(JSON.stringify(content)),
  );
  expect(board.nodes).toEqual([]);
  expect(board.issues).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        severity: "unsupported",
        message: expect.stringMatching(/compatibility is not supported/),
      }),
    ]),
  );
});
