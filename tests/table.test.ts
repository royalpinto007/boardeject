import { expect, it } from "vitest";
import { convertTable } from "../packages/freeform-parser/table";
import type { BaseNode, Issue } from "../packages/board-model/index";
import type { FreeformItemKind } from "libfreeform";
const base: BaseNode = {
  id: "table",
  bounds: { x: 10, y: 20, width: 200, height: 100, rotation: 0 },
  groups: [],
  appearance: {
    fill: "transparent",
    stroke: "#000000",
    strokeWidth: 1,
    opacity: 100,
  },
};
it("converts merged cells and recovered text into grouped editable elements", () => {
  const issues: Issue[] = [];
  const result = convertTable(
    {
      kind: "table",
      rowHeights: [50],
      columnWidths: [50, 50],
      cells: [
        {
          row: 0,
          column: 0,
          columnSpan: 2,
          style: { shadows: [] },
          anchoredItemIds: [],
          text: { plain: "Merged", runs: [] },
        },
      ],
    },
    base,
    issues,
  );
  expect(result).toHaveLength(2);
  expect(result[0]).toMatchObject({
    kind: "rectangle",
    bounds: base.bounds,
    groups: ["table"],
  });
  expect(result[1]).toMatchObject({ kind: "text", text: "Merged" });
});
it("rejects incomplete table cells rather than inventing empty content", () => {
  const issues: Issue[] = [];
  expect(
    convertTable(
      { kind: "table", rowHeights: [50], columnWidths: [50], cells: [] },
      base,
      issues,
    ),
  ).toEqual([]);
  expect(issues[0].severity).toBe("unsupported");
});

const cell = (
  overrides: Partial<
    Extract<FreeformItemKind, { kind: "table" }>["cells"][number]
  > = {},
): Extract<FreeformItemKind, { kind: "table" }>["cells"][number] => ({
  row: 0,
  column: 0,
  style: { shadows: [] },
  anchoredItemIds: [],
  text: { plain: "A1", runs: [] },
  ...overrides,
});

it.each([
  {
    name: "overlapping spans",
    table: {
      kind: "table" as const,
      rowHeights: [50],
      columnWidths: [50, 50],
      cells: [cell({ columnSpan: 2 }), cell({ column: 1 })],
    },
    message: /Overlapping table cell spans/,
  },
  {
    name: "out-of-bounds cells",
    table: {
      kind: "table" as const,
      rowHeights: [50],
      columnWidths: [50],
      cells: [cell({ row: 1 })],
    },
    message: /Invalid table cell coordinates or spans/,
  },
  {
    name: "negative dimensions",
    table: {
      kind: "table" as const,
      rowHeights: [-50],
      columnWidths: [50],
      cells: [cell()],
    },
    message: /Missing or invalid table grid dimensions/,
  },
  {
    name: "non-finite dimensions",
    table: {
      kind: "table" as const,
      rowHeights: [50],
      columnWidths: [Number.POSITIVE_INFINITY],
      cells: [cell()],
    },
    message: /Missing or invalid table grid dimensions/,
  },
  {
    name: "anchored objects",
    table: {
      kind: "table" as const,
      rowHeights: [50],
      columnWidths: [50],
      cells: [cell({ anchoredItemIds: ["attached-object"] })],
    },
    message: /anchored objects/,
  },
])("rejects $name without partial output", ({ table, message }) => {
  const issues: Issue[] = [];
  expect(convertTable(table, base, issues)).toEqual([]);
  expect(issues).toEqual([
    expect.objectContaining({
      itemId: "table",
      severity: "unsupported",
      message: expect.stringMatching(message),
    }),
  ]);
});

it("rejects rotated tables without partial output", () => {
  const issues: Issue[] = [];
  expect(
    convertTable(
      {
        kind: "table",
        rowHeights: [50],
        columnWidths: [50],
        cells: [cell()],
      },
      {
        ...base,
        bounds: { ...base.bounds, rotation: Math.PI / 4 },
      },
      issues,
    ),
  ).toEqual([]);
  expect(issues).toEqual([
    expect.objectContaining({
      itemId: "table",
      severity: "unsupported",
      message: expect.stringMatching(/Rotated tables/),
    }),
  ]);
});
