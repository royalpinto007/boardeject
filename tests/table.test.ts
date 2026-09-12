import { expect, it } from "vitest";
import { convertTable } from "../packages/freeform-parser/table";
import type { BaseNode, Issue } from "../packages/board-model/index";
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
