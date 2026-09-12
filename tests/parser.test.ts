import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseCapture, readEnvelope } from "../packages/freeform-parser/index";

const capture = (name: string) =>
  JSON.stringify({
    format: "boardeject.clipboard",
    version: 1,
    flavors: [
      {
        uti: "com.apple.freeform.CRLNativeData",
        base64: readFileSync(
          `tests/fixtures/upstream/${name}.crlnative`,
        ).toString("base64"),
      },
      {
        uti: "com.apple.freeform.TSUDescription",
        base64: readFileSync(
          `tests/fixtures/upstream/${name}.tsudescription`,
        ).toString("base64"),
      },
    ],
  });

describe("clipboard boundary", () => {
  it.each([
    "null",
    "{}",
    "[]",
    "plain text",
    '{"format":"boardeject.clipboard","version":2,"flavors":[]}',
  ])("rejects invalid envelope %s", (source) =>
    expect(() => readEnvelope(source)).toThrow(),
  );
  it("rejects duplicate flavors", () =>
    expect(() =>
      readEnvelope(
        JSON.stringify({
          format: "boardeject.clipboard",
          version: 1,
          flavors: [
            { uti: "public.text", base64: "YQ==" },
            { uti: "public.text", base64: "YQ==" },
          ],
        }),
      ),
    ).toThrow(/duplicate/));
  it("decodes the upstream mixed fixture without inventing geometry", () => {
    const result = parseCapture(capture("native-mixed"));
    expect(result.native.status).toBe("decoded");
    if (result.native.status !== "decoded") throw new Error("Decode failed");
    expect(result.native.value.items).toHaveLength(3);
    expect(
      result.native.value.items.every((item) => !item.geometry.frame),
    ).toBe(true);
  });
  it("retains the unsupported version on the real capture", () => {
    const result = parseCapture(capture("real-board"));
    expect(result.native.status).toBe("decoded");
    if (result.native.status !== "decoded") throw new Error("Decode failed");
    expect(result.native.value.compatibility).toEqual({
      kind: "unsupported",
      minimumVersion: 7,
    });
    expect(result.native.value.items).toHaveLength(10);
  });
});
