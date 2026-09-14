import type { FreeformNative } from "libfreeform";

type Field = { number: number; wire: number; value: number | Uint8Array };
const fail = (): never => {
  throw new Error("Unrecognized native table structure");
};
function fields(data: Uint8Array): Field[] {
  let at = 0;
  const result: Field[] = [];
  const integer = () => {
    let value = 0;
    for (let shift = 0; shift <= 49; shift += 7) {
      if (at >= data.length) return fail();
      const byte = data[at++];
      value += (byte & 127) * 2 ** shift;
      if (!Number.isSafeInteger(value)) return fail();
      if (byte < 128) return value;
    }
    return fail();
  };
  while (at < data.length) {
    if (result.length > 20000) fail();
    const tag = integer(),
      number = Math.floor(tag / 8),
      wire = tag % 8;
    if (!number) fail();
    let value: Field["value"];
    if (wire === 0) value = integer();
    else if (wire === 2) {
      const length = integer();
      if (length > data.length - at) fail();
      value = data.subarray(at, at + length);
      at += length;
    } else if (wire === 5) {
      if (at + 4 > data.length) fail();
      value = new DataView(data.buffer, data.byteOffset + at, 4).getFloat32(
        0,
        true,
      );
      at += 4;
    } else return fail();
    result.push({ number, wire, value });
  }
  return result;
}
const bytes = (value: Field["value"]): Uint8Array =>
  value instanceof Uint8Array ? value : fail();
const num = (value: Field["value"]): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fail();
const all = (data: Uint8Array, field: number) =>
  fields(data)
    .filter((f) => f.number === field)
    .map((f) => f.value);
function path(data: Uint8Array, ...steps: [number, number][]): Field["value"] {
  let value: Field["value"] = data;
  for (const [field, index] of steps) {
    const values = all(bytes(value), field);
    if (index >= values.length) fail();
    value = values[index];
  }
  return value;
}
const hex = (data: Uint8Array) =>
  Array.from(data, (b) => b.toString(16).padStart(2, "0")).join("");
const text = (data: Uint8Array) =>
  new TextDecoder("utf-8", { fatal: true }).decode(data);

/** Narrow Freeform 4.5 single-table layout. Unknown structures fail closed.
 * Object framing comes from length descriptors, never scanning for text/magic.
 * Native compatibility status is preserved; this recovers a verified subset.
 */
export function recoverNativeTable(native: FreeformNative) {
  try {
    if (
      native.items.length !== 1 ||
      native.compatibility.kind !== "unsupported" ||
      native.compatibility.minimumVersion !== 7
    )
      return;
    const data = native.rawArchive;
    if (data.length < 8 || data.length > 2 * 1024 * 1024) return;
    const headerLength = Number(
      new DataView(data.buffer, data.byteOffset, 8).getBigUint64(0, true),
    );
    if (
      !Number.isSafeInteger(headerLength) ||
      headerLength < 1 ||
      headerLength > data.length - 8
    )
      return;
    const header = data.subarray(8, 8 + headerLength);
    if (num(path(header, [1, 0])) !== 2) return;
    const descriptors = all(header, 5).map(bytes);
    if (descriptors.length !== 3) return;
    const names = ["capsuleData", "commonCRDTData", "specificCRDTData"];
    const versions = [7, 6, 6];
    let offset = 8 + headerLength;
    const records = descriptors.map((descriptor, i) => {
      if (text(bytes(path(descriptor, [1, 0]))) !== names[i]) return fail();
      const length = num(path(descriptor, [2, 0]));
      if (
        !Number.isInteger(length) ||
        length < 8 ||
        offset + length > data.length
      )
        return fail();
      if (
        text(data.subarray(offset, offset + 4)) !== "crdt" ||
        new DataView(data.buffer, data.byteOffset + offset + 4, 4).getUint32(
          0,
          true,
        ) !== versions[i]
      )
        return fail();
      const record = data.subarray(offset + 8, offset + length);
      offset += length;
      fields(record);
      return record;
    });
    if (offset !== data.length) return;
    const [table, common, specific] = records;
    if (hex(specific) !== "0a022200") return;
    const metadata = bytes(path(common, [6, 0], [1, 0]));
    if (
      metadata.length !== 64 ||
      hex(metadata.subarray(16, 32)) !==
        native.items[0].uuid.replaceAll("-", "").toLowerCase()
    )
      return;
    const keys = all(bytes(path(table, [6, 0])), 3).map(bytes);
    const attributeNames = all(bytes(path(table, [6, 0])), 2).map((value) =>
      text(bytes(value)),
    );
    const objects = all(table, 4).map(bytes);
    if (!objects.length || objects.length > 11000) return;
    const props = all(bytes(path(objects[0], [4, 0], [4, 0])), 2).map(bytes);
    // A genuine fully empty table omits the attributed-text property pool.
    if (![4, 5].includes(props.length)) return;
    const axisKeyIndices: number[][] = [];
    const axes = props.slice(1, 3).map((prop) => {
      const entries = all(bytes(path(prop, [9, 0], [1, 0])), 4).map(bytes);
      const values = entries
        .map((entry) => {
          const index = num(path(entry, [2, 0], [1, 0], [2, 0], [17, 0]));
          const order = num(path(entry, [2, 0], [1, 0], [1, 0], [2, 0]));
          if (!Number.isInteger(index) || index < 0 || index >= keys.length)
            return fail();
          const key = keys[index];
          if (key.length !== 17 || key[0] !== 2) return fail();
          return { order, index, key: hex(key) };
        })
        .sort((a, b) => a.index - b.index);
      if (
        [...values]
          .sort((a, b) => a.order - b.order)
          .some((v, i) => v.order !== i + 1) ||
        new Set(values.map((v) => v.key)).size !== values.length
      )
        return fail();
      axisKeyIndices.push(values.map((value) => value.index));
      return values.map((v) => v.key);
    });
    const [rows, columns] = axes;
    if (
      !rows.length ||
      !columns.length ||
      rows.length * columns.length > 10000 ||
      new Set([...rows, ...columns]).size !== rows.length + columns.length
    )
      return;
    if (axisKeyIndices.flat().some((index, expected) => index !== expected))
      return;
    const sizes = new Map<string, number>();
    const cells: {
      row: number;
      column: number;
      text: string;
      style?: {
        bold?: boolean;
        italic?: boolean;
        fontSize?: number;
        paragraphAlignment?: "left" | "center" | "right";
      };
    }[] = [];
    for (const obj of objects.slice(1)) {
      const keyBytes = bytes(path(obj, [5, 0], [2, 0])),
        key = hex(keyBytes);
      if (rows.includes(key) || columns.includes(key)) {
        if (sizes.has(key)) return;
        const size = num(
          path(obj, [4, 0], [4, 0], [2, 0], [1, 0], [2, 0], [15, 0]),
        );
        if (size <= 0 || size > 100000) return;
        sizes.set(key, size);
      } else if (
        keyBytes.length === 37 &&
        keyBytes[0] === 3 &&
        keyBytes[1] === 17 &&
        keyBytes[19] === 17
      ) {
        const row = rows.indexOf(hex(keyBytes.subarray(2, 19))),
          column = columns.indexOf(hex(keyBytes.subarray(20)));
        if (
          row < 0 ||
          column < 0 ||
          cells.some((c) => c.row === row && c.column === column)
        )
          return;
        const contentRecord = bytes(
            path(obj, [4, 0], [4, 0], [2, 0], [4, 0], [2, 0], [5, 0]),
          ),
          content = text(bytes(path(contentRecord, [1, 0]))),
          style: NonNullable<(typeof cells)[number]["style"]> = {},
          seenAttributes = new Set<string>();
        for (const value of all(contentRecord, 6)) {
          const attribute = bytes(value),
            attributeValues = all(attribute, 2);
          // Field 6 also carries CRDT bookkeeping. A field-2 payload is the
          // optional formatting record observed in the native differentials.
          if (!attributeValues.length) continue;
          for (const attributeValue of attributeValues) {
            const attributeRecord = bytes(attributeValue),
              nameIndex = num(path(attributeRecord, [1, 0])),
              valueRecord = bytes(path(attributeRecord, [2, 0]));
            if (
              !Number.isInteger(nameIndex) ||
              nameIndex < 0 ||
              nameIndex >= attributeNames.length
            )
              return;
            const name = attributeNames[nameIndex];
            // Multiline native text repeats base writing direction per paragraph.
            // Repeated attributes are safe only when every observed value agrees.
            if (seenAttributes.has(name) && name !== "baseWritingDirection")
              return;
            seenAttributes.add(name);
            if (name === "baseWritingDirection") {
              if (num(path(valueRecord, [5, 0])) !== 0) return;
            } else if (name === "bold") {
              if (num(path(valueRecord, [5, 0])) !== 2) return;
              style.bold = true;
            } else if (name === "italic") {
              if (num(path(valueRecord, [5, 0])) !== 2) return;
              style.italic = true;
            } else if (name === "fontSize") {
              const fontSize = num(path(valueRecord, [15, 0]));
              if (fontSize < 8 || fontSize > 500) return;
              style.fontSize = fontSize;
            } else if (name === "paragraphAlignment") {
              const alignment = num(path(valueRecord, [5, 0]));
              if (alignment === 0) style.paragraphAlignment = "left";
              else if (alignment === 2) style.paragraphAlignment = "right";
              else if (alignment === 4) style.paragraphAlignment = "center";
              else return;
            } else return;
          }
        }
        cells.push({
          row,
          column,
          text: content,
          ...(Object.keys(style).length ? { style } : {}),
        });
      } else return;
    }
    if (sizes.size !== rows.length + columns.length) return;
    const completeCells = Array.from(
      { length: rows.length * columns.length },
      (_, index) => {
        const row = Math.floor(index / columns.length),
          column = index % columns.length;
        return (
          cells.find((cell) => cell.row === row && cell.column === column) ?? {
            row,
            column,
            text: "",
          }
        );
      },
    );
    const rowHeights = rows.map((key) => sizes.get(key)!),
      columnWidths = columns.map((key) => sizes.get(key)!);
    const frame = bytes(
      path(
        common,
        [1, 0],
        [4, 0],
        [2, 1],
        [1, 0],
        [2, 0],
        [14, 0],
        [2, 1],
        [14, 0],
      ),
    );
    const position = bytes(path(frame, [2, 0], [4, 0])),
      size = bytes(path(frame, [2, 1], [4, 0]));
    const bounds = {
      x: num(path(position, [1, 0])),
      y: num(path(position, [2, 0])),
      width: num(path(size, [1, 0])),
      height: num(path(size, [2, 0])),
      rotation: num(path(frame, [2, 2], [15, 0])),
    };
    if (
      bounds.rotation !== 0 ||
      Math.abs(bounds.x) > 1e6 ||
      Math.abs(bounds.y) > 1e6 ||
      Math.abs(bounds.width - columnWidths.reduce((a, b) => a + b, 0)) > 0.01 ||
      Math.abs(bounds.height - rowHeights.reduce((a, b) => a + b, 0)) > 0.01
    )
      return;
    return {
      id: native.items[0].uuid,
      bounds,
      rowHeights,
      columnWidths,
      cells: completeCells,
    };
  } catch {
    return;
  }
}
