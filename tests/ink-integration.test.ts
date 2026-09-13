import { readFileSync } from "node:fs";
import { decodePasteboard } from "libfreeform";
import { expect, it } from "vitest";
import { normalize } from "../packages/freeform-parser/normalize";
import { convert } from "../packages/excalidraw-converter/index";
const ink = {
  uti: "com.apple.drawing",
  bytes: readFileSync("tests/fixtures/upstream/ink-pen.drawing"),
};
it("omits Apple's serialized geometric mask rather than resurrecting its hidden gap", () => {
  const board = normalize(
    decodePasteboard({
      flavors: [
        {
          uti: "com.apple.drawing",
          bytes: readFileSync("tests/fixtures/apple/masked-gap.drawing"),
        },
      ],
    }),
  );
  expect(board.nodes).toHaveLength(0);
  expect(
    board.issues.some(
      (issue) =>
        issue.severity === "unsupported" &&
        issue.message.includes("Masked ink"),
    ),
  ).toBe(true);
});
it("retains Apple-generated variable width controls but reports uniform output", () => {
  const decoded = decodePasteboard({
    flavors: [
      {
        uti: "com.apple.drawing",
        bytes: readFileSync("tests/fixtures/apple/variable-width.drawing"),
      },
    ],
  });
  expect(decoded.drawing.status).toBe("decoded");
  if (decoded.drawing.status !== "decoded")
    throw new Error("Drawing not decoded");
  expect(decoded.drawing.value.strokes[0].points.map((p) => p.width)).toEqual([
    2, 4, 6, 8, 10, 12, 14,
  ]);
  expect(decoded.drawing.value.strokes[0].points.map((p) => p.force)).toEqual([
    0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875,
  ]);
  const board = normalize(decoded);
  expect(board.nodes).toHaveLength(1);
  expect(
    board.issues.some((issue) =>
      issue.message.includes("uniform Excalidraw stroke"),
    ),
  ).toBe(true);
});
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
