import type { FreeformItemKind } from "libfreeform";
import type { BaseNode, BoardNode, Issue } from "../board-model/index";

/** Editable cell approximation. Validate the whole grid before emitting anything. */
export function convertTable(
  table: Extract<FreeformItemKind, { kind: "table" }>,
  base: BaseNode,
  issues: Issue[],
): BoardNode[] {
  const fail = (message: string): BoardNode[] => {
    issues.push({ itemId: base.id, severity: "unsupported", message });
    return [];
  };
  const rows = table.rowHeights,
    cols = table.columnWidths;
  if (
    !rows.length ||
    !cols.length ||
    rows.length * cols.length > 10000 ||
    [...rows, ...cols].some((n) => !Number.isFinite(n) || n <= 0)
  )
    return fail("Missing or invalid table grid dimensions.");
  if (base.bounds.rotation !== 0)
    return fail("Rotated tables need validated cell geometry.");
  const totalWidth = cols.reduce((a, b) => a + b, 0),
    totalHeight = rows.reduce((a, b) => a + b, 0);
  const occupied = new Set<string>();
  const result: BoardNode[] = [];
  for (const [index, cell] of table.cells.entries()) {
    const r = cell.row,
      c = cell.column,
      rs = cell.rowSpan ?? 1,
      cs = cell.columnSpan ?? 1;
    if (
      r === undefined ||
      c === undefined ||
      ![r, c, rs, cs].every(Number.isInteger) ||
      r < 0 ||
      c < 0 ||
      rs < 1 ||
      cs < 1 ||
      r + rs > rows.length ||
      c + cs > cols.length
    )
      return fail("Invalid table cell coordinates or spans.");
    if (cell.anchoredItemIds.length)
      return fail(
        "Table contains anchored objects that cannot yet be placed safely.",
      );
    for (let y = r; y < r + rs; y++)
      for (let x = c; x < c + cs; x++) {
        const key = `${y}:${x}`;
        if (occupied.has(key)) return fail("Overlapping table cell spans.");
        occupied.add(key);
      }
    const bounds = {
      x:
        base.bounds.x +
        (cols.slice(0, c).reduce((a, b) => a + b, 0) / totalWidth) *
          base.bounds.width,
      y:
        base.bounds.y +
        (rows.slice(0, r).reduce((a, b) => a + b, 0) / totalHeight) *
          base.bounds.height,
      width:
        (cols.slice(c, c + cs).reduce((a, b) => a + b, 0) / totalWidth) *
        base.bounds.width,
      height:
        (rows.slice(r, r + rs).reduce((a, b) => a + b, 0) / totalHeight) *
        base.bounds.height,
      rotation: 0,
    };
    const groups = [base.id, ...base.groups];
    result.push({
      ...base,
      id: `${base.id}-cell-${index}`,
      kind: "rectangle",
      bounds,
      groups,
    });
    if (cell.text?.plain)
      result.push({
        ...base,
        id: `${base.id}-text-${index}`,
        kind: "text",
        bounds: {
          ...bounds,
          x: bounds.x + 4,
          y: bounds.y + 4,
          width: Math.max(1, bounds.width - 8),
          height: Math.max(1, bounds.height - 8),
        },
        groups,
        text: cell.text.plain,
        fontSize: Math.max(8, Math.min(100, cell.text.runs[0]?.fontSize ?? 16)),
      });
  }
  if (occupied.size !== rows.length * cols.length)
    return fail("Table cell data is incomplete.");
  issues.push({
    itemId: base.id,
    severity: "approximation",
    message:
      "Table becomes grouped editable cells and text. Cell-specific styling, formulas and rich text are not preserved.",
  });
  return result;
}
