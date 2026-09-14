import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  createArchive,
  isSafeArchivePath,
  sha256,
  verifyArchive,
  type ArchiveInput,
} from "../packages/archive/index";

const text = (value: string) => strToU8(value);
const base = (change: Partial<ArchiveInput> = {}): ArchiveInput => ({
  createdAt: "2026-09-14T12:00:00.000Z",
  board: {
    id: "board-1",
    title: "Product planning",
    createdAt: "2026-09-01T10:00:00.000Z",
    modifiedAt: "2026-09-14T11:00:00.000Z",
    objectCount: 2,
  },
  source: {
    kind: "freeform-snapshot",
    databaseUserVersion: 16,
    schemaFingerprint: "fixture-schema-v16",
  },
  nativeFiles: {
    "Freeform.sqlite": text("database"),
    "Freeform.sqlite-wal": text("wal"),
    "Freeform.sqlite-shm": text("shm"),
  },
  objects: [
    { id: "object-1", type: "image" },
    { id: "object-2", type: "file" },
  ],
  assets: [],
  ...change,
});

function rewrite(
  bytes: Uint8Array,
  edit: (entries: Record<string, Uint8Array>) => void,
) {
  const entries = Object.fromEntries(
    Object.entries(unzipSync(bytes)).map(([path, content]) => [
      path,
      content.slice(),
    ]),
  );
  edit(entries);
  return zipSync(entries);
}

describe("BoardEject archive format", () => {
  it("uses canonical JSON and real SHA-256", async () => {
    expect(canonicalJson({ z: 1, a: { d: 2, b: 1 } })).toBe(
      '{"a":{"b":1,"d":2},"z":1}',
    );
    expect(await sha256(text("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it.each([
    "../secret",
    "/absolute",
    "C:/drive",
    "a\\b",
    "a//b",
    "a/./b",
    "a/../b",
    "",
  ])("rejects unsafe archive path %j", (path) =>
    expect(isSafeArchivePath(path)).toBe(false),
  );

  it("creates deterministic independently verifiable archives", async () => {
    const first = await createArchive(base());
    const second = await createArchive(base());
    expect(first).toEqual(second);
    const result = await verifyArchive(first);
    expect(result).toMatchObject({
      valid: true,
      assetsVerified: 0,
      missing: 0,
      corrupted: 0,
    });
    expect(result.filesChecked).toBe(5);
  });

  it("preserves image and PDF bytes, deduplicates by hash, and reports missing assets", async () => {
    const image = text("original image bytes");
    const pdf = text("%PDF original bytes");
    const bytes = await createArchive(
      base({
        assets: [
          {
            nativeId: "asset-image",
            objectIds: ["object-1"],
            bytes: image,
            originalFilename: "photo.PNG",
            mimeType: "image/png",
          },
          {
            nativeId: "asset-copy",
            objectIds: ["object-1"],
            bytes: image,
            originalFilename: "copy.png",
            mimeType: "image/png",
          },
          {
            nativeId: "asset-pdf",
            objectIds: ["object-2"],
            bytes: pdf,
            originalFilename: "brief.pdf",
            mimeType: "application/pdf",
          },
          {
            nativeId: "asset-missing",
            objectIds: ["object-2"],
            originalFilename: "gone.mov",
            mimeType: "video/quicktime",
          },
        ],
      }),
    );
    const entries = unzipSync(bytes);
    const result = await verifyArchive(bytes);
    expect(result).toMatchObject({
      valid: true,
      assetsVerified: 3,
      missing: 1,
      corrupted: 0,
    });
    expect(
      Object.keys(entries).filter((path) => path.startsWith("assets/")),
    ).toHaveLength(2);
    const records = result.manifest!.assets;
    expect(
      records.filter((asset) => asset.status === "duplicate"),
    ).toHaveLength(1);
    expect(
      entries[
        records.find((asset) => asset.nativeId === "asset-image")!.archivePath!
      ],
    ).toEqual(image);
    expect(
      entries[
        records.find((asset) => asset.nativeId === "asset-pdf")!.archivePath!
      ],
    ).toEqual(pdf);
  });

  it("includes an optional Excalidraw export without making it canonical", async () => {
    const without = await verifyArchive(await createArchive(base()));
    expect(without.manifest?.excalidrawExport).toEqual({ available: false });
    const withExport = await verifyArchive(
      await createArchive(
        base({ excalidraw: { type: "excalidraw", version: 2, elements: [] } }),
      ),
    );
    expect(withExport.manifest?.excalidrawExport).toEqual({
      available: true,
      path: "exports/board.excalidraw",
    });
  });

  it("fails closed for missing schema identity and unsafe native filenames", async () => {
    await expect(
      createArchive(
        base({
          source: {
            kind: "freeform-snapshot",
            databaseUserVersion: 16,
            schemaFingerprint: "",
          },
        }),
      ),
    ).rejects.toThrow("verified schema fingerprint");
    await expect(
      createArchive(base({ nativeFiles: { "../live.sqlite": text("no") } })),
    ).rejects.toThrow("Unsafe archive path");
  });

  it("detects truncation, changed files, changed assets, and manifest tampering", async () => {
    const original = await createArchive(
      base({
        assets: [
          {
            nativeId: "asset-image",
            objectIds: ["object-1"],
            bytes: text("image"),
            originalFilename: "a.png",
          },
        ],
      }),
    );
    expect((await verifyArchive(original.slice(0, 20))).valid).toBe(false);
    const changedFile = rewrite(original, (entries) => {
      entries["metadata/board.json"] = text("changed");
    });
    expect((await verifyArchive(changedFile)).errors).toContain(
      "File integrity mismatch: metadata/board.json",
    );
    const assetPath = Object.keys(unzipSync(original)).find((path) =>
      path.startsWith("assets/"),
    )!;
    const changedAsset = rewrite(original, (entries) => {
      entries[assetPath] = text("changed asset");
    });
    expect(
      (await verifyArchive(changedAsset)).errors.some((error) =>
        error.includes("Asset SHA-256 mismatch"),
      ),
    ).toBe(true);
    const changedManifest = rewrite(original, (entries) => {
      const manifest = JSON.parse(strFromU8(entries["manifest.json"]));
      manifest.board.title = "Tampered";
      entries["manifest.json"] = text(JSON.stringify(manifest));
    });
    expect((await verifyArchive(changedManifest)).errors).toContain(
      "Manifest SHA-256 mismatch.",
    );
  });

  it("handles a large original asset without changing its bytes", async () => {
    const large = new Uint8Array(1024 * 1024);
    for (let offset = 0; offset < large.length; offset += 65536)
      crypto.getRandomValues(
        large.subarray(offset, Math.min(offset + 65536, large.length)),
      );
    const archive = await createArchive(
      base({
        assets: [
          {
            nativeId: "large",
            objectIds: ["object-1"],
            bytes: large,
            originalFilename: "video.mov",
          },
        ],
      }),
    );
    const result = await verifyArchive(archive);
    expect(result).toMatchObject({
      valid: true,
      assetsVerified: 1,
      corrupted: 0,
    });
    const archived =
      unzipSync(archive)[result.manifest!.assets[0].archivePath!];
    expect(archived).toEqual(large);
  });
});
