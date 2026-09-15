import { strToU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { assembleNativeArchive } from "../packages/archive/assemble";
import { sha256, verifyArchive } from "../packages/archive/index";

const selectedId = "11111111-2222-4333-8444-555555555555";
const otherId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const json = (value: unknown) => strToU8(JSON.stringify(value));
const uuidBlob = (value: string) => ({
  type: "blob",
  value: Buffer.from(value.replaceAll("-", ""), "hex").toString("base64"),
});
const integer = (value: number) => ({ type: "integer", value: String(value) });
const real = (value: number) => ({ type: "real", value: String(value) });
const nil = { type: "null" };

function records(boardId = selectedId) {
  return json({
    format: "boardeject.native-board-records",
    version: 1,
    boardId,
    databaseUserVersion: 16,
    schemaFingerprint: "verified-v16",
    tables: [
      {
        name: "boards",
        columns: ["board_identifier", "last_activity_time"],
        rows: [[uuidBlob(selectedId), real(811_101_351)]],
      },
      {
        name: "board_items",
        columns: [
          "item_uuid",
          "parent_uuid",
          "item_type",
          "sub_item_type",
          "tombstoned",
        ],
        rows: [
          [
            uuidBlob("10000000-0000-4000-8000-000000000001"),
            nil,
            integer(3),
            integer(0),
            integer(0),
          ],
          [
            uuidBlob("10000000-0000-4000-8000-000000000002"),
            nil,
            integer(5),
            integer(0),
            integer(1),
          ],
        ],
      },
    ],
  });
}

function assets(boardId = selectedId, missing = false) {
  return json({
    format: "boardeject.preserved-assets",
    version: 1,
    boardId,
    assets: [
      {
        nativeId: "asset-1",
        extension: "png",
        roles: ["image"],
        objectIds: ["10000000-0000-4000-8000-000000000001"],
        file: missing ? undefined : "files/image.png",
        status: missing ? "missing" : "preserved",
      },
    ],
  });
}

const base = () => ({
  createdAt: "2026-09-14T18:00:00.000Z",
  displayTitle: "Untitled 11111111",
  titleStatus: "unverified" as const,
  nativeRecords: records(),
  assetManifest: assets(),
  assetFiles: { "files/image.png": strToU8("original image") },
});

describe("native archive assembly", () => {
  it("creates an independently verifiable selected-board archive", async () => {
    const result = await verifyArchive(await assembleNativeArchive(base()));
    expect(result).toMatchObject({
      valid: true,
      assetsVerified: 1,
      missing: 0,
      corrupted: 0,
      manifest: {
        board: {
          id: selectedId,
          title: "Untitled 11111111",
          titleStatus: "unverified",
          objectCount: 1,
          modifiedAt: "2026-09-14T17:55:51.000Z",
        },
        excalidrawExport: { available: false },
      },
    });
    expect(JSON.stringify(result.manifest)).not.toContain(otherId);
  });

  it("retains the verified file extension and original bytes", async () => {
    const bytes = strToU8("original image");
    const result = await verifyArchive(await assembleNativeArchive(base()));
    const asset = result.manifest!.assets[0];
    expect(asset.archivePath).toBe(`assets/${await sha256(bytes)}.png`);
    expect(asset.sha256).toBe(await sha256(bytes));
  });

  it("allows native preservation when editable conversion is unavailable", async () => {
    const result = await verifyArchive(
      await assembleNativeArchive({
        ...base(),
        assetManifest: assets(selectedId, true),
        assetFiles: {},
      }),
    );
    expect(result.valid).toBe(true);
    expect(result.missing).toBe(1);
    expect(result.manifest?.excalidrawExport.available).toBe(false);
  });

  it("includes an optional verified Excalidraw conversion", async () => {
    const result = await verifyArchive(
      await assembleNativeArchive({
        ...base(),
        excalidraw: { type: "excalidraw", version: 2, elements: [] },
      }),
    );
    expect(result.valid).toBe(true);
    expect(result.manifest?.excalidrawExport).toEqual({
      available: true,
      path: "exports/board.excalidraw",
    });
  });

  it("preserves an evidence-backed native board title status", async () => {
    const result = await verifyArchive(
      await assembleNativeArchive({
        ...base(),
        displayTitle: "Product planning",
        titleStatus: "verified",
      }),
    );
    expect(result.manifest?.board).toMatchObject({
      title: "Product planning",
      titleStatus: "verified",
    });
  });

  it("rejects cross-board manifests and identities", async () => {
    await expect(
      assembleNativeArchive({ ...base(), assetManifest: assets(otherId) }),
    ).rejects.toThrow("do not belong to the selected board");
    await expect(
      assembleNativeArchive({
        ...base(),
        nativeRecords: records(otherId),
        assetManifest: assets(otherId),
      }),
    ).rejects.toThrow("identity does not match");
  });

  it("rejects missing preserved bytes and malformed native input", async () => {
    await expect(
      assembleNativeArchive({ ...base(), assetFiles: {} }),
    ).rejects.toThrow("Preserved asset bytes are missing");
    await expect(
      assembleNativeArchive({ ...base(), nativeRecords: strToU8("not json") }),
    ).rejects.toThrow("Native board records are malformed");
  });
});
