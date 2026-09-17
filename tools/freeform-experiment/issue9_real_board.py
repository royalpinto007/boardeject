"""Capture two genuinely labelled Freeform shapes and their connector."""

import json
import os
from pathlib import Path
import subprocess


out = Path(os.environ["CAPTURE_OUTPUT"])
out.mkdir(parents=True, exist_ok=True)


def run(name, args, timeout=30):
    try:
        result = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
        record = {
            "exitCode": result.returncode,
            "stdout": result.stdout,
            "stderr": result.stderr,
        }
    except subprocess.TimeoutExpired:
        record = {"error": "timeout", "seconds": timeout}
    (out / f"{name}.json").write_text(json.dumps(record, indent=2))
    if record.get("exitCode") != 0:
        raise SystemExit(f"Capture stopped at {name}; inspect the artifact")
    return record


def ui(name, body):
    return run(
        name,
        [
            "osascript",
            "-e",
            "with timeout of 15 seconds\n"
            'tell application "System Events"\n'
            'tell process "Freeform"\n'
            + body
            + "\nend tell\nend tell\nend timeout",
        ],
        20,
    )


run("macos", ["sw_vers"])
run(
    "freeform-version",
    [
        "defaults",
        "read",
        "/System/Applications/Freeform.app/Contents/Info",
        "CFBundleShortVersionString",
    ],
)
run("launch", ["open", "-a", "/System/Applications/Freeform.app"])
run("activate", ["osascript", "-e", 'tell application "Freeform" to activate'])
dump = out / "dump"
run(
    "compile-dump",
    ["xcrun", "swiftc", "tools/freeform-experiment/dump.swift", "-o", str(dump)],
    90,
)
ui("permission", "return name of every menu bar item of menu bar 1")
ui(
    "welcome",
    'if exists static text "Welcome to Freeform" of group 1 of front window then\n'
    "click at {510, 635}\n"
    "delay 2\n"
    "end if",
)
ui(
    "new-board",
    'click menu item "New Board" of menu "File" of menu bar item "File" of menu bar 1\n'
    "delay 1\n"
    "set position of front window to {0, 25}\n"
    "set size of front window to {1000, 680}\n"
    "delay 1",
)
ui(
    "create-labelled-shapes",
    'click menu item "Rectangle" of menu "Shape" of menu item "Shape" of menu "Insert" of menu bar item "Insert" of menu bar 1\n'
    "delay 0.5\n"
    "repeat 10 times\nkey code 123 using shift down\nend repeat\n"
    'keystroke "Source"\n'
    "key code 53\n"
    'click menu item "Oval" of menu "Shape" of menu item "Shape" of menu "Insert" of menu bar item "Insert" of menu bar 1\n'
    "delay 0.5\n"
    "repeat 10 times\nkey code 124 using shift down\nend repeat\n"
    'keystroke "Target"\n'
    "key code 53\n"
    'keystroke "a" using command down\n'
    'click menu item "Connection Line" of menu "Insert" of menu bar item "Insert" of menu bar 1\n'
    "delay 1",
)
run("board-screen", ["screencapture", "-x", str(out / "board.png")])
run("clear", [str(dump), str(out / "capture"), "--clear"])
ui(
    "copy",
    "key code 53\n"
    'keystroke "a" using command down\n'
    'keystroke "c" using command down\n'
    "delay 1",
)
run("dump", [str(dump), str(out / "capture")])
run("capture-screen", ["screencapture", "-x", str(out / "capture.png")])
ui("tree", "return entire contents of front window")
(out / "summary.json").write_text(
    json.dumps(
        {
            "verified": False,
            "expectedLabels": ["Source", "Target"],
            "expectedObjects": ["rectangle", "oval", "connection line"],
            "provenance": "Fresh Freeform UI objects copied through NSPasteboard. Promote only after screenshot, manifest and payload inspection.",
        },
        indent=2,
    )
)
