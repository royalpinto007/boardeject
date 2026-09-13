"""Diagnostic protobuf tree for native CRDT records. No semantic field guesses."""
import struct
import sys
from pathlib import Path


def varint(data, at):
    result = 0
    for shift in range(0, 70, 7):
        byte = data[at]
        at += 1
        result |= (byte & 127) << shift
        if byte < 128:
            return result, at
    raise ValueError("varint overflow")


def fields(data):
    at, result = 0, []
    while at < len(data):
        key, at = varint(data, at)
        field, wire = key >> 3, key & 7
        if field == 0:
            raise ValueError("field zero")
        if wire == 0:
            value, at = varint(data, at)
        elif wire in (1, 5):
            size = 8 if wire == 1 else 4
            if at + size > len(data):
                raise ValueError("truncated fixed field")
            value = struct.unpack("<d" if size == 8 else "<f", data[at:at+size])[0]
            at += size
        elif wire == 2:
            size, at = varint(data, at)
            if at + size > len(data):
                raise ValueError("truncated bytes")
            value = data[at:at+size]
            at += size
        else:
            raise ValueError("unsupported wire")
        result.append((field, wire, value))
    return result


def tree(data, path="", depth=0):
    if depth > 20:
        return
    try:
        values = fields(data)
    except (ValueError, IndexError, struct.error):
        print(path, "bytes", data.hex())
        return
    counts = {}
    for field, wire, value in values:
        index = counts.get(field, 0)
        counts[field] = index + 1
        child = f"{path}/{field}[{index}]"
        if wire != 2:
            print(child, f"wire{wire}", value)
        elif value and all(32 <= c < 127 for c in value):
            print(child, "text", repr(value.decode()))
        elif value:
            tree(value, child, depth + 1)
        else:
            print(child, "empty")


if __name__ == "__main__":
    data = Path(sys.argv[1]).read_bytes()
    # Diagnostic segmentation only; production must validate framing/ownership.
    for index, chunk in enumerate(data.split(b"crdt")[1:]):
        print("RECORD", index, "version", int.from_bytes(chunk[:4], "little"))
        tree(chunk[4:], str(index))
