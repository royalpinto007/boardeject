import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { inspectCaptureFile } from "../packages/freeform-parser/test-capture";
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
