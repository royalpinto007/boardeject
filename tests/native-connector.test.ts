import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { decodePasteboard } from "libfreeform";
import { normalize } from "../packages/freeform-parser/normalize";
import { convert } from "../packages/excalidraw-converter/index";

const root = "tests/fixtures/freeform-4.5/";

function parse(
  content: Uint8Array = readFileSync(`${root}bound-connectors.content.json`),
) {
  return normalize(
    decodePasteboard({
      flavors: [
        {
          uti: "com.apple.freeform.CRLNativeData",
          bytes: readFileSync(`${root}bound-connectors.crlnative`),
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

it("rejects ambiguous endpoint-to-shape correlation", () => {
  const content = JSON.parse(
    readFileSync(`${root}bound-connectors.content.json`, "utf8"),
  );
  content[1].geometry.position = content[0].geometry.position;
  const board = parse(new TextEncoder().encode(JSON.stringify(content)));
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
