"""Create one test board, then inspect only a byte-stable copy of Freeform storage."""

import hashlib
import json
import os
from pathlib import Path
import sqlite3
import subprocess

out = Path(os.environ["CAPTURE_OUTPUT"])
out.mkdir(parents=True, exist_ok=True)
results: dict[str, object] = {}


def run(name: str, args: list[str], timeout: int = 60) -> subprocess.CompletedProcess[str]:
    try:
        completed = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
        record: dict[str, object] = {
            "exitCode": completed.returncode,
            "stdout": completed.stdout,
            "stderr": completed.stderr,
        }
    except subprocess.TimeoutExpired as error:
        record = {"timeoutSeconds": timeout, "stdout": str(error.stdout or ""), "stderr": str(error.stderr or "")}
        completed = subprocess.CompletedProcess(args, 124, "", "timeout")
    results[name] = record
    return completed


def ui(name: str, body: str) -> subprocess.CompletedProcess[str]:
    return run(
        name,
        [
            "osascript",
            "-e",
            'with timeout of 20 seconds\ntell application "System Events"\ntell process "Freeform"\n'
            + body
            + "\nend tell\nend tell\nend timeout",
        ],
        25,
    )


run("macos", ["sw_vers"])
run("freeform-version", ["defaults", "read", "/System/Applications/Freeform.app/Contents/Info", "CFBundleShortVersionString"])
run("launch", ["open", "-a", "/System/Applications/Freeform.app"])
run("activate", ["osascript", "-e", 'tell application "Freeform" to activate'])
probe = ui("ui-permission", 'return name of every menu bar item of menu bar 1')
if probe.returncode != 0:
    raise SystemExit("Freeform UI automation unavailable; inspect ui-permission.json in the workflow log.")
ui("welcome", 'if exists static text "Welcome to Freeform" of group 1 of front window then\nclick at {510, 635}\ndelay 2\nend if')
ui("new-board", 'click menu item "New Board" of menu "File" of menu bar item "File" of menu bar 1\ndelay 2')
ui("file-menu-items", 'return name of every menu item of menu "File" of menu bar item "File" of menu bar 1')
ui("front-window-tree", 'return entire contents of front window')
ui(
    "title-accessibility",
    'set titleElement to static text 1 of group 1 of toolbar 1 of front window\n'
    'return {properties of titleElement, name of every action of titleElement}',
)
ui("insert-marker", 'click menu item "Text Box" of menu "Insert" of menu bar item "Insert" of menu bar 1\ndelay 1\nkeystroke "BoardEject archive storage fixture"\ndelay 2\nkey code 53')
ui("finish-marker", 'key code 53\ndelay 1')
pointer = out / "native-pointer"
pointer_compile = run("compile-native-pointer", ["xcrun", "swiftc", "tools/freeform-experiment/drag.swift", "-o", str(pointer)], 120)
if pointer_compile.returncode != 0:
    raise SystemExit("Native pointer helper did not compile.")
run("show-board-browser-click", [str(pointer), "303", "57", "303", "57", "--click"])
ui("show-board-browser", 'delay 3\nreturn entire contents of front window')
ui("browser-file-menu-items", 'return name of every menu item of menu "File" of menu bar item "File" of menu bar 1')
run("activate-title-editor", [str(pointer), "365", "303", "365", "303", "--double"])
ui(
    "rename-board",
    'keystroke "a" using command down\nkeystroke "BoardEject Archive Alpha"\n'
    'key code 36\ndelay 3\n'
    'set boardCard to button 1 of list 1 of list 1 of scroll area 2 of splitter group 1 of front window\n'
    'return value of static text 1 of boardCard',
)
run("screen", ["screencapture", "-x", str(out / "test-board.png")])

root = Path.home() / "Library" / "Group Containers" / "group.com.apple.freeform"
databases = sorted(
    path
    for path in root.rglob("*")
    if path.is_file() and not path.is_symlink() and path.suffix.lower() in {".db", ".sqlite", ".sqlite3"}
)
results["databaseCandidates"] = [str(path.relative_to(root)) for path in databases]
if not databases:
    raise SystemExit("No Freeform database candidate found after creating the test board.")

preferred = [path for path in databases if path.name == "boards.db"]
if len(preferred) != 1:
    raise SystemExit(f"Expected one boards.db candidate, found {len(preferred)}. No schema was guessed.")
database = preferred[0]
helper = out / "boardeject-archive-helper"
compile_result = run(
    "compile-helper",
    ["xcrun", "swiftc", "apps/archive-helper/main.swift", "-lsqlite3", "-o", str(helper)],
    120,
)
if compile_result.returncode != 0:
    raise SystemExit("Archive helper did not compile.")
snapshot = out / "native-snapshot"
copy_result = run("snapshot", [str(helper), "snapshot", str(database), str(snapshot)], 120)
if copy_result.returncode != 0:
    raise SystemExit("Stable native snapshot could not be obtained.")
catalog_result = run("catalog", [str(helper), "catalog", str(snapshot)], 120)
if catalog_result.returncode != 0:
    raise SystemExit("Copied Freeform database did not pass the verified catalogue gate.")
(out / "catalog-report.json").write_text(catalog_result.stdout)

copied_db = snapshot / "boards.db"
# `immutable=1` is deliberately not used: it can ignore committed schema and
# rows that still live in the copied WAL. `mode=ro` plus query_only reads the
# complete copied source set while SQLite rejects writes.
uri = f"file:{copied_db}?mode=ro"
connection = sqlite3.connect(uri, uri=True)
try:
    connection.execute("PRAGMA query_only=ON")
    query_only = int(connection.execute("PRAGMA query_only").fetchone()[0])
    try:
        connection.execute("CREATE TABLE boardeject_write_probe(value TEXT)")
        writeRejected = False
    except sqlite3.OperationalError as error:
        writeRejected = "readonly" in str(error).lower()
    if not writeRejected:
        raise SystemExit("Copied database did not reject the write probe.")
    user_version = int(connection.execute("PRAGMA user_version").fetchone()[0])
    quick_check = str(connection.execute("PRAGMA quick_check").fetchone()[0])
    schemas = [
        {"type": row[0], "name": row[1], "table": row[2], "sql": row[3]}
        for row in connection.execute(
            "SELECT type, name, tbl_name, sql FROM sqlite_schema "
            "WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name"
        )
    ]
finally:
    connection.close()

schema_json = json.dumps(schemas, sort_keys=True, separators=(",", ":"))
report = {
    "freeformVersion": str(
        (results.get("freeform-version") or {}).get("stdout", "")
        if isinstance(results.get("freeform-version"), dict)
        else ""
    ).strip(),
    "databaseRelativePath": str(database.relative_to(root)),
    "databaseUserVersion": user_version,
    "schemaFingerprint": hashlib.sha256(schema_json.encode()).hexdigest(),
    "quickCheck": quick_check,
    "schema": schemas,
    "sourceOpenedByBoardEject": False,
    "copiedDatabaseOpenedReadOnly": True,
    "queryOnly": query_only == 1,
    "writeProbeRejected": writeRejected,
    "compatibilityStatus": "unverified",
    "interpretation": "Genuine Freeform-created storage was copied stably and inspected read-only. Field semantics and board/asset mappings remain unverified.",
}
(out / "storage-report.json").write_text(json.dumps(report, indent=2, sort_keys=True))
(out / "run-report.json").write_text(json.dumps(results, indent=2, sort_keys=True))
print(json.dumps(report, indent=2, sort_keys=True))
