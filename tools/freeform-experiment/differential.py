"""Real Freeform table differentials and discovery of native drawing controls."""
import json
import os
from pathlib import Path
import subprocess

out = Path(os.environ["CAPTURE_OUTPUT"])
out.mkdir(parents=True, exist_ok=True)


def run(name, args, timeout=30):
    try:
        p = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
        result = {"exitCode": p.returncode, "stdout": p.stdout, "stderr": p.stderr}
    except subprocess.TimeoutExpired:
        result = {"error": "timeout", "seconds": timeout}
    (out / (name + ".json")).write_text(json.dumps(result, indent=2))
    return result


def ui(name, body):
    return run(name, ["osascript", "-e", 'with timeout of 15 seconds\ntell application "System Events"\ntell process "Freeform"\n' + body + '\nend tell\nend tell\nend timeout'], 20)


run("macos", ["sw_vers"])
run("launch", ["open", "-a", "/System/Applications/Freeform.app"])
run("activate", ["osascript", "-e", 'tell application "Freeform" to activate'])
dump = out / "dump"
drag = out / "drag"
for source, binary in [("dump.swift", dump), ("drag.swift", drag)]:
    if run("compile-" + source, ["xcrun", "swiftc", "tools/freeform-experiment/" + source, "-o", str(binary)], 90).get("exitCode") != 0:
        raise SystemExit("Native tool did not compile; inspect artifact")
probe = ui("ui-permission", 'return name of every menu bar item of menu bar 1')
if probe.get("exitCode") != 0:
    raise SystemExit("UI access blocked; inspect exact OS error in artifact")
ui("welcome", 'if exists static text "Welcome to Freeform" of group 1 of front window then\nclick at {510, 635}\ndelay 2\nend if')
ui("new", 'click menu item "New Board" of menu "File" of menu bar item "File" of menu bar 1\ndelay 1')
# Expand the window so the complete table and toolbar can be inspected.
ui("window", 'set position of front window to {0, 25}\nset size of front window to {1000, 680}\ndelay 1')
ui("insert-table", 'click menu item "Table" of menu "Insert" of menu bar item "Insert" of menu bar 1\ndelay 1')
run("table-initial-screen", ["screencapture", "-x", str(out / "table-initial.png")])
ui("table-initial-tree", 'return entire contents of front window')


def capture(name):
    run(name + "-clear", [str(dump), str(out / name), "--clear"])
    ui(name + "-copy", 'key code 53\nclick at {300, 100}\nkeystroke "a" using command down\ndelay 0.5\nkeystroke "c" using command down\ndelay 1')
    run(name + "-dump", [str(dump), str(out / name)])
    run(name + "-screen", ["screencapture", "-x", str(out / (name + ".png"))])


capture("table-empty")
ui("ink-menu-inventory", 'return entire contents of menu bar 1')
ui("ink-toolbar-inventory", 'return entire contents of toolbar 1 of front window')
run("tool-screen", ["screencapture", "-x", str(out / "tools.png")])
(out / "summary.json").write_text(json.dumps({
    "stage": "Discover full table cell geometry and native drawing controls before editing",
    "tableVerified": False, "inkVerified": False, "pressureVerified": False,
    "importedDrawingUsed": False,
}, indent=2))
