"""Bounded, manual hosted-runner GUI experiment. Never changes TCC or signs in."""
import json
import os
from pathlib import Path
import subprocess

output = Path(os.environ["CAPTURE_OUTPUT"])
output.mkdir(parents=True, exist_ok=True)
results = {}


def run(name, args, timeout=30):
    try:
        completed = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
        result = {"exitCode": completed.returncode, "stdout": completed.stdout, "stderr": completed.stderr}
    except subprocess.TimeoutExpired as error:
        result = {"timeoutSeconds": timeout, "stdout": str(error.stdout or ""), "stderr": str(error.stderr or "")}
    results[name] = result
    (output / (name + ".json")).write_text(json.dumps(result, indent=2))
    return result


def script(name, source):
    return run(name, ["osascript", "-e", "with timeout of 15 seconds\n" + source + "\nend timeout"], 20)


run("macos", ["sw_vers"])
run("console-owner", ["stat", "-f", "%Su", "/dev/console"])
app = Path("/System/Applications/Freeform.app")
if not app.is_dir():
    results["blocked"] = "Freeform.app is absent at the requested path."
else:
    run("freeform-version", ["defaults", "read", str(app / "Contents/Info"), "CFBundleShortVersionString"])
    run("launch", ["open", "-a", str(app)])
    binary = output / "permission-probe"
    compile_result = run("compile", ["xcrun", "swiftc", "tools/freeform-experiment/probe.swift", "-o", str(binary)], 90)
    if compile_result.get("exitCode") == 0:
        run("native-permissions", [str(binary)])
    script("activate", 'tell application "Freeform" to activate')
    ui = script("accessibility-tree", 'tell application "System Events"\n tell process "Freeform"\n return {name of every window, name of every menu bar item of menu bar 1}\n end tell\nend tell')
    events = script("keyboard-probe", 'tell application "System Events"\n tell process "Freeform"\n set frontmost to true\n key code 53\n end tell\nend tell')
    if ui.get("exitCode") != 0 or events.get("exitCode") != 0:
        results["blocked"] = "Freeform UI enumeration or keyboard control failed. See accessibility-tree.json and keyboard-probe.json for exact OS errors. No test boards or captures were fabricated."
    else:
        # Discover actual menus before attempting version-dependent UI commands.
        script("menu-inventory", 'tell application "System Events"\n tell process "Freeform"\n return entire contents of menu bar 1\n end tell\nend tell')
        results["nextStep"] = "UI access passed. Inspect actual menus and onboarding state before adding test-case interactions. No semantic capture is claimed by this probe."
        def ui_action(name, action):
            return script(name, 'tell application "System Events"\n tell process "Freeform"\n' + action + '\n end tell\nend tell')

        dumper = output / "pasteboard-dump"
        run("compile-dumper", ["xcrun", "swiftc", "tools/freeform-experiment/dump.swift", "-o", str(dumper)], 90)
        ui_action("onboarding", 'if exists static text "Welcome to Freeform" of group 1 of front window then\n click at {510, 635}\n delay 2\nend if\nreturn entire contents of front window')
        ui_action("new-board", 'click menu item "New Board" of menu "File" of menu bar item "File" of menu bar 1\ndelay 2\nreturn entire contents of front window')
        run("board-screen", ["screencapture", "-x", str(output / "board.png")])
        for case, action in [
            ("bound-connectors", 'click menu item "Rectangle" of menu "Shape" of menu item "Shape" of menu "Insert" of menu bar item "Insert" of menu bar 1\nkey code 123 using shift down\nclick menu item "Oval" of menu "Shape" of menu item "Shape" of menu "Insert" of menu bar item "Insert" of menu bar 1\nkey code 124 using shift down\nkeystroke "a" using command down\nclick menu item "Connection Line" of menu "Insert" of menu bar item "Insert" of menu bar 1'),
            ("rich-text", 'click menu item "Text Box" of menu "Insert" of menu bar item "Insert" of menu bar 1\nkeystroke "BoardEject native text 123"\nkeystroke "a" using command down\nkeystroke "b" using command down\nkey code 53'),
            ("table-values", 'click menu item "Table" of menu "Insert" of menu bar item "Insert" of menu bar 1\nkeystroke "Cell A1"\nkey code 48\nkeystroke "Cell B1"\nkey code 53'),
            ("nested-transformed-group", 'click menu item "Rectangle" of menu "Shape" of menu item "Shape" of menu "Insert" of menu bar item "Insert" of menu bar 1\nclick menu item "Oval" of menu "Shape" of menu item "Shape" of menu "Insert" of menu bar item "Insert" of menu bar 1\nkeystroke "a" using command down\nclick menu item "Group" of menu "Arrange" of menu bar item "Arrange" of menu bar 1\nclick menu item "Rectangle" of menu "Shape" of menu item "Shape" of menu "Insert" of menu bar item "Insert" of menu bar 1\nkeystroke "a" using command down\nclick menu item "Group" of menu "Arrange" of menu bar item "Arrange" of menu bar 1\nkey code 124 using shift down'),
        ]:
            ui_action(case + "-new", 'click menu item "New Board" of menu "File" of menu bar item "File" of menu bar 1\ndelay 1')
            run(case + "-clear", [str(dumper), str(output / case), "--clear"])
            ui_action(case + "-edit", action)
            ui_action(case + "-copy", 'key code 53\nkeystroke "a" using command down\nkeystroke "c" using command down\ndelay 1\nreturn entire contents of front window')
            run(case + "-dump", [str(dumper), str(output / case)])
            run(case + "-screen", ["screencapture", "-x", str(output / (case + ".png"))])
        ui_action("ink-controls", 'return {name of every menu item of menu "Insert" of menu bar item "Insert" of menu bar 1, entire contents of front window}')
        results["inkLimitation"] = "No pen/eraser creation command was observed in the macOS Insert menu. No fabricated PKDrawing is injected. Variable-width/erasure capture remains unverified."
        results["transformLimitation"] = "Nested grouping and keyboard translation attempted. Rotation and scale are not yet driven or verified by this UI recipe."

results["cases"] = {name: ("UI commands attempted; inspect logs and manifest, not verified" if name + "-edit" in results else "not attempted") for name in ["nested-transformed-group", "bound-connectors", "rich-text", "table-values", "variable-width-erased-ink"]}
results["capturesVerified"] = False
(output / "summary.json").write_text(json.dumps(results, indent=2))
print(json.dumps(results, indent=2))
