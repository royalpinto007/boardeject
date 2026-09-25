import { describe, expect, it } from "vitest";
import { strToU8, unzipSync, zipSync } from "fflate";
import {
  createArchive,
  sha256,
  type ArchiveInput,
} from "../packages/archive/index";
import {
  inspectArchive,
  extractAssets,
  safeDownloadName,
  previewType,
  EXPLORER_MAX_BYTES,
} from "../packages/archive/explorer";

const input = (): ArchiveInput => ({
  createdAt: "2026-09-25T12:00:00Z",
  board: { id: "one", title: "My board", objectCount: 1 },
  source: {
    kind: "freeform-snapshot",
    schemaStatus: "verified",
    databaseUserVersion: 16,
    schemaFingerprint: "test-only",
  },
  nativeFiles: { "native-records.json": strToU8("{}") },
  objects: [{ id: "object" }],
  assets: [
    {
      nativeId: "a",
      objectIds: ["object"],
      originalFilename: "notes.txt",
      bytes: strToU8("original"),
    },
    {
      nativeId: "b",
      objectIds: ["object"],
      originalFilename: "notes.txt",
      bytes: strToU8("different"),
    },
  ],
});

describe("archive explorer", () => {
  it("rejects oversized expanded entries before inflation", async () => {
    const zip = zipSync({ large: new Uint8Array(1) });
    const view = new DataView(zip.buffer);
    for (let i = 0; i < zip.length - 24; i++) {
      if (view.getUint32(i, true) === 0x02014b50)
        view.setUint32(i + 24, EXPLORER_MAX_BYTES + 1, true);
    }
    expect((await inspectArchive(zip)).verification.errors.join()).toContain(
      "Expanded archive exceeds",
    );
  });
  it("rejects duplicate ZIP entry names", async () => {
    const zip = zipSync(
      { aa: new Uint8Array(1), ab: new Uint8Array(1) },
      { level: 0 },
    );
    for (let i = 0; i < zip.length - 1; i++)
      if (zip[i] === 97 && zip[i + 1] === 98) zip[i + 1] = 97;
    expect((await inspectArchive(zip)).verification.errors.join()).toContain(
      "duplicate paths",
    );
  });
  it.each(["board", "native", "export", "asset", "filename"])(
    "rejects inconsistent %s metadata even when rehashed",
    async (field) => {
      const entries = unzipSync(await createArchive(input()));
      const manifest = JSON.parse(
        new TextDecoder().decode(entries["manifest.json"]),
      );
      if (field === "board") manifest.board.title = "Different";
      if (field === "native") {
        delete entries["native/board/native-records.json"];
        manifest.files = manifest.files.filter(
          (f: { path: string }) =>
            f.path !== "native/board/native-records.json",
        );
      }
      if (field === "export")
        manifest.excalidrawExport = { available: true, path: "absent" };
      if (field === "asset") manifest.assets[0].bytes = 9999;
      if (field === "filename")
        manifest.assets[0].originalFilename = { bad: true };
      entries["manifest.json"] = strToU8(JSON.stringify(manifest));
      entries["integrity.json"] = strToU8(
        JSON.stringify({
          manifestSha256: await sha256(entries["manifest.json"]),
        }),
      );
      expect((await inspectArchive(zipSync(entries))).verification.valid).toBe(
        false,
      );
    },
  );
  it("rejects checksummed but incomplete native containers", async () => {
    const manifest = strToU8(
      JSON.stringify({
        format: "boardeject.archive",
        version: 1,
        createdAt: "garbage",
        board: { title: "Fake", objectCount: 0 },
        source: { schemaStatus: "verified" },
        files: [],
        assets: [],
      }),
    );
    const result = await inspectArchive(
      zipSync({
        "manifest.json": manifest,
        "integrity.json": strToU8(
          JSON.stringify({ manifestSha256: await sha256(manifest) }),
        ),
      }),
    );
    expect(result.verification.valid).toBe(false);
  });
  it("bounds duplicate-reference extraction before allocating a ZIP", async () => {
    const result = await inspectArchive(await createArchive(input()));
    const bytes = new Uint8Array(1024 * 1024);
    result.assets = Array.from(
      { length: EXPLORER_MAX_BYTES / bytes.length + 1 },
      (_, i) => ({
        name: `${i}.bin`,
        nativeId: `${i}`,
        status: "duplicate",
        bytes,
      }),
    );
    expect(() => extractAssets(result)).toThrow("exceed 256 MiB");
  });
  it("keeps long collision names unique even after download sanitization", async () => {
    const data = input();
    data.assets.forEach((a) => (a.originalFilename = "a".repeat(150)));
    const result = await inspectArchive(await createArchive(data));
    expect(
      new Set(result.assets.map((a) => safeDownloadName(a.name))).size,
    ).toBe(2);
  });
  it("rejects unsafe ZIP paths", async () => {
    const entries = unzipSync(await createArchive(input()));
    entries["../outside"] = strToU8("bad");
    expect((await inspectArchive(zipSync(entries))).verification.valid).toBe(
      false,
    );
  });
  it("verifies and extracts exact original bytes with collision-safe names", async () => {
    const result = await inspectArchive(await createArchive(input()));
    expect(result.verification.valid).toBe(true);
    expect(result.assets.map((a) => a.name)).toEqual([
      "notes.txt",
      "notes (2).txt",
    ]);
    const extracted = unzipSync(extractAssets(result));
    expect(extracted["notes.txt"]).toEqual(strToU8("original"));
    expect(extracted["notes (2).txt"]).toEqual(strToU8("different"));
    expect(result.preview).toBeUndefined();
    expect(result.exportBytes).toBeUndefined();
  });
  it("blocks all previews and extraction for corrupted archives", async () => {
    const entries = unzipSync(await createArchive(input()));
    const asset = Object.keys(entries).find((p) => p.startsWith("assets/"))!;
    entries[asset] = strToU8("tampered");
    const result = await inspectArchive(zipSync(entries));
    expect(result.verification.valid).toBe(false);
    expect(result.assets).toEqual([]);
    expect(() => extractAssets(result)).toThrow();
  });
  it("shows declared missing assets while retaining verified originals", async () => {
    const data = input();
    data.assets.push({
      nativeId: "missing",
      objectIds: ["object"],
      originalFilename: "gone.pdf",
    });
    const result = await inspectArchive(await createArchive(data));
    expect(result.verification.missing).toBe(1);
    expect(result.assets[2].bytes).toBeUndefined();
    expect(Object.keys(unzipSync(extractAssets(result)))).toHaveLength(2);
  });
  it("does not trust extensions or MIME claims for active previews", () => {
    expect(
      previewType(strToU8('<svg onload="alert(1)"></svg>')),
    ).toBeUndefined();
    expect(previewType(strToU8("<html>hello"))).toBeUndefined();
    expect(previewType(strToU8("%PDF-1.7\n"))).toBe("application/pdf");
  });
  it("sanitizes filenames and handles malformed input cleanly", async () => {
    expect(safeDownloadName("../../a\\bad\u0000.txt")).not.toMatch(
      // oxlint-disable-next-line no-control-regex
      /[\\/\u0000]/,
    );
    const result = await inspectArchive(strToU8("not a zip"));
    expect(result.verification.valid).toBe(false);
    expect(result.verification.errors.length).toBeGreaterThan(0);
  });
  it("supports independently opening an included export without inventing one", async () => {
    const data = input();
    data.excalidraw = {
      type: "excalidraw",
      version: 2,
      elements: [],
      appState: {},
      files: {},
    };
    expect(
      (await inspectArchive(await createArchive(data))).exportBytes,
    ).toBeDefined();
  });
});
