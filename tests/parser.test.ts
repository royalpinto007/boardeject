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

const legacyCapture = (
  name: string,
  extraFlavors: Array<{ uti: string; base64: string }> = [],
) =>
  JSON.stringify({
    format: "boardeject.clipboard",
    version: 1,
    flavors: [
      {
        uti: "com.apple.freeform.CRLNativeData",
        base64: readFileSync(
          `tests/fixtures/freeform-2.4/${name}.crlnative`,
        ).toString("base64"),
      },
      {
        uti: "com.apple.freeform.CRLDescription",
        base64: readFileSync(
          `tests/fixtures/freeform-2.4/${name}.crldescription`,
        ).toString("base64"),
      },
      ...extraFlavors,
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
  it("recognizes the genuine Freeform 2.4 legacy description flavor", () => {
    const result = parseCapture(legacyCapture("labelled-connector"));
    expect(result.native.status).toBe("decoded");
    if (result.native.status !== "decoded") throw new Error("Decode failed");
    expect(result.native.value.compatibility).toEqual({
      kind: "unsupported",
      minimumVersion: 7,
    });
    expect(
      result.native.value.items.map(({ className, geometry, kind }) => ({
        className,
        frame: geometry.frame,
        kind: kind.kind,
      })),
    ).toMatchObject([
      { className: "CRLWPShapeItem", kind: "shape", frame: { x: 197 } },
      { className: "CRLWPShapeItem", kind: "shape", frame: { x: 397 } },
      { className: "CRLConnectionLineItem", kind: "connector" },
    ]);
  });
  it("keeps unsupported Freeform 2.4 text and image captures fail-closed", () => {
    const text = parseCapture(
      legacyCapture("text", [
        {
          uti: "public.utf8-plain-text",
          base64: readFileSync("tests/fixtures/freeform-2.4/text.txt").toString(
            "base64",
          ),
        },
      ]),
    );
    const image = parseCapture(legacyCapture("image"));
    for (const result of [text, image]) {
      expect(result.native.status).toBe("decoded");
      if (result.native.status !== "decoded") continue;
      expect(result.native.value.compatibility.kind).toBe("unsupported");
    }
    if (text.native.status !== "decoded") throw new Error("Decode failed");
    expect(text.native.value.items[0]?.kind.kind).toBe("shape");
    if (image.native.status !== "decoded") throw new Error("Decode failed");
    expect(image.native.value.items[0]).toMatchObject({
      className: "CRLImageItem",
      kind: { kind: "image" },
      geometry: { frame: { x: 340, y: 282.5, w: 64, h: 48 } },
    });
  });
});
