import { decodePasteboard } from "libfreeform";
import { MAX_CAPTURE_BYTES, MAX_ENVELOPE_LENGTH, parseCapture } from "./index";
import { normalize } from "./normalize";

/** Explicit file formats only. Raw fixtures lack companion clipboard assets. */
export function inspectCaptureFile(name: string, bytes: Uint8Array) {
  const extension = name.split(".").pop()?.toLowerCase();
  const rawType =
    extension === "crlnative"
      ? "com.apple.freeform.CRLNativeData"
      : extension === "drawing"
        ? "com.apple.drawing"
        : undefined;
  if (!rawType && extension !== "boardeject" && extension !== "json")
    throw new Error(
      "Choose a .boardeject capture, envelope .json, .crlnative or .drawing file. PDF/images are not capture inputs.",
    );
  if (!bytes.length) throw new Error("The selected file is empty.");
  if (bytes.length > (rawType ? MAX_CAPTURE_BYTES : MAX_ENVELOPE_LENGTH))
    throw new Error(
      "Capture exceeds the file size limit. Copy a smaller selection (32 MiB raw / 45 MiB envelope).",
    );
  let decoded;
  if (rawType)
    decoded = decodePasteboard({ flavors: [{ uti: rawType, bytes }] });
  else {
    let text;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new Error(
        "Capture envelope must be UTF-8 JSON. Use .crlnative or .drawing for raw native bytes.",
      );
    }
    try {
      JSON.parse(text);
    } catch {
      throw new Error(
        "Invalid JSON. Choose the .boardeject file created by the macOS helper, not a manifest or screenshot.",
      );
    }
    decoded = parseCapture(text);
  }
  const board = normalize(decoded);
  if (rawType)
    board.issues.push({
      severity: "warning",
      message:
        "Single raw payload inspected. Companion clipboard metadata/assets are absent; prefer a complete .boardeject capture for fidelity testing.",
    });
  return board;
}
