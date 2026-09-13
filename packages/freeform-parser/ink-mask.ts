/** Conservative guard for PencilKit's serialized geometric mask (stroke field 11).
 * Proven by the paired Apple-generated captures in tests/fixtures/apple.
 * libfreeform 1.0.0 does not expose this mask as visibleRanges. This detects its
 * presence only; it deliberately does not infer clipping or eraser semantics.
 */
export function hasUnresolvedInkMask(bytes: Uint8Array): boolean {
  let offset = 0;
  const uint = (): number => {
    let value = 0;
    for (let shift = 0; shift <= 49; shift += 7) {
      if (offset >= bytes.length) throw new Error("Truncated ink record");
      const byte = bytes[offset++];
      value += (byte & 127) * 2 ** shift;
      if (!Number.isSafeInteger(value)) throw new Error("Oversized ink field");
      if (!(byte & 128)) return value;
    }
    throw new Error("Oversized ink varint");
  };
  try {
    while (offset < bytes.length) {
      const tag = uint();
      const field = Math.floor(tag / 8),
        wire = tag % 8;
      if (!field) return true;
      if (field === 11) return true;
      if (wire === 0) uint();
      else if (wire === 1) offset += 8;
      else if (wire === 5) offset += 4;
      else if (wire === 2) {
        const length = uint();
        offset += length;
      } else return true;
      if (offset > bytes.length) return true;
    }
    return false;
  } catch {
    return true;
  }
}
