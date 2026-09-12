import { expect, it } from "vitest";
import type { FreeformBoardItem, FreeformItemKind } from "libfreeform";
import { groupMembership } from "../packages/freeform-parser/groups";
const item = (
  uuid: string,
  kind: FreeformItemKind,
  parentId?: string,
): FreeformBoardItem => ({
  uuid,
  kind,
  parentId,
  index: 0,
  hints: {},
  geometry: {},
  style: { shadows: [] },
  rawData: new Uint8Array(),
  recordRanges: [],
});
it("retains nested group ancestry in deepest-first order", () => {
  const result = groupMembership([
    item("outer", { kind: "group", childIds: ["inner"] }),
    item("inner", { kind: "group", childIds: ["shape"] }, "outer"),
    item("shape", { kind: "shape", preset: "Rectangle" }, "inner"),
  ]);
  expect(result.get("shape")).toEqual(["inner", "outer"]);
});
it("rejects cycles, missing children and conflicting parent records", () => {
  expect(() =>
    groupMembership([item("a", { kind: "group", childIds: ["a"] })]),
  ).toThrow(/Cycle/);
  expect(() =>
    groupMembership([item("a", { kind: "group", childIds: ["missing"] })]),
  ).toThrow(/missing/);
  expect(() =>
    groupMembership([item("a", { kind: "shape" }, "missing")]),
  ).toThrow(/disagrees/);
});
it("does not invent counter-transform semantics", () => {
  expect(() =>
    groupMembership([
      item("a", {
        kind: "group",
        childIds: [],
        counterTransform: { a: 1, b: 0, c: 0, d: 1, tx: 50, ty: 0 },
      }),
    ]),
  ).toThrow(/unvalidated/);
});
