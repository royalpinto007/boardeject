"""Issue #15 native table capture and UI discovery.

Every named capture follows a single deliberate mutation. Generated artifacts
remain experimental until screenshots, public text/RTF, and decoded records all
confirm that Freeform performed the requested action.
"""

import json
import os
from pathlib import Path
import subprocess

from table_records import inspect


out = Path(os.environ["CAPTURE_OUTPUT"])
out.mkdir(parents=True, exist_ok=True)


def run(name, args, timeout=30):
    try:
        process = subprocess.run(
            args, capture_output=True, text=True, timeout=timeout
        )
        result = {
            "exitCode": process.returncode,
            "stdout": process.stdout,
            "stderr": process.stderr,
        }
    except subprocess.TimeoutExpired:
        result = {"error": "timeout", "seconds": timeout}
    (out / f"{name}.json").write_text(json.dumps(result, indent=2))
    return result


def ui(name, body):
    source = (
        'with timeout of 15 seconds\n'
        'tell application "System Events"\n'
        'tell process "Freeform"\n'
        f"{body}\n"
        "end tell\nend tell\nend timeout"
    )
    return run(name, ["osascript", "-e", source], 20)


run("macos", ["sw_vers"])
run("launch", ["open", "-a", "/System/Applications/Freeform.app"])
run("activate", ["osascript", "-e", 'tell application "Freeform" to activate'])
dump = out / "dump"
drag = out / "drag"
for source, binary in [("dump.swift", dump), ("drag.swift", drag)]:
    result = run(
        f"compile-{source}",
        ["xcrun", "swiftc", f"tools/freeform-experiment/{source}", "-o", str(binary)],
        90,
    )
    if result.get("exitCode") != 0:
        raise SystemExit("Native capture tool failed to compile")

if ui("ui-permission", "return name of every menu bar item of menu bar 1").get(
    "exitCode"
) != 0:
    raise SystemExit("Freeform UI automation is unavailable")
ui(
    "welcome",
    'if exists static text "Welcome to Freeform" of group 1 of front window then\n'
    "click at {510, 635}\ndelay 2\nend if",
)


def new_table():
    ui(
        "new-board",
        'click menu item "New Board" of menu "File" of menu bar item "File" '
        "of menu bar 1\ndelay 1\n"
        "set position of front window to {0, 25}\n"
        "set size of front window to {1000, 680}\ndelay 1\n"
        'click menu item "Table" of menu "Insert" of menu bar item "Insert" '
        "of menu bar 1\ndelay 1",
    )


def select_cell(name, x, y):
    run(name, [str(drag), str(x), str(y), str(x), str(y), "--double"])
    ui(f"{name}-settle", "delay 0.5")


def set_cell(name, x, y, value, multiline=False):
    select_cell(f"{name}-select", x, y)
    commands = ['keystroke "a" using command down']
    if multiline:
        first, second = value.split("\n", 1)
        commands.extend(
            [f'keystroke "{first}"', "key code 36 using option down", f'keystroke "{second}"']
        )
    else:
        commands.append(f'keystroke "{value}"')
    commands.extend(["delay 0.5", "key code 53"])
    ui(f"{name}-type", "\n".join(commands))


def table_menu(name, item):
    return ui(
        name,
        f'click menu item "{item}" of menu "Table" of menu item "Table" '
        'of menu "Format" of menu bar item "Format" of menu bar 1\ndelay 1',
    )


def format_menu(name, submenu, item):
    return ui(
        name,
        f'click menu item "{item}" of menu "{submenu}" of menu item "{submenu}" '
        'of menu "Format" of menu bar item "Format" of menu bar 1\ndelay 1',
    )


def capture(name):
    run(f"{name}-clear", [str(dump), str(out / name), "--clear"])
    ui(
        f"{name}-copy",
        "key code 53\nclick at {300, 100}\n"
        'keystroke "a" using command down\ndelay 0.5\n'
        'keystroke "c" using command down\ndelay 1',
    )
    run(f"{name}-dump", [str(dump), str(out / name)])
    run(f"{name}-screen", ["screencapture", "-x", str(out / f"{name}.png")])
    try:
        manifest = json.loads((out / name / "manifest.json").read_text())
        flavor = next(
            entry
            for entry in manifest["flavors"]
            if entry["uti"] == "com.apple.freeform.CRLNativeData"
        )
        decoded = inspect(out / name / flavor["file"])
        (out / f"{name}-records.json").write_text(
            json.dumps({"decoded": decoded}, indent=2)
        )
    except Exception as error:
        (out / f"{name}-records.json").write_text(
            json.dumps({"unsupported": type(error).__name__, "message": str(error)}, indent=2)
        )


cells = [("A1", 450, 250), ("B1", 800, 250), ("A2", 450, 500), ("B2", 800, 500)]


def fill_baseline():
    for value, x, y in cells:
        set_cell(f"baseline-{value}", x, y, value)


if os.environ.get("TABLE_ISSUE15_PHASE") == "geometry":
    # Coordinates come from the selected-table screenshot at 100 percent zoom:
    # table bounds x=280..969, y=138..653, with dividers x=624 and y=395.
    # Each mutation gets a fresh board and a separate before/after capture.
    new_table()
    fill_baseline()
    capture("unequal-columns-before")
    run("unequal-columns-drag", [str(drag), "624", "300", "524", "300"])
    capture("unequal-columns-after")

    new_table()
    fill_baseline()
    capture("unequal-rows-before")
    run("unequal-rows-drag", [str(drag), "500", "395", "500", "295"])
    capture("unequal-rows-after")

    new_table()
    fill_baseline()
    run("unequal-both-column-drag", [str(drag), "624", "300", "524", "300"])
    run("unequal-both-row-drag", [str(drag), "500", "395", "500", "295"])
    capture("unequal-both-after")

    new_table()
    fill_baseline()
    capture("row-add-before")
    run("row-add-click", [str(drag), "256", "678", "256", "678"])
    capture("row-add-after")

    new_table()
    fill_baseline()
    capture("column-add-before")
    run("column-add-click", [str(drag), "992", "113", "992", "113"])
    capture("column-add-after")

    new_table()
    fill_baseline()
    capture("row-delete-before")
    run("row-handle-click", [str(drag), "256", "267", "256", "267"])
    ui("row-handle-dismiss", "key code 53\ndelay 0.5")
    table_menu("row-handle-delete", "Delete Row")
    capture("row-delete-after")

    new_table()
    fill_baseline()
    capture("column-delete-before")
    run("column-handle-click", [str(drag), "459", "113", "459", "113"])
    ui("column-handle-dismiss", "key code 53\ndelay 0.5")
    table_menu("column-handle-delete", "Delete Column")
    capture("column-delete-after")

    new_table()
    fill_baseline()
    capture("row-reorder-before")
    run("row-reorder-drag", [str(drag), "256", "267", "256", "525"])
    capture("row-reorder-after")

    new_table()
    fill_baseline()
    capture("column-reorder-before")
    run("column-reorder-drag", [str(drag), "459", "113", "803", "113"])
    capture("column-reorder-after")

    (out / "summary.json").write_text(
        json.dumps(
            {
                "stage": "Issue 15 geometry and structure differentials",
                "verifiedFixture": False,
                "rule": "A successful process exit is not evidence; decoded dimensions/order and screenshots must agree",
            },
            indent=2,
        )
    )
    raise SystemExit(0)


# Empty cells and multiline content, each captured against the same 2x2 shape.
new_table()
capture("empty-baseline")
fill_baseline()
capture("content-baseline")
set_cell("multiline-A1", 450, 250, "TOP\nBOTTOM", multiline=True)
capture("multiline-A1")

# Row insertion and deletion use Freeform's own table menu.
new_table()
fill_baseline()
capture("row-before-insert")
select_cell("row-select-A2", 450, 500)
table_menu("row-insert", "Add Row Below")
capture("row-after-insert")
select_cell("row-delete-select", 450, 590)
table_menu("row-delete", "Delete Row")
capture("row-after-delete")

# Column insertion and deletion use Freeform's own table menu.
new_table()
fill_baseline()
capture("column-before-insert")
select_cell("column-select-B1", 800, 250)
table_menu("column-insert", "Add Column After")
capture("column-after-insert")
select_cell("column-delete-select", 900, 250)
table_menu("column-delete", "Delete Column")
capture("column-after-delete")

# Inspect actual resize UI before attempting to supply a value. A resize is not
# evidence unless the decoded record changes and the screenshot confirms it.
new_table()
fill_baseline()
capture("resize-baseline")
select_cell("resize-column-select", 450, 250)
table_menu("resize-column-open", "Resize Columns")
ui("resize-column-tree", "return entire contents of front window")
run("resize-column-screen", ["screencapture", "-x", str(out / "resize-column.png")])
ui("resize-column-dismiss", "key code 53\ndelay 0.5")
select_cell("resize-row-select", 450, 250)
table_menu("resize-row-open", "Resize Rows")
ui("resize-row-tree", "return entire contents of front window")
run("resize-row-screen", ["screencapture", "-x", str(out / "resize-row.png")])
ui("resize-row-dismiss", "key code 53\ndelay 0.5")

# Text-format commands are captured independently with undo restoration.
for slug, submenu, item in [
    ("bold", "Font", "Bold"),
    ("italic", "Font", "Italic"),
    ("font-bigger", "Font", "Bigger"),
    ("align-left", "Text", "Align Left"),
]:
    select_cell(f"{slug}-select", 450, 250)
    ui(f"{slug}-select-text", 'keystroke "a" using command down')
    format_menu(f"{slug}-apply", submenu, item)
    capture(f"format-{slug}")
    ui(f"{slug}-undo", 'keystroke "z" using command down\ndelay 1')

# Capture the formatting controls exposed for a selected table/cell.
select_cell("format-controls-select", 450, 250)
ui("format-controls-tree", "return entire contents of front window")
ui("format-menu-tree", 'return entire contents of menu "Format" of menu bar item "Format" of menu bar 1')
run("format-controls-screen", ["screencapture", "-x", str(out / "format-controls.png")])

# Multiple tables are copied as one real selection. Production recovery is
# expected to reject this until native object boundaries are proven.
new_table()
fill_baseline()
ui(
    "second-table",
    "click at {300, 100}\n"
    'click menu item "Table" of menu "Insert" of menu bar item "Insert" '
    "of menu bar 1\ndelay 1",
)
capture("multiple-tables")

(out / "summary.json").write_text(
    json.dumps(
        {
            "stage": "Issue 15 discovery capture",
            "verifiedFixture": False,
            "rule": "Promote only cases whose screenshot, text/RTF, and decoded native differential agree",
        },
        indent=2,
    )
)
