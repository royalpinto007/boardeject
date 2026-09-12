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

results["cases"] = {name: "not attempted: capability probe only" for name in ["nested-transformed-group", "bound-connectors", "rich-text", "table-values", "variable-width-erased-ink"]}
results["capturesVerified"] = False
(output / "summary.json").write_text(json.dumps(results, indent=2))
print(json.dumps(results, indent=2))
