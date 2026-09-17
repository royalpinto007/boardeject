import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { inspectCaptureFile } from "../packages/freeform-parser/test-capture";
import { convert } from "../packages/excalidraw-converter/index";
const fixture = (name: string) =>
  readFileSync(`tests/fixtures/upstream/${name}`);
it("inspects an existing genuine raw capture without bypassing compatibility", () => {
  const board = inspectCaptureFile(
    "real-board.crlnative",
    fixture("real-board.crlnative"),
  );
  expect(board.sourceItems).toBe(10);
  expect(board.nodes).toHaveLength(0);
  expect(board.issues.some((i) => i.message.includes("compatibility"))).toBe(
    true,
  );
});
it("accepts the same native bytes in a helper envelope", () => {
  const bytes = fixture("real-board.crlnative");
  const source = JSON.stringify({
    format: "boardeject.clipboard",
    version: 1,
    flavors: [
      {
        uti: "com.apple.freeform.CRLNativeData",
        base64: bytes.toString("base64"),
      },
    ],
  });
  const board = inspectCaptureFile(
    "capture.boardeject",
    new TextEncoder().encode(source),
  );
  expect(board.sourceItems).toBe(10);
  expect(board.nodes).toHaveLength(0);
});
it("converts the existing decoder ink fixture without claiming Freeform pressure fidelity", () => {
  const board = inspectCaptureFile(
    "ink-pen.drawing",
    fixture("ink-pen.drawing"),
  );
  expect(board.nodes.length).toBeGreaterThan(0);
  expect(board.nodes.every((n) => n.kind === "ink")).toBe(true);
});
it("converts the genuine labelled connector through the public capture path", () => {
  const flavors = [
    ["com.apple.freeform.CRLNativeData", "labelled-connector.crlnative"],
    ["com.apple.freeform.TSUDescription", "labelled-connector.tsudescription"],
    [
      "com.apple.apps.content-language.canvas-object-1.0",
      "labelled-connector.content.json",
    ],
  ].map(([uti, name]) => ({
    uti,
    base64: readFileSync(`tests/fixtures/freeform-4.5/${name}`).toString(
      "base64",
    ),
  }));
  const board = inspectCaptureFile(
    "labelled-connector.boardeject",
    new TextEncoder().encode(
      JSON.stringify({ format: "boardeject.clipboard", version: 1, flavors }),
    ),
  );
  expect(board.nodes.filter((node) => node.kind === "text")).toMatchObject([
    { text: "Source" },
    { text: "Target" },
  ]);
  const output = convert(board),
    arrow = output.elements.find((element) => element.type === "arrow");
  expect(arrow).toMatchObject({
    startBinding: { elementId: "468A9321-460B-41EA-93F3-305C06E26F2A" },
    endBinding: { elementId: "7FFE2E1E-4223-4DE4-9F2C-8D3FC6DC7172" },
  });
});
it("recognizes genuine Freeform 2.4 captures but withholds incomplete output", () => {
  const flavors = [
    ["com.apple.freeform.CRLNativeData", "labelled-connector.crlnative"],
    ["com.apple.freeform.CRLDescription", "labelled-connector.crldescription"],
  ].map(([uti, name]) => ({
    uti,
    base64: readFileSync(`tests/fixtures/freeform-2.4/${name}`).toString(
      "base64",
    ),
  }));
  const board = inspectCaptureFile(
    "freeform-2.4.boardeject",
    new TextEncoder().encode(
      JSON.stringify({ format: "boardeject.clipboard", version: 1, flavors }),
    ),
  );
  expect(board.sourceItems).toBe(3);
  expect(board.nodes).toEqual([]);
  expect(board.issues).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        severity: "unsupported",
        message: expect.stringMatching(/compatibility is not supported/),
      }),
    ]),
  );
});
it.each([
  ["file.pdf", "pdf", /Choose/],
  ["capture.boardeject", "", /empty/],
  ["capture.json", "broken", /Invalid JSON/],
  ["capture.json", "{}", /macOS helper/],
] as const)(
  "rejects malformed or unsupported %s input",
  (name, text, message) => {
    expect(() =>
      inspectCaptureFile(name, new TextEncoder().encode(text)),
    ).toThrow(message);
  },
);
it("rejects oversized raw files before decoding", () => {
  expect(() =>
    inspectCaptureFile(
      "capture.crlnative",
      new Uint8Array(32 * 1024 * 1024 + 1),
    ),
  ).toThrow(/size limit/);
});
