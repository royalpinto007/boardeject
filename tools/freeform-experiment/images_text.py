"""Minimal real Freeform image/text copies; outputs stay experimental artifacts."""
import json
import os
from pathlib import Path
import struct
import subprocess
import zlib

out = Path(os.environ["CAPTURE_OUTPUT"])
out.mkdir(parents=True, exist_ok=True)


def run(name, args, timeout=30):
    try:
        result = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
        record = {"exitCode": result.returncode, "stdout": result.stdout, "stderr": result.stderr}
    except subprocess.TimeoutExpired:
        record = {"error": "timeout", "seconds": timeout}
    (out / (name + ".json")).write_text(json.dumps(record, indent=2))
    if record.get("exitCode") != 0:
        raise SystemExit("Capture stopped: " + name + "; inspect artifact for exact error")
    return record


def ui(name, body):
    return run(name, ["osascript", "-e", 'with timeout of 15 seconds\ntell application "System Events"\ntell process "Freeform"\n' + body + '\nend tell\nend tell\nend timeout'], 20)


run("macos", ["sw_vers"])
run("freeform-version", ["defaults", "read", "/System/Applications/Freeform.app/Contents/Info", "CFBundleShortVersionString"])
run("launch", ["open", "-a", "/System/Applications/Freeform.app"])
run("activate", ["osascript", "-e", 'tell application "Freeform" to activate'])
dump = out / "dump"
run("compile-dump", ["xcrun", "swiftc", "tools/freeform-experiment/dump.swift", "-o", str(dump)], 90)
ui("permission", 'return name of every menu bar item of menu bar 1')
ui("welcome", 'if exists static text "Welcome to Freeform" of group 1 of front window then\nclick at {510, 635}\ndelay 2\nend if')


def new_board(name):
    ui(name + "-new", 'click menu item "New Board" of menu "File" of menu bar item "File" of menu bar 1\ndelay 1\nset position of front window to {0, 25}\nset size of front window to {1000, 680}')


def capture(name):
    run(name + "-clear", [str(dump), str(out / name), "--clear"])
    ui(name + "-copy", 'key code 53\nclick at {300, 100}\nkeystroke "a" using command down\ndelay 0.5\nkeystroke "c" using command down\ndelay 1')
    run(name + "-dump", [str(dump), str(out / name)])
    run(name + "-screen", ["screencapture", "-x", str(out / (name + ".png"))])
    ui(name + "-tree", 'return entire contents of front window')


# Deliberately generated source art, then inserted and copied by real Freeform.
# This PNG itself is not a native clipboard fixture.
def chunk(kind, data):
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))


pixels = b"".join(b"\0" + b"".join(bytes((220, 40, 60, 255)) if x < 32 else bytes((30, 100, 210, 128)) for x in range(64)) for _ in range(48))
png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 64, 48, 8, 6, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(pixels)) + chunk(b"IEND", b"")
source = out / "source-image.png"
source.write_bytes(png)
new_board("image")
run("image-clipboard", ["osascript", "-e", 'set the clipboard to (read POSIX file ' + json.dumps(str(source)) + ' as «class PNGf»)'])
ui("image-paste", 'keystroke "v" using command down\ndelay 2')
capture("image-baseline")
ui("image-move", 'repeat 10 times\nkey code 124\nend repeat\ndelay 0.5')
capture("image-moved")

new_board("text")
ui("text-insert", 'click menu item "Text Box" of menu "Insert" of menu bar item "Insert" of menu bar 1\ndelay 0.5\nkeystroke "Plain Bold Italic"\ndelay 0.5\nkey code 53')
capture("text-plain")
ui("text-bold", 'keystroke "b" using command down\ndelay 0.5')
capture("text-bold")
new_board("mixed-text")
ui("mixed-text-insert", 'click menu item "Text Box" of menu "Insert" of menu bar item "Insert" of menu bar 1\ndelay 0.5\nkeystroke "Plain "\nkeystroke "b" using command down\nkeystroke "Bold "\nkeystroke "b" using command down\nkeystroke "i" using command down\nkeystroke "Italic"\nkey code 53\ndelay 0.5')
capture("text-mixed")
(out / "summary.json").write_text(json.dumps({"verified": False, "origin": "Real Freeform UI copy attempts; inspect images, payloads and action logs before promotion", "sourceImage": "Generated two-color 64x48 RGBA PNG", "expectedText": "Plain Bold Italic"}, indent=2))
