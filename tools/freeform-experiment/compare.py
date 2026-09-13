"""Verify native differential captures; report byte changes without guessing CRL fields."""
import hashlib
import itertools
import json
from pathlib import Path
import re
import sys


def load(directory):
    result = {}
    for entry in json.loads((directory / "manifest.json").read_text())["flavors"]:
        data = (directory / entry["file"]).read_bytes()
        assert len(data) == entry["bytes"]
        assert hashlib.sha256(data).hexdigest() == entry["sha256"]
        result[entry["uti"]] = data
    return result


def differences(before, after):
    ranges = []
    for index, (a, b) in enumerate(itertools.zip_longest(before, after)):
        if a != b:
            if ranges and ranges[-1][1] == index:
                ranges[-1][1] += 1
            else:
                ranges.append([index, index + 1])
    return ranges


def compare(root):
    baseline = load(root / "table-baseline")
    expected = b"A1\tB1\nA2\tB2\n"
    assert baseline["public.utf8-plain-text"] == expected
    report = {}
    for index, cell in enumerate(["A1", "B1", "A2", "B2"]):
        changed = load(root / ("table-change-" + cell))
        restored = load(root / ("table-restore-" + cell))
        assert changed["public.utf8-plain-text"] == expected.replace(cell.encode(), f"X{index+1}".encode())
        assert restored["public.utf8-plain-text"] == expected
        # RTF row/cell delimiters and dimensions must remain identical.
        tokens = lambda data: re.findall(rb"\\(?:cellx-?\d+|clwWidth-?\d+|clheight-?\d+|cell\b|row\b|trowd\b)", data)
        assert tokens(changed["public.rtf"]) == tokens(baseline["public.rtf"])
        report[cell] = {}
        for uti in sorted(baseline.keys() | changed.keys() | restored.keys()):
            a, b, c = baseline.get(uti, b""), changed.get(uti, b""), restored.get(uti, b"")
            report[cell][uti] = {"beforeLength": len(a), "afterLength": len(b),
                                 "changedRanges": differences(a, b), "restoreRanges": differences(a, c)}
    return report


if __name__ == "__main__":
    print(json.dumps(compare(Path(sys.argv[1])), indent=2))
