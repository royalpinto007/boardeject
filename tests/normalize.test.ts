import { expect, it } from "vitest";
import { decodePasteboard } from "libfreeform";
import { normalize } from "../packages/freeform-parser/normalize";

it("never turns absent native data into a successful empty conversion", () => {
  const result = normalize(decodePasteboard({ flavors: [] }));
  expect(result.nodes).toEqual([]);
  expect(result.issues[0].severity).toBe("unsupported");
});
