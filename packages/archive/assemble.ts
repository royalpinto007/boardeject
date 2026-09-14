import { strFromU8 } from "fflate";
import {
  createArchive,
  type ArchiveAssetInput,
  type ArchiveInput,
} from "./index";

interface NativeValue {
  type: "null" | "integer" | "real" | "text" | "blob";
  value?: string;
}

interface NativeTable {
  name: string;
  columns: string[];
  rows: NativeValue[][];
}

interface NativeRecords {
  format: "boardeject.native-board-records";
  version: 1;
  boardId: string;
  databaseUserVersion: number;
  schemaFingerprint: string;
  tables: NativeTable[];
}

interface PreservedAsset {
  nativeId: string;
  extension?: string;
  roles: string[];
  objectIds: string[];
  bytes?: number;
  sha256?: string;
  file?: string;
  status: "preserved" | "duplicate" | "missing";
}

interface PreservedAssets {
  format: "boardeject.preserved-assets";
  version: 1;
  boardId: string;
  assets: PreservedAsset[];
}

export interface NativeArchiveAssembly {
  createdAt: string;
  displayTitle: string;
  titleStatus: "verified" | "unverified";
  nativeRecords: Uint8Array;
  assetManifest: Uint8Array;
  assetFiles: Record<string, Uint8Array>;
  excalidraw?: unknown;
}

function object(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(message);
  return value as Record<string, unknown>;
}

function decode<T>(bytes: Uint8Array, message: string): T {
  try {
    return object(JSON.parse(strFromU8(bytes)), message) as T;
  } catch (error) {
    if (error instanceof Error && error.message === message) throw error;
    throw new Error(message);
  }
}

function table(records: NativeRecords, name: string): NativeTable {
  const found = records.tables.find((candidate) => candidate.name === name);
  if (!found || !Array.isArray(found.columns) || !Array.isArray(found.rows))
    throw new Error(`Native record table is missing: ${name}`);
  return found;
}

function cell(tableValue: NativeTable, row: NativeValue[], column: string) {
  const index = tableValue.columns.indexOf(column);
  if (index < 0 || !row[index])
    throw new Error(
      `Native record column is missing: ${tableValue.name}.${column}`,
    );
  return row[index];
}

function number(value: NativeValue): number | undefined {
  if (value.type === "null") return undefined;
  if (value.type !== "integer" && value.type !== "real")
    throw new Error("Native numeric value has the wrong SQLite type.");
  const parsed = Number(value.value);
  if (!Number.isFinite(parsed))
    throw new Error("Native numeric value is invalid.");
  return parsed;
}

function uuid(value: NativeValue): string {
  if (value.type !== "blob" || !value.value)
    throw new Error("Native UUID has the wrong SQLite type.");
  const bytes = Uint8Array.from(atob(value.value), (character) =>
    character.charCodeAt(0),
  );
  if (bytes.length !== 16)
    throw new Error("Native UUID must contain 16 bytes.");
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

function appleTimestamp(value: NativeValue): string | undefined {
  const seconds = number(value);
  if (seconds === undefined) return undefined;
  const date = new Date((seconds + 978_307_200) * 1000);
  if (!Number.isFinite(date.valueOf()))
    throw new Error("Native modified timestamp is invalid.");
  return date.toISOString();
}

export async function assembleNativeArchive(
  input: NativeArchiveAssembly,
): Promise<Uint8Array> {
  const records = decode<NativeRecords>(
    input.nativeRecords,
    "Native board records are malformed.",
  );
  const assets = decode<PreservedAssets>(
    input.assetManifest,
    "Preserved asset manifest is malformed.",
  );
  if (
    records.format !== "boardeject.native-board-records" ||
    records.version !== 1 ||
    !Array.isArray(records.tables) ||
    !records.boardId ||
    !Number.isSafeInteger(records.databaseUserVersion) ||
    !records.schemaFingerprint
  )
    throw new Error("Native board records are unsupported.");
  if (
    assets.format !== "boardeject.preserved-assets" ||
    assets.version !== 1 ||
    !Array.isArray(assets.assets) ||
    assets.boardId !== records.boardId
  )
    throw new Error("Preserved assets do not belong to the selected board.");

  const boards = table(records, "boards");
  if (boards.rows.length !== 1)
    throw new Error("Native record set must contain exactly one board.");
  const boardId = uuid(cell(boards, boards.rows[0], "board_identifier"));
  if (boardId !== records.boardId)
    throw new Error(
      "Native board identity does not match the extraction envelope.",
    );
  const items = table(records, "board_items");
  const activeItems = items.rows.filter(
    (row) => number(cell(items, row, "tombstoned")) === 0,
  );
  const objects = activeItems.map((row) => ({
    id: uuid(cell(items, row, "item_uuid")),
    parentId:
      cell(items, row, "parent_uuid").type === "null"
        ? undefined
        : uuid(cell(items, row, "parent_uuid")),
    itemType: number(cell(items, row, "item_type")),
    subItemType: number(cell(items, row, "sub_item_type")),
  }));

  const archiveAssets: ArchiveAssetInput[] = assets.assets.map((asset) => {
    if (!asset.nativeId || !Array.isArray(asset.objectIds))
      throw new Error("Preserved asset record is malformed.");
    const bytes = asset.file ? input.assetFiles[asset.file] : undefined;
    if (asset.status !== "missing" && !bytes)
      throw new Error(`Preserved asset bytes are missing: ${asset.nativeId}`);
    return {
      nativeId: asset.nativeId,
      objectIds: [...asset.objectIds],
      extension: asset.extension,
      bytes,
    };
  });
  const archiveInput: ArchiveInput = {
    createdAt: input.createdAt,
    board: {
      id: boardId,
      title: input.displayTitle,
      titleStatus: input.titleStatus,
      modifiedAt: appleTimestamp(
        cell(boards, boards.rows[0], "last_activity_time"),
      ),
      objectCount: activeItems.length,
    },
    source: {
      kind: "freeform-snapshot",
      schemaStatus: "verified",
      databaseUserVersion: records.databaseUserVersion,
      schemaFingerprint: records.schemaFingerprint,
    },
    nativeFiles: { "native-records.json": input.nativeRecords },
    objects,
    assets: archiveAssets,
    excalidraw: input.excalidraw,
  };
  return createArchive(archiveInput);
}
