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


def select_once(name, x, y):
    run(name, [str(drag), str(x), str(y), str(x), str(y)])
    ui(f"{name}-settle", "delay 0.5")


if os.environ.get("TABLE_ISSUE15_PHASE") == "palettes":
    # A single-click cell selection exposes the fill-style dot near the center
    # of the selected cell. Inspect its palette without changing a value.
    new_table()
    fill_baseline()
    select_once("fill-cell-select", 450, 250)
    run("fill-cell-selected-screen", ["screencapture", "-x", str(out / "fill-cell-selected.png")])
    run("fill-palette-open", [str(drag), "439", "366", "439", "366"])
    ui("fill-palette-tree", "return entire contents of front window")
    run("fill-palette-screen", ["screencapture", "-x", str(out / "fill-palette.png")])

    # Text-edit mode exposes a separate text-color dot. Inspect it on a fresh
    # board so cell-fill and text-color controls cannot be confused.
    new_table()
    fill_baseline()
    select_cell("text-cell-select", 450, 250)
    ui("text-select-all", 'keystroke "a" using command down\ndelay 0.5')
    run("text-cell-selected-screen", ["screencapture", "-x", str(out / "text-cell-selected.png")])
    run("text-palette-open", [str(drag), "487", "426", "487", "426"])
    ui("text-palette-tree", "return entire contents of front window")
    run("text-palette-screen", ["screencapture", "-x", str(out / "text-palette.png")])

    (out / "summary.json").write_text(
        json.dumps(
            {
                "stage": "Issue 15 native table palette discovery",
                "verifiedFixture": False,
                "rule": "No style support is inferred before a deterministic swatch differential",
            },
            indent=2,
        )
    )
    raise SystemExit(0)


if os.environ.get("TABLE_ISSUE15_PHASE") == "rotation":
    # A real Command key-down is held before hovering over the corner handle,
    # matching Apple's documented rotation gesture. Each angle starts fresh.
    for slug, target_x, target_y in [
        ("small", 225, 235),
        ("large", 197, 344),
    ]:
        new_table()
        fill_baseline()
        capture(f"rotate-{slug}-before")
        run(
            f"rotate-{slug}-drag",
            [str(drag), "280", "138", str(target_x), str(target_y), "--command"],
        )
        capture(f"rotate-{slug}-after")
    (out / "summary.json").write_text(
        json.dumps(
            {
                "stage": "Issue 15 native table rotation differentials",
                "verifiedFixture": False,
                "rule": "Rotation requires a changed native rotation field and matching screenshot",
            },
            indent=2,
        )
    )
    raise SystemExit(0)


if os.environ.get("TABLE_ISSUE15_PHASE") == "advanced":
    # Discover the actual text-color palette from the verified contextual
    # toolbar location. No color is selected until its controls are known.
    new_table()
    fill_baseline()
    select_once("text-color-cell", 450, 250)
    run("text-color-open", [str(drag), "487", "426", "487", "426"])
    ui("text-color-tree", "return entire contents of front window")
    run("text-color-screen", ["screencapture", "-x", str(out / "text-color.png")])

    # Apple documents Command-dragging an item's selection handle as rotation.
    # Record before and after so table rotation is accepted only if the native
    # frame and screenshot both prove it.
    new_table()
    fill_baseline()
    capture("rotate-before")
    run("rotate-command-drag", [str(drag), "969", "653", "900", "700", "--command"])
    capture("rotate-after")

    # Retry row reorder with a confirmed whole-row selection and a drop past
    # the second-row midpoint.
    new_table()
    fill_baseline()
    capture("row-reorder-before")
    select_once("row-reorder-cell", 450, 250)
    ui(
        "row-reorder-select",
        'click menu item "Row" of menu "Select" of menu item "Select" '
        'of menu "Table" of menu item "Table" of menu "Format" '
        'of menu bar item "Format" of menu bar 1\ndelay 1',
    )
    run("row-reorder-drag", [str(drag), "256", "267", "256", "620"])
    capture("row-reorder-after")

    (out / "summary.json").write_text(
        json.dumps(
            {
                "stage": "Issue 15 advanced native table probes",
                "verifiedFixture": False,
                "rule": "Promote only native changes independently confirmed on screen",
            },
            indent=2,
        )
    )
    raise SystemExit(0)


if os.environ.get("TABLE_ISSUE15_PHASE") == "style-controls":
    new_table()
    fill_baseline()
    capture("style-baseline")
    for slug, item in [("align-center", "Align Center"), ("align-right", "Align Right")]:
        select_cell(f"{slug}-select", 450, 250)
        ui(f"{slug}-select-text", 'keystroke "a" using command down')
        format_menu(f"{slug}-apply", "Text", item)
        capture(slug)
        ui(f"{slug}-undo", 'keystroke "z" using command down\ndelay 1')

    # Inspect the contextual color control for a selected cell. A later run
    # will choose a deterministic swatch only after this UI is identified.
    select_once("cell-style-select", 450, 250)
    run("cell-style-screen", ["screencapture", "-x", str(out / "cell-style.png")])
    ui("cell-style-tree", "return entire contents of front window")
    run("cell-color-click", [str(drag), "438", "426", "438", "426"])
    ui("cell-color-tree", "return entire contents of front window")
    run("cell-color-screen", ["screencapture", "-x", str(out / "cell-color.png")])

    (out / "summary.json").write_text(
        json.dumps(
            {
                "stage": "Issue 15 native style differentials and control discovery",
                "verifiedFixture": False,
                "rule": "Promote only style changes proven by native records and screenshots",
            },
            indent=2,
        )
    )
    raise SystemExit(0)


if os.environ.get("TABLE_ISSUE15_PHASE") == "structure":
    # Structural commands require a selected cell, not text-edit mode. Each
    # command is isolated on a fresh table and verified only after capture.
    for slug, x, y, command in [
        ("row-insert", 450, 500, "Add Row Below"),
        ("row-delete", 450, 500, "Delete Row"),
        ("column-insert", 800, 250, "Add Column After"),
        ("column-delete", 800, 250, "Delete Column"),
    ]:
        new_table()
        fill_baseline()
        capture(f"{slug}-before")
        select_once(f"{slug}-select", x, y)
        table_menu(f"{slug}-apply", command)
        capture(f"{slug}-after")

    # Select an entire row through Freeform's own menu, then drag its visible
    # handle. This avoids the stale coordinate that blanked an earlier board.
    new_table()
    fill_baseline()
    capture("row-reorder-before")
    select_once("row-reorder-cell", 450, 250)
    format_menu("row-reorder-select", "Table", "Select")
    ui(
        "row-reorder-select-row",
        'click menu item "Row" of menu "Select" of menu item "Select" '
        'of menu "Table" of menu item "Table" of menu "Format" '
        'of menu bar item "Format" of menu bar 1\ndelay 1',
    )
    run("row-reorder-selected-screen", ["screencapture", "-x", str(out / "row-reorder-selected.png")])
    run("row-reorder-drag", [str(drag), "256", "267", "256", "525"])
    capture("row-reorder-after")

    (out / "summary.json").write_text(
        json.dumps(
            {
                "stage": "Issue 15 native structure differentials",
                "verifiedFixture": False,
                "rule": "A command is successful only when native records and screenshots confirm it",
            },
            indent=2,
        )
    )
    raise SystemExit(0)


if os.environ.get("TABLE_ISSUE15_PHASE") == "controls":
    # Discover Freeform's real controls before attempting further structural
    # mutations. Screenshots and accessibility output are evidence; clicks are
    # not considered successful unless a later clipboard differential agrees.
    new_table()
    fill_baseline()
    capture("controls-baseline")
    run("column-handle-click", [str(drag), "459", "113", "459", "113"])
    ui("column-handle-tree", "return entire contents of front window")
    run("column-handle-screen", ["screencapture", "-x", str(out / "column-handle.png")])
    ui("column-handle-format-menu", 'return entire contents of menu "Format" of menu bar item "Format" of menu bar 1')
    ui("column-handle-dismiss", "key code 53\ndelay 0.5")

    run("row-handle-click", [str(drag), "256", "267", "256", "267"])
    ui("row-handle-tree", "return entire contents of front window")
    run("row-handle-screen", ["screencapture", "-x", str(out / "row-handle.png")])
    ui("row-handle-format-menu", 'return entire contents of menu "Format" of menu bar item "Format" of menu bar 1')
    ui("row-handle-dismiss", "key code 53\ndelay 0.5")

    # The verified column resize moves the divider from x=624 to x=524. Retry
    # the row resize well inside the second column so it cannot select/move the
    # table through the vertical divider.
    new_table()
    fill_baseline()
    capture("unequal-both-before")
    run("unequal-both-column-drag", [str(drag), "624", "300", "524", "300"])
    run("unequal-both-row-drag", [str(drag), "700", "395", "700", "295"])
    capture("unequal-both-after")

    # Inventory table and arrange commands while the table is selected. This
    # establishes whether merge and rotation are exposed by Freeform 4.5.
    ui("select-table", "click at {300, 100}\ndelay 0.5")
    ui("table-menu-tree", 'return entire contents of menu "Table" of menu item "Table" of menu "Format" of menu bar item "Format" of menu bar 1')
    ui("arrange-menu-tree", 'return entire contents of menu "Arrange" of menu bar item "Arrange" of menu bar 1')
    (out / "summary.json").write_text(
        json.dumps(
            {
                "stage": "Issue 15 native control discovery",
                "verifiedFixture": False,
                "rule": "Promote only mutations confirmed by clipboard records and screenshots",
            },
            indent=2,
        )
    )
    raise SystemExit(0)


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
