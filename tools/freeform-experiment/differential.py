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
cells = [("A1", 450, 250), ("B1", 800, 250), ("A2", 450, 500), ("B2", 800, 500)]


def set_cell(label, x, y, value):
    ui(label + "-unfocus", 'click at {300, 100}\ndelay 0.5')
    run(label + "-enter", [str(drag), str(x), str(y), str(x), str(y), "--double"])
    ui(label + "-type", 'delay 0.5\nkeystroke "a" using command down\nkeystroke "' + value + '"\ndelay 0.5\nkey code 53')


for cell, x, y in cells:
    set_cell("initial-" + cell, x, y, cell)
capture("table-baseline")
for index, (cell, x, y) in enumerate(cells):
    set_cell("change-" + cell, x, y, "X" + str(index + 1))
    capture("table-change-" + cell)
    set_cell("restore-" + cell, x, y, cell)
    capture("table-restore-" + cell)

# Inspect the shapes popover as well as menus: a vector pen is not necessarily ink.
ui("shapes-open", 'key code 53\nclick at {580, 57}\ndelay 1')
ui("shapes-tree", 'return entire contents of front window')
run("shapes-screen", ["screencapture", "-x", str(out / "shapes.png")])
ui("shapes-close", 'key code 53')
ui("ink-new", 'click menu item "New Board" of menu "File" of menu bar item "File" of menu bar 1\ndelay 1')
ui("ink-pen", 'click at {580, 57}\ndelay 1')
run("ink-pen-native-click", [str(drag), "580", "513", "580", "513"])
ui("ink-pen-settle", 'delay 1')
ui("ink-pen-tree", 'return entire contents of front window')
run("ink-pen-screen", ["screencapture", "-x", str(out / "ink-pen.png")])
for index, points in enumerate([(400, 250, 700, 300), (450, 380, 750, 380), (450, 480, 650, 550)]):
    run("ink-native-drag-" + str(index), [str(drag), *map(str, points)])
    ui("ink-finish-stroke-" + str(index), 'key code 53\ndelay 0.5')
    if index < 2:
        ui("ink-reselect-pen-" + str(index), 'click at {580, 57}\ndelay 0.5')
        run("ink-reselect-native-" + str(index), [str(drag), "580", "513", "580", "513"])
capture("ink-own-pen-before")
ui("ink-after-tree", 'return entire contents of front window')
ui("ink-menu-inventory", 'return entire contents of menu bar 1')
ui("ink-toolbar-inventory", 'return entire contents of toolbar 1 of front window')
run("tool-screen", ["screencapture", "-x", str(out / "tools.png")])
(out / "summary.json").write_text(json.dumps({
    "stage": "Differential cell edits attempted; verify every payload against the intended grid before interpreting changes",
    "tableVerified": False, "inkVerified": False, "pressureVerified": False,
    "importedDrawingUsed": False,
}, indent=2))
