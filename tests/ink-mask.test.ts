import { expect, it } from "vitest";
import { hasUnresolvedInkMask } from "../packages/freeform-parser/ink-mask";

it("inspects top-level tags, not mask-like bytes inside other fields", () => {
  expect(hasUnresolvedInkMask(new Uint8Array([10, 2, 90, 0]))).toBe(false);
  expect(hasUnresolvedInkMask(new Uint8Array([90, 0]))).toBe(true);
  expect(hasUnresolvedInkMask(new Uint8Array())).toBe(false);
});

it("fails closed on malformed native records without throwing", () => {
  for (const bytes of [[10, 8, 0], [128], [0], [15], [9, 1], [13, 1]]) {
    expect(hasUnresolvedInkMask(new Uint8Array(bytes))).toBe(true);
  }
});
