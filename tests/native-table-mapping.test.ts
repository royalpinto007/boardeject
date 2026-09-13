import { readFileSync } from "node:fs";
import { decodeCrlNative } from "libfreeform";
import { expect, it } from "vitest";
import { recoverNativeTable } from "../packages/freeform-parser/native-table";
import { inspectCaptureFile } from "../packages/freeform-parser/test-capture";
import { convert } from "../packages/excalidraw-converter/index";
const root = "tests/fixtures/freeform-4.5/tables/";
it("preserves the native 20-point right / 10-point down translation", () => {
  const board = inspectCaptureFile(
    "table-moved.crlnative",
    readFileSync(root + "table-moved.crlnative"),
  );
  expect(
    board.nodes
      .filter((n) => n.kind === "rectangle")
      .map((n) => [n.bounds.x, n.bounds.y]),
  ).toEqual([
    [52, 64.5],
    [396, 64.5],
    [52, 322.5],
    [396, 322.5],
  ]);
});
it.each([
  "table-baseline",
  ...["A1", "B1", "A2", "B2"].flatMap((c) => [
    `table-change-${c}`,
    `table-restore-${c}`,
  ]),
])("maps cell identities and dimensions in %s", (name) => {
  const native = decodeCrlNative(readFileSync(root + name + ".crlnative"));
  const table = recoverNativeTable(native);
  expect(table).toBeDefined();
  expect(table!.rowHeights).toEqual([258, 258]);
  expect(table!.columnWidths).toEqual([344, 344]);
  expect(table!.bounds).toEqual({
    x: 32,
    y: 54.5,
    width: 688,
    height: 516,
    rotation: 0,
  });
  const expected = readFileSync(root + name + ".txt", "utf8")
    .trimEnd()
    .split(/\t|\n/);
  expect(table!.cells.map((c) => c.text)).toEqual(expected);
  expect(table!.cells.map((c) => [c.row, c.column])).toEqual([
    [0, 0],
    [0, 1],
    [1, 0],
    [1, 1],
  ]);
  expect(native.compatibility.kind).toBe("unsupported");
  const board = inspectCaptureFile(
    name + ".crlnative",
    readFileSync(root + name + ".crlnative"),
  );
  expect(board.nodes).toHaveLength(8);
  expect(
    board.nodes
      .filter((n) => n.kind === "text")
      .map((n) => (n.kind === "text" ? n.text : "")),
  ).toEqual(expected);
  const cells = board.nodes.filter((n) => n.kind === "rectangle");
  expect(
    cells.map((n) => [n.bounds.x, n.bounds.y, n.bounds.width, n.bounds.height]),
  ).toEqual([
    [32, 54.5, 344, 258],
    [376, 54.5, 344, 258],
    [32, 312.5, 344, 258],
    [376, 312.5, 344, 258],
  ]);
  expect(convert(board).elements).toHaveLength(8);
  expect(
    convert(board).elements.every((element) => element.opacity === 100),
  ).toBe(true);
});
it("rejects unrelated real board captures", () => {
  expect(
    recoverNativeTable(
      decodeCrlNative(
        readFileSync("tests/fixtures/upstream/real-board.crlnative"),
      ),
    ),
  ).toBeUndefined();
});
it("rejects truncated archives and mismatched board identity", () => {
  const native = decodeCrlNative(
    readFileSync(root + "table-baseline.crlnative"),
  );
  expect(
    recoverNativeTable({
      ...native,
      rawArchive: native.rawArchive.slice(0, -1),
    }),
  ).toBeUndefined();
  expect(
    recoverNativeTable({
      ...native,
      items: [
        { ...native.items[0], uuid: "00000000-0000-0000-0000-000000000000" },
      ],
    }),
  ).toBeUndefined();
});
