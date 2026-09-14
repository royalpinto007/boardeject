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

it.each([
  ["unequal-columns-after", [258, 258], [244, 344]],
  ["unequal-rows-after", [157.5, 258], [344, 344]],
  ["unequal-both-after", [157.5, 258], [244, 344]],
] as const)(
  "preserves genuine unequal dimensions in %s",
  (name, rowHeights, columnWidths) => {
    const native = decodeCrlNative(
      readFileSync(root + "variants/" + name + ".crlnative"),
    );
    const table = recoverNativeTable(native);
    expect(table).toBeDefined();
    expect(table!.rowHeights).toEqual(rowHeights);
    expect(table!.columnWidths).toEqual(columnWidths);
    expect(table!.bounds.width).toBe(
      columnWidths.reduce((sum, width) => sum + width, 0),
    );
    expect(table!.bounds.height).toBe(
      rowHeights.reduce((sum, height) => sum + height, 0),
    );
  },
);

it("uses genuine native key-pool order after a column reorder", () => {
  const before = recoverNativeTable(
    decodeCrlNative(
      readFileSync(root + "variants/column-reorder-before.crlnative"),
    ),
  );
  const after = recoverNativeTable(
    decodeCrlNative(
      readFileSync(root + "variants/column-reorder-after.crlnative"),
    ),
  );
  expect(before!.cells.map((cell) => cell.text)).toEqual([
    "A1",
    "B1",
    "A2",
    "B2",
  ]);
  expect(after!.cells.map((cell) => cell.text)).toEqual([
    "B1",
    "A1",
    "B2",
    "A2",
  ]);
});

it("preserves genuine empty and multiline cells without inventing text", () => {
  const empty = recoverNativeTable(
    decodeCrlNative(readFileSync(root + "variants/empty-baseline.crlnative")),
  );
  expect(empty!.cells).toHaveLength(4);
  expect(empty!.cells.every((cell) => cell.text === "")).toBe(true);
  const emptyBoard = inspectCaptureFile(
    "empty-baseline.crlnative",
    readFileSync(root + "variants/empty-baseline.crlnative"),
  );
  expect(
    emptyBoard.nodes.filter((node) => node.kind === "rectangle"),
  ).toHaveLength(4);
  expect(emptyBoard.nodes.filter((node) => node.kind === "text")).toHaveLength(
    0,
  );

  const multiline = recoverNativeTable(
    decodeCrlNative(readFileSync(root + "variants/multiline-A1.crlnative")),
  );
  expect(multiline!.cells.map((cell) => cell.text)).toEqual([
    "TOP\nBOTTOM",
    "B1",
    "A2",
    "B2",
  ]);
});

it.each([
  ["row-insert-after", 3, 2, ["A1", "B1", "A2", "B2", "", ""]],
  ["row-delete-after", 1, 2, ["A1", "B1"]],
  ["column-insert-after", 2, 3, ["A1", "B1", "", "A2", "B2", ""]],
  ["column-delete-after", 2, 1, ["A1", "A2"]],
] as const)(
  "preserves genuine native structure in %s",
  (name, rowCount, columnCount, expectedText) => {
    const file = readFileSync(root + "variants/" + name + ".crlnative");
    const table = recoverNativeTable(decodeCrlNative(file));
    expect(table).toBeDefined();
    expect(table!.rowHeights).toHaveLength(rowCount);
    expect(table!.columnWidths).toHaveLength(columnCount);
    expect(table!.cells.map((cell) => cell.text)).toEqual(expectedText);
    const board = inspectCaptureFile(name + ".crlnative", file);
    expect(
      board.nodes.filter((node) => node.kind === "rectangle"),
    ).toHaveLength(rowCount * columnCount);
    expect(board.nodes.filter((node) => node.kind === "text")).toHaveLength(
      expectedText.filter(Boolean).length,
    );
  },
);

it("fails safely for a genuine multiple-table selection", () => {
  const file = readFileSync(root + "variants/multiple-tables.crlnative");
  expect(recoverNativeTable(decodeCrlNative(file))).toBeUndefined();
  const board = inspectCaptureFile("multiple-tables.crlnative", file);
  expect(board.nodes).toHaveLength(0);
  expect(board.issues.some((issue) => issue.severity === "unsupported")).toBe(
    true,
  );
});

it.each([
  ["format-bold", { bold: true }, { bold: true, fontSize: 18 }],
  ["format-italic", { italic: true }, { italic: true, fontSize: 18 }],
  ["format-font-bigger", { fontSize: 19 }, { fontSize: 19 }],
  [
    "format-align-left",
    { paragraphAlignment: "left" },
    { paragraphAlignment: "left", fontSize: 18 },
  ],
] as const)(
  "preserves verified native cell formatting in %s",
  (name, nativeStyle, convertedStyle) => {
    const file = readFileSync(root + "variants/" + name + ".crlnative");
    const table = recoverNativeTable(decodeCrlNative(file));
    expect(table!.cells[0]).toMatchObject({ text: "A1", style: nativeStyle });
    const output = convert(inspectCaptureFile(name + ".crlnative", file));
    const text = output.elements.find((element) => element.type === "text");
    expect(text).toMatchObject({
      text: "A1",
      fontSize: convertedStyle.fontSize,
      textAlign: "left",
      customData: { boardejectSourceStyle: { runs: [convertedStyle] } },
    });
  },
);
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
