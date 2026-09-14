import { strFromU8, unzipSync, zipSync } from "fflate";

export const ARCHIVE_FORMAT = "boardeject.archive" as const;
export const ARCHIVE_VERSION = 1 as const;

export interface ArchiveBoardMetadata {
  id: string;
  title: string;
  titleStatus?: "verified" | "unverified";
  createdAt?: string;
  modifiedAt?: string;
  objectCount: number;
}

export interface ArchiveSource {
  kind: "freeform-snapshot";
  schemaStatus: "verified";
  databaseUserVersion: number;
  schemaFingerprint: string;
}

export interface ArchiveAssetInput {
  nativeId: string;
  objectIds: string[];
  bytes?: Uint8Array;
  originalFilename?: string;
  extension?: string;
  mimeType?: string;
}

export interface ArchiveInput {
  createdAt: string;
  board: ArchiveBoardMetadata;
  source: ArchiveSource;
  nativeFiles: Record<string, Uint8Array>;
  objects: unknown[];
  assets: ArchiveAssetInput[];
  preview?: Uint8Array;
  excalidraw?: unknown;
}

export interface ArchiveFileRecord {
  path: string;
  sha256: string;
  bytes: number;
  role: "native" | "asset" | "metadata" | "preview" | "export";
}

export interface ArchiveAssetRecord {
  nativeId: string;
  objectIds: string[];
  originalFilename?: string;
  mimeType?: string;
  bytes?: number;
  sha256?: string;
  archivePath?: string;
  duplicateOf?: string;
  status: "preserved" | "duplicate" | "missing";
}

export interface ArchiveManifest {
  format: typeof ARCHIVE_FORMAT;
  version: typeof ARCHIVE_VERSION;
  createdAt: string;
  board: ArchiveBoardMetadata;
  source: ArchiveSource;
  files: ArchiveFileRecord[];
  assets: ArchiveAssetRecord[];
  warnings: string[];
  excalidrawExport: { available: boolean; path?: string };
}

export interface ArchiveVerification {
  valid: boolean;
  filesChecked: number;
  assetsVerified: number;
  missing: number;
  corrupted: number;
  errors: string[];
  warnings: string[];
  manifest?: ArchiveManifest;
}

const encoder = new TextEncoder();
const ZIP_TIME = new Date("1980-01-01T00:00:00.000Z");

export function isSafeArchivePath(path: string): boolean {
  if (!path || path.includes("\0") || path.includes("\\")) return false;
  if (path.startsWith("/") || /^[A-Za-z]:/.test(path)) return false;
  return path
    .split("/")
    .every((part) => part !== "" && part !== "." && part !== "..");
}

function assertSafePath(path: string): void {
  if (!isSafeArchivePath(path)) throw new Error(`Unsafe archive path: ${path}`);
}

export function canonicalJson(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

export async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function safeExtension(filename?: string, extension?: string): string {
  const match = filename?.toLowerCase().match(/\.([a-z0-9]{1,12})$/);
  if (match) return `.${match[1]}`;
  return extension && /^[a-z0-9]{1,12}$/i.test(extension)
    ? `.${extension.toLowerCase()}`
    : ".bin";
}

function validTimestamp(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

export async function createArchive(input: ArchiveInput): Promise<Uint8Array> {
  if (!validTimestamp(input.createdAt))
    throw new Error("Archive timestamp is invalid.");
  if (!input.board.id || !input.board.title)
    throw new Error("Board identity is required.");
  if (
    !Number.isSafeInteger(input.source.databaseUserVersion) ||
    input.source.databaseUserVersion < 0
  )
    throw new Error(
      "Unsupported Freeform database version. No files were modified.",
    );
  if (!input.source.schemaFingerprint)
    throw new Error("A verified schema fingerprint is required.");
  if (input.source.schemaStatus !== "verified")
    throw new Error(
      "Unsupported Freeform database version. No files were modified.",
    );
  if (!Object.hasOwn(input.nativeFiles, "native-records.json"))
    throw new Error("A board-scoped native record set is required.");

  const entries = new Map<
    string,
    { bytes: Uint8Array; role: ArchiveFileRecord["role"] }
  >();
  const add = (
    path: string,
    bytes: Uint8Array,
    role: ArchiveFileRecord["role"],
  ) => {
    assertSafePath(path);
    if (entries.has(path)) throw new Error(`Duplicate archive path: ${path}`);
    entries.set(path, { bytes, role });
  };

  for (const [name, bytes] of Object.entries(input.nativeFiles).sort(
    ([a], [b]) => a.localeCompare(b),
  )) {
    assertSafePath(name);
    if (name.includes("/"))
      throw new Error(`Native snapshot filename must be a basename: ${name}`);
    add(`native/board/${name}`, bytes, "native");
  }
  add(
    "metadata/board.json",
    encoder.encode(canonicalJson(input.board)),
    "metadata",
  );
  add(
    "metadata/objects.json",
    encoder.encode(canonicalJson(input.objects)),
    "metadata",
  );

  const assetRecords: ArchiveAssetRecord[] = [];
  const canonicalByHash = new Map<string, ArchiveAssetRecord>();
  for (const asset of [...input.assets].sort((a, b) =>
    a.nativeId.localeCompare(b.nativeId),
  )) {
    if (!asset.nativeId) throw new Error("Asset native ID is required.");
    if (!asset.bytes) {
      assetRecords.push({
        nativeId: asset.nativeId,
        objectIds: [...asset.objectIds].sort(),
        originalFilename: asset.originalFilename,
        mimeType: asset.mimeType,
        status: "missing",
      });
      continue;
    }
    const digest = await sha256(asset.bytes);
    const canonical = canonicalByHash.get(digest);
    if (canonical) {
      assetRecords.push({
        nativeId: asset.nativeId,
        objectIds: [...asset.objectIds].sort(),
        originalFilename: asset.originalFilename,
        mimeType: asset.mimeType,
        bytes: asset.bytes.byteLength,
        sha256: digest,
        archivePath: canonical.archivePath,
        duplicateOf: canonical.nativeId,
        status: "duplicate",
      });
      continue;
    }
    const path = `assets/${digest}${safeExtension(asset.originalFilename, asset.extension)}`;
    const record: ArchiveAssetRecord = {
      nativeId: asset.nativeId,
      objectIds: [...asset.objectIds].sort(),
      originalFilename: asset.originalFilename,
      mimeType: asset.mimeType,
      bytes: asset.bytes.byteLength,
      sha256: digest,
      archivePath: path,
      status: "preserved",
    };
    add(path, asset.bytes, "asset");
    canonicalByHash.set(digest, record);
    assetRecords.push(record);
  }
  if (input.preview) add("previews/preview.png", input.preview, "preview");
  if (input.excalidraw)
    add(
      "exports/board.excalidraw",
      encoder.encode(canonicalJson(input.excalidraw)),
      "export",
    );

  const files: ArchiveFileRecord[] = [];
  for (const [path, entry] of [...entries].sort(([a], [b]) =>
    a.localeCompare(b),
  ))
    files.push({
      path,
      role: entry.role,
      bytes: entry.bytes.byteLength,
      sha256: await sha256(entry.bytes),
    });
  const missing = assetRecords.filter(
    (asset) => asset.status === "missing",
  ).length;
  const manifest: ArchiveManifest = {
    format: ARCHIVE_FORMAT,
    version: ARCHIVE_VERSION,
    createdAt: input.createdAt,
    board: input.board,
    source: input.source,
    files,
    assets: assetRecords,
    warnings: missing
      ? [
          `${missing} referenced asset${missing === 1 ? " is" : "s are"} missing.`,
        ]
      : [],
    excalidrawExport: input.excalidraw
      ? { available: true, path: "exports/board.excalidraw" }
      : { available: false },
  };
  const manifestBytes = encoder.encode(canonicalJson(manifest));
  entries.set("manifest.json", { bytes: manifestBytes, role: "metadata" });
  entries.set("integrity.json", {
    bytes: encoder.encode(
      canonicalJson({ manifestSha256: await sha256(manifestBytes) }),
    ),
    role: "metadata",
  });
  const zipped: Record<string, [Uint8Array, { mtime: Date; level: 0 }]> = {};
  for (const [path, entry] of [...entries].sort(([a], [b]) =>
    a.localeCompare(b),
  ))
    zipped[path] = [entry.bytes, { mtime: ZIP_TIME, level: 0 }];
  return zipSync(zipped);
}

function parseJson<T>(
  bytes: Uint8Array,
  label: string,
  errors: string[],
): T | undefined {
  try {
    return JSON.parse(strFromU8(bytes)) as T;
  } catch {
    errors.push(`${label} is malformed.`);
  }
}

export async function verifyArchive(
  bytes: Uint8Array,
): Promise<ArchiveVerification> {
  const errors: string[] = [];
  const warnings: string[] = [];
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch {
    return {
      valid: false,
      filesChecked: 0,
      assetsVerified: 0,
      missing: 0,
      corrupted: 1,
      errors: ["Archive is corrupt or truncated."],
      warnings,
    };
  }
  for (const path of Object.keys(entries))
    if (!isSafeArchivePath(path)) errors.push(`Unsafe archive path: ${path}`);
  const manifestBytes = entries["manifest.json"];
  const integrityBytes = entries["integrity.json"];
  if (!manifestBytes) errors.push("manifest.json is missing.");
  if (!integrityBytes) errors.push("integrity.json is missing.");
  const manifest = manifestBytes
    ? parseJson<ArchiveManifest>(manifestBytes, "manifest.json", errors)
    : undefined;
  const integrity = integrityBytes
    ? parseJson<{ manifestSha256?: string }>(
        integrityBytes,
        "integrity.json",
        errors,
      )
    : undefined;
  if (
    manifestBytes &&
    integrity?.manifestSha256 !== (await sha256(manifestBytes))
  )
    errors.push("Manifest SHA-256 mismatch.");
  if (
    manifest &&
    (manifest.format !== ARCHIVE_FORMAT || manifest.version !== ARCHIVE_VERSION)
  )
    errors.push("Unsupported archive manifest version.");
  if (manifest?.source?.schemaStatus !== "verified")
    errors.push("Archive source schema is not verified.");

  let filesChecked = 0;
  let corrupted = 0;
  if (manifest?.files && Array.isArray(manifest.files)) {
    const paths = new Set<string>();
    for (const file of manifest.files) {
      if (!isSafeArchivePath(file.path) || paths.has(file.path)) {
        errors.push(`Invalid or duplicate file record: ${file.path}`);
        continue;
      }
      paths.add(file.path);
      const content = entries[file.path];
      if (!content) {
        errors.push(`Expected file is missing: ${file.path}`);
        corrupted++;
        continue;
      }
      filesChecked++;
      if (
        content.byteLength !== file.bytes ||
        (await sha256(content)) !== file.sha256
      ) {
        errors.push(`File integrity mismatch: ${file.path}`);
        corrupted++;
      }
    }
  } else if (manifest) errors.push("Manifest file records are missing.");
  if (manifest?.files) {
    const declared = new Set(manifest.files.map((file) => file.path));
    for (const path of Object.keys(entries))
      if (
        path !== "manifest.json" &&
        path !== "integrity.json" &&
        !declared.has(path)
      )
        errors.push(`Undeclared archive entry: ${path}`);
  }

  let assetsVerified = 0;
  let missing = 0;
  if (manifest?.assets && Array.isArray(manifest.assets)) {
    const byId = new Map(
      manifest.assets.map((asset) => [asset.nativeId, asset]),
    );
    const objectBytes = entries["metadata/objects.json"];
    const objects = objectBytes
      ? parseJson<unknown[]>(objectBytes, "metadata/objects.json", errors)
      : undefined;
    const objectIds = new Set(
      Array.isArray(objects)
        ? objects.flatMap((object) =>
            object && typeof object === "object" && "id" in object
              ? [String((object as { id: unknown }).id)]
              : [],
          )
        : [],
    );
    for (const asset of manifest.assets) {
      for (const objectId of asset.objectIds)
        if (!objectIds.has(objectId))
          errors.push(
            `Asset ${asset.nativeId} references unknown object ${objectId}.`,
          );
      if (asset.status === "missing") {
        missing++;
        continue;
      }
      if (!asset.archivePath || !asset.sha256) {
        errors.push(`Asset metadata is incomplete: ${asset.nativeId}`);
        continue;
      }
      const content = entries[asset.archivePath];
      if (!content || (await sha256(content)) !== asset.sha256) {
        errors.push(`Asset SHA-256 mismatch: ${asset.nativeId}`);
        corrupted++;
        continue;
      }
      if (asset.status === "duplicate") {
        const canonical = asset.duplicateOf
          ? byId.get(asset.duplicateOf)
          : undefined;
        if (
          !canonical ||
          canonical.sha256 !== asset.sha256 ||
          canonical.archivePath !== asset.archivePath
        )
          errors.push(
            `Invalid duplicate asset relationship: ${asset.nativeId}`,
          );
      }
      assetsVerified++;
    }
  } else if (manifest) errors.push("Manifest asset records are missing.");
  if (missing)
    warnings.push(
      `${missing} referenced asset${missing === 1 ? " is" : "s are"} missing.`,
    );
  return {
    valid: errors.length === 0,
    filesChecked,
    assetsVerified,
    missing,
    corrupted,
    errors,
    warnings,
    manifest,
  };
}
