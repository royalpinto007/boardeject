import {
  decodePasteboard,
  type FreeformBlobs,
  type FreeformPasteboard,
} from "libfreeform";

export const MAX_CAPTURE_BYTES = 32 * 1024 * 1024;
export const MAX_ENVELOPE_LENGTH = 45 * 1024 * 1024;

/** Read only our versioned envelope, never arbitrary native clipboard text. */
export function readEnvelope(source: string): FreeformBlobs {
  if (source.length > MAX_ENVELOPE_LENGTH)
    throw new Error("Capture exceeds the 45 MiB envelope limit.");
  const input: unknown = JSON.parse(source);
  if (!input || typeof input !== "object")
    throw new Error("Expected a BoardEject clipboard capture.");
  const envelope = input as Record<string, unknown>;
  if (
    envelope.format !== "boardeject.clipboard" ||
    envelope.version !== 1 ||
    !Array.isArray(envelope.flavors)
  ) {
    throw new Error(
      "Use the macOS helper to create a version 1 BoardEject capture. PDF and plain text are not editable Freeform captures.",
    );
  }
  if (envelope.flavors.length === 0 || envelope.flavors.length > 128)
    throw new Error("Capture must contain 1 to 128 clipboard flavors.");
  const seen = new Set<string>();
  let total = 0;
  const flavors = envelope.flavors.map((entry: unknown) => {
    if (!entry || typeof entry !== "object")
      throw new Error("Invalid clipboard flavor.");
    const { uti, base64 } = entry as Record<string, unknown>;
    if (
      typeof uti !== "string" ||
      !/^[\w.-]{1,200}$/.test(uti) ||
      seen.has(uti)
    )
      throw new Error("Invalid or duplicate clipboard type.");
    if (
      typeof base64 !== "string" ||
      base64.length % 4 !== 0 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
        base64,
      )
    )
      throw new Error("Invalid base64 clipboard data.");
    seen.add(uti);
    const binary = atob(base64);
    total += binary.length;
    if (total > MAX_CAPTURE_BYTES)
      throw new Error(
        "Decoded capture exceeds 32 MiB. Copy a smaller selection.",
      );
    return { uti, bytes: Uint8Array.from(binary, (c) => c.charCodeAt(0)) };
  });
  return { flavors };
}

export function parseCapture(source: string): FreeformPasteboard {
  return decodePasteboard(readEnvelope(source));
}
