"""Inspect observed table record links. Experimental, never production decoding."""
import json
from pathlib import Path
import sys
from inspect_records import fields


def all_values(data, field):
    return [v for f, _, v in fields(data) if f == field]


def at(data, *path):
    for field, index in path:
        data = all_values(data, field)[index]
    return data


def inspect(path):
    chunks = Path(path).read_bytes().split(b"crdt")[1:]
    table = chunks[0][4:]
    keys = all_values(at(table, (6, 0)), 3)
    objects = all_values(table, 4)
    props = all_values(at(objects[0], (4, 0), (4, 0)), 2)
    axes = []
    for prop in props[1:3]:
        entries = all_values(at(prop, (9, 0), (1, 0)), 4)
        axis = []
        for entry in entries:
            key_index = at(entry, (2, 0), (1, 0), (2, 0), (17, 0))
            order = at(entry, (2, 0), (1, 0), (1, 0), (2, 0))
            axis.append((order, keys[key_index]))
        # Native column reordering changes key-pool order. The embedded CRDT
        # ordinal remains a logical value and is not the visual axis order.
        axes.append(sorted((key for _, key in axis), key=keys.index))
    rows, cols = axes
    sizes, cells = {}, []
    for obj in objects[1:]:
        key = at(obj, (5, 0), (2, 0))
        if key in rows + cols:
            sizes[key] = at(obj, (4, 0), (4, 0), (2, 0), (1, 0), (2, 0), (15, 0))
        elif len(key) == 37 and key[:2] == b"\x03\x11" and key[19] == 17:
            row, col = rows.index(key[2:19]), cols.index(key[20:37])
            text = at(obj, (4, 0), (4, 0), (2, 0), (4, 0), (2, 0), (5, 0), (1, 0)).decode()
            cells.append({"row": row, "column": col, "text": text})
        else:
            raise ValueError("Unrecognized table object")
    frame = at(chunks[1][4:], (1, 0), (4, 0), (2, 1), (1, 0), (2, 0), (14, 0), (2, 1), (14, 0))
    position = at(frame, (2, 0), (4, 0))
    size = at(frame, (2, 1), (4, 0))
    return {"rows": [sizes[key] for key in rows], "columns": [sizes[key] for key in cols],
            "cells": sorted(cells, key=lambda c: (c["row"], c["column"])),
            "frame": {"x": at(position, (1, 0)), "y": at(position, (2, 0)),
                      "width": at(size, (1, 0)), "height": at(size, (2, 0)), "rotation": at(frame, (2, 2), (15, 0))}}


if __name__ == "__main__":
    print(json.dumps(inspect(sys.argv[1]), indent=2))
