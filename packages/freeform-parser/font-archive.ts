/** Bounded data-only binary plist reader. Never instantiates archived classes. */
export function attributeArchive(encoded: string): {
  root: any;
  objects: any[];
} {
  if (encoded.length > 65536) throw new Error("Font archive too large");
  const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  const view = new DataView(bytes.buffer);
  if (
    new TextDecoder().decode(bytes.slice(0, 8)) !== "bplist00" ||
    bytes.length < 40
  )
    throw new Error("Invalid font archive");
  const end = bytes.length - 32;
  function uint(at: number, size: number): number {
    if (size < 1 || size > 8 || at < 0 || at + size > bytes.length)
      throw new Error("Invalid plist integer");
    let n = 0;
    for (let i = 0; i < size; i++) n = n * 256 + bytes[at + i];
    if (!Number.isSafeInteger(n)) throw new Error("Oversized plist integer");
    return n;
  }
  const offsetSize = bytes[end + 6],
    refSize = bytes[end + 7],
    count = uint(end + 8, 8),
    top = uint(end + 16, 8),
    table = uint(end + 24, 8);
  if (count > 2048 || table + count * offsetSize > end)
    throw new Error("Oversized plist");
  let budget = 10000;
  function read(id: number, depth = 0): any {
    if (id >= count || depth > 30 || --budget < 0)
      throw new Error("Invalid plist graph");
    let at = uint(table + id * offsetSize, offsetSize);
    if (at < 8 || at >= table) throw new Error("Invalid plist offset");
    const type = bytes[at] >> 4;
    let length = bytes[at++] & 15;
    if ([4, 5, 6, 10, 13].includes(type) && length === 15) {
      const marker = bytes[at++];
      if (marker >> 4 !== 1) throw new Error("Invalid plist length");
      const size = 2 ** (marker & 15);
      length = uint(at, size);
      at += size;
    }
    if (length > 65536) throw new Error("Oversized plist value");
    if (type === 0) return length === 9;
    if (type === 1) return uint(at, 2 ** length);
    if (type === 2) {
      if (![2, 3].includes(length) || at + 2 ** length > table)
        throw new Error("Invalid real");
      return length === 3 ? view.getFloat64(at) : view.getFloat32(at);
    }
    if (type === 8) return { uid: uint(at, length + 1) };
    const size =
      type === 6
        ? length * 2
        : [10, 13].includes(type)
          ? length * refSize * (type === 13 ? 2 : 1)
          : length;
    if (at + size > table) throw new Error("Truncated plist value");
    if (type === 5)
      return new TextDecoder().decode(bytes.slice(at, at + length));
    if (type === 6)
      return new TextDecoder("utf-16be").decode(
        bytes.slice(at, at + length * 2),
      );
    if (type === 4) return bytes.slice(at, at + length);
    if (type === 10)
      return Array.from({ length }, (_, i) =>
        read(uint(at + i * refSize, refSize), depth + 1),
      );
    if (type === 13) {
      const result = Object.create(null);
      for (let i = 0; i < length; i++) {
        const key = read(uint(at + i * refSize, refSize), depth + 1);
        if (typeof key !== "string") throw new Error("Invalid plist key");
        result[key] = read(
          uint(at + (length + i) * refSize, refSize),
          depth + 1,
        );
      }
      return result;
    }
    throw new Error("Unsupported plist type");
  }
  const archive = read(top),
    objects = archive.$objects;
  const root = objects?.[archive.$top?.root?.uid];
  if (!root || !Array.isArray(objects))
    throw new Error("Invalid attribute archive");
  return { root, objects };
}
export function fontArchive(encoded: string): { name: string; size: number } {
  const { root, objects } = attributeArchive(encoded);
  const name = objects?.[root?.NSName?.uid],
    size = root?.NSSize;
  if (
    typeof name !== "string" ||
    !Number.isFinite(size) ||
    size < 8 ||
    size > 500
  )
    throw new Error("Unsupported font descriptor");
  return { name, size };
}
