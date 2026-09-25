import { unzipSync, zipSync } from "fflate";
import {
  verifyArchive,
  isSafeArchivePath,
  type ArchiveVerification,
  canonicalJson,
} from "./index";

export const EXPLORER_MAX_BYTES = 256 * 1024 * 1024;
export interface ExplorerAsset {
  name: string;
  nativeId: string;
  bytes?: Uint8Array;
  previewType?: string;
  status: string;
}
export interface ExplorerResult {
  verification: ArchiveVerification;
  assets: ExplorerAsset[];
  preview?: Uint8Array;
  exportBytes?: Uint8Array;
}

export function safeDownloadName(name: string): string {
  const clean = name
    // Control characters must never reach download names.
    // oxlint-disable-next-line no-control-regex
    .replace(/[\\/\x00-\x1f\x7f<>:"|?*]/g, "_")
    .replace(/^\.+/, "")
    .replace(/[. ]+$/, "")
    .slice(0, 150);
  return !clean || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(clean)
    ? `file_${clean || "asset"}`
    : clean;
}

// Only browser media formats with recognizable signatures are previewable.
// SVG, HTML, office files and unknown formats remain downloads.
export function previewType(bytes: Uint8Array): string | undefined {
  const start = Array.from(bytes.subarray(0, 16));
  const ascii = new TextDecoder().decode(bytes.subarray(0, 16));
  if (start.slice(0, 8).join() === "137,80,78,71,13,10,26,10")
    return "image/png";
  if (start[0] === 255 && start[1] === 216 && start[2] === 255)
    return "image/jpeg";
  if (/^GIF8[79]a/.test(ascii)) return "image/gif";
  if (ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP")
    return "image/webp";
  if (ascii.startsWith("%PDF-")) return "application/pdf";
  if (ascii.slice(4, 8) === "ftyp")
    return ascii.slice(8, 11) === "M4A" ? "audio/mp4" : "video/mp4";
  if (ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WAVE")
    return "audio/wav";
  if (ascii.startsWith("ID3")) return "audio/mpeg";
  return undefined;
}

function failure(message: string): ExplorerResult {
  return {
    verification: {
      valid: false,
      filesChecked: 0,
      assetsVerified: 0,
      missing: 0,
      corrupted: 0,
      errors: [message],
      warnings: [],
    },
    assets: [],
  };
}

export async function inspectArchive(
  bytes: Uint8Array,
): Promise<ExplorerResult> {
  if (bytes.length > EXPLORER_MAX_BYTES)
    return failure(
      "This archive exceeds the browser limit of 256 MiB. Use the Mac helper to verify it.",
    );
  try {
    let expanded = 0;
    let count = 0;
    const names = new Set<string>();
    const entries = unzipSync(bytes, {
      filter(file) {
        expanded += file.originalSize;
        count++;
        if (expanded > EXPLORER_MAX_BYTES || count > 10000)
          throw new Error(
            "Expanded archive exceeds the browser limit (256 MiB or 10,000 files).",
          );
        if (!isSafeArchivePath(file.name) || names.has(file.name))
          throw new Error("Archive contains unsafe or duplicate paths.");
        names.add(file.name);
        return true;
      },
    });
    const verification = await verifyArchive(bytes);
    const result: ExplorerResult = { verification, assets: [] };
    if (!verification.valid) return result;
    const manifest = verification.manifest!;
    if (
      !manifest.board ||
      typeof manifest.board.id !== "string" ||
      !manifest.board.id ||
      typeof manifest.board.title !== "string" ||
      !manifest.board.title ||
      typeof manifest.createdAt !== "string" ||
      !Number.isFinite(Date.parse(manifest.createdAt)) ||
      manifest.source.kind !== "freeform-snapshot" ||
      !Number.isSafeInteger(manifest.source.databaseUserVersion) ||
      manifest.source.databaseUserVersion < 0 ||
      typeof manifest.source.schemaFingerprint !== "string" ||
      !manifest.source.schemaFingerprint ||
      !Array.isArray(manifest.warnings) ||
      manifest.warnings.some((w) => typeof w !== "string") ||
      typeof manifest.excalidrawExport?.available !== "boolean" ||
      !Number.isSafeInteger(manifest.board.objectCount) ||
      manifest.board.objectCount < 0
    )
      return failure("Archive board metadata is invalid.");
    const required = {
      "native/board/native-records.json": "native",
      "metadata/board.json": "metadata",
      "metadata/objects.json": "metadata",
    };
    for (const [path, role] of Object.entries(required)) {
      if (
        !entries[path] ||
        !manifest.files.some((f) => f.path === path && f.role === role)
      )
        return failure(`Required archive record is missing: ${path}`);
    }
    if (
      canonicalJson(
        JSON.parse(new TextDecoder().decode(entries["metadata/board.json"])),
      ) !== canonicalJson(manifest.board)
    )
      return failure("Board metadata does not match the manifest.");
    const objects = JSON.parse(
      new TextDecoder().decode(entries["metadata/objects.json"]),
    );
    if (!Array.isArray(objects))
      return failure("Object metadata must be a list.");
    if (
      manifest.excalidrawExport.available &&
      (manifest.excalidrawExport.path !== "exports/board.excalidraw" ||
        !manifest.files.some(
          (f) => f.path === "exports/board.excalidraw" && f.role === "export",
        ))
    )
      return failure("Included editable export is missing or invalid.");
    const ids = new Set<string>();
    const used = new Set<string>();
    for (const asset of manifest.assets) {
      if (!asset.nativeId || ids.has(asset.nativeId))
        return failure("Invalid or duplicate asset identity.");
      ids.add(asset.nativeId);
      if (!["missing", "preserved", "duplicate"].includes(asset.status))
        return failure("Archive contains an unknown asset status.");
      if (
        asset.status !== "missing" &&
        !manifest.files.some(
          (f) =>
            f.path === asset.archivePath &&
            f.role === "asset" &&
            f.bytes === asset.bytes &&
            f.sha256 === asset.sha256,
        )
      )
        return failure("Asset metadata does not match its original file.");
      const original = safeDownloadName(
        typeof asset.originalFilename === "string"
          ? asset.originalFilename
          : asset.archivePath?.split("/").pop() || "asset",
      );
      let name = original;
      let number = 2;
      while (used.has(name.toLowerCase())) {
        const dot = original.lastIndexOf(".");
        const suffix = ` (${number++})`;
        const extension =
          dot > 0 && original.length - dot < 16 ? original.slice(dot) : "";
        const stem = extension
          ? original.slice(0, -extension.length)
          : original;
        name = `${stem.slice(0, 150 - suffix.length - extension.length)}${suffix}${extension}`;
      }
      used.add(name.toLowerCase());
      const content =
        asset.status !== "missing" && asset.archivePath
          ? entries[asset.archivePath]
          : undefined;
      result.assets.push({
        name,
        nativeId: asset.nativeId,
        status: asset.status,
        bytes: content,
        previewType: content ? previewType(content) : undefined,
      });
    }
    const preview = entries["previews/preview.png"];
    if (preview && previewType(preview) === "image/png")
      result.preview = preview;
    if (
      manifest.excalidrawExport?.available &&
      manifest.excalidrawExport.path === "exports/board.excalidraw"
    )
      result.exportBytes = entries[manifest.excalidrawExport.path];
    return result;
  } catch (error) {
    return failure(
      error instanceof Error
        ? `Could not open archive: ${error.message}`
        : "Could not open this archive.",
    );
  }
}

export function extractAssets(result: ExplorerResult): Uint8Array {
  if (!result.verification.valid)
    throw new Error("Verify the archive before extracting assets.");
  const files: Record<string, Uint8Array> = Object.create(null);
  let total = 0;
  for (const asset of result.assets) {
    if (asset.bytes) {
      total += asset.bytes.length + 512;
      if (total > EXPLORER_MAX_BYTES)
        throw new Error(
          "Extracted files exceed 256 MiB. Download individual originals instead.",
        );
      files[asset.name] = asset.bytes;
    }
  }
  return zipSync(files, { level: 0 });
}
