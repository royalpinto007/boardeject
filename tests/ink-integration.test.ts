import { readFileSync } from "node:fs";
import { decodePasteboard } from "libfreeform";
import { expect, it } from "vitest";
import { normalize } from "../packages/freeform-parser/normalize";
import { convert } from "../packages/excalidraw-converter/index";
const ink = {
  uti: "com.apple.drawing",
  bytes: readFileSync("tests/fixtures/upstream/ink-pen.drawing"),
};
it("decodes binary PencilKit controls into editable sampled strokes", () => {
  const board = normalize(decodePasteboard({ flavors: [ink] }));
  expect(board.nodes).toHaveLength(2);
  expect(
    board.nodes.every((n) => n.kind === "ink" && n.points.length > 4),
  ).toBe(true);
  expect(convert(board).elements.every((e) => e.type === "freedraw")).toBe(
    true,
  );
  expect(board.issues.some((i) => i.message.includes("Endpoint"))).toBe(true);
});
it("preserves independent ink when the real native fixture has unsupported compatibility", () => {
  const board = normalize(
    decodePasteboard({
      flavors: [
        ink,
        {
          uti: "com.apple.freeform.CRLNativeData",
          bytes: readFileSync("tests/fixtures/upstream/real-board.crlnative"),
        },
      ],
    }),
  );
  expect(board.nodes).toHaveLength(2);
  expect(board.issues.some((i) => i.message.includes("compatibility"))).toBe(
    true,
  );
});
