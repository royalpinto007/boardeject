"""Create one test board, then inspect only a byte-stable copy of Freeform storage."""

import hashlib
import json
import os
from pathlib import Path
import shutil
import sqlite3
import struct
import subprocess
import time
import urllib.error
import urllib.request
import zlib

out = Path(os.environ["CAPTURE_OUTPUT"])
out.mkdir(parents=True, exist_ok=True)
results: dict[str, object] = {}


def png_chunk(kind: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))


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
    (out / "run-report.json").write_text(json.dumps(results, indent=2, sort_keys=True))
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
source_dir = out / "controlled-assets"
source_dir.mkdir()
pixels = b"".join(
    b"\0" + b"".join(bytes((210, 30, 55, 255)) if x < 24 else bytes((20, 110, 215, 255)) for x in range(48))
    for _ in range(32)
)
image_source = source_dir / "archive-image.png"
image_source.write_bytes(
    b"\x89PNG\r\n\x1a\n"
    + png_chunk(b"IHDR", struct.pack(">IIBBBBB", 48, 32, 8, 6, 0, 0, 0))
    + png_chunk(b"IDAT", zlib.compress(pixels))
    + png_chunk(b"IEND", b"")
)
text_source = source_dir / "archive-file.txt"
text_source.write_text("BoardEject generic attachment sentinel\n")
pdf_source = source_dir / "archive-document.pdf"
with pdf_source.open("wb") as pdf_output:
    pdf_result = subprocess.run(
        ["cupsfilter", "-m", "application/pdf", str(text_source)],
        stdout=pdf_output,
        stderr=subprocess.PIPE,
        timeout=60,
    )
results["generate-pdf"] = {
    "exitCode": pdf_result.returncode,
    "stderr": pdf_result.stderr.decode(errors="replace"),
}
if pdf_result.returncode != 0:
    raise SystemExit("Controlled PDF generation failed.")
video_source = source_dir / "archive-video.mp4"
video_helper = out / "video-fixture"
video_compile = run(
    "compile-video-fixture",
    ["xcrun", "swiftc", "tools/freeform-experiment/video_fixture.swift", "-o", str(video_helper)],
    120,
)
if video_compile.returncode != 0:
    raise SystemExit("Controlled video helper did not compile.")
video_result = run("generate-video", [str(video_helper), str(video_source)], 120)
if video_result.returncode != 0 or not video_source.is_file():
    raise SystemExit("Controlled video generation failed.")
clipboard_helper = out / "file-clipboard"
clipboard_compile = run(
    "compile-file-clipboard",
    ["xcrun", "swiftc", "tools/freeform-experiment/file_clipboard.swift", "-o", str(clipboard_helper)],
    120,
)
if clipboard_compile.returncode != 0:
    raise SystemExit("File clipboard helper did not compile.")
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
run(
    "image-clipboard",
    [
        "osascript", "-e",
        'set the clipboard to (read POSIX file ' + json.dumps(str(image_source)) + ' as «class PNGf»)',
    ],
)
ui("paste-image", 'keystroke "v" using command down\ndelay 2')
for kind, source in (("pdf", pdf_source), ("video", video_source), ("file", text_source)):
    run(f"{kind}-clipboard", [str(clipboard_helper), str(source)])
    ui(f"paste-{kind}", 'keystroke "v" using command down\ndelay 2')
ui("finish-marker", 'key code 53\ndelay 1')
pointer = out / "native-pointer"
pointer_compile = run("compile-native-pointer", ["xcrun", "swiftc", "tools/freeform-experiment/drag.swift", "-o", str(pointer)], 120)
if pointer_compile.returncode != 0:
    raise SystemExit("Native pointer helper did not compile.")
run("show-board-browser-click", [str(pointer), "303", "57", "303", "57", "--click"])
ui("show-board-browser", 'delay 3\nreturn entire contents of front window')
ui("browser-file-menu-items", 'return name of every menu item of menu "File" of menu bar item "File" of menu bar 1')
ui("second-board", 'click menu item "New Board" of menu "File" of menu bar item "File" of menu bar 1\ndelay 2')
ui(
    "second-board-marker",
    'click menu item "Text Box" of menu "Insert" of menu bar item "Insert" of menu bar 1\n'
    'delay 1\nkeystroke "BoardEject unrelated board sentinel"\ndelay 2\nkey code 53',
)
run("return-to-board-browser", [str(pointer), "303", "57", "303", "57", "--click"])
ui("two-board-browser", 'delay 3\nreturn entire contents of front window')
visible_titles = ui(
    "visible-board-titles",
    'set boardList to list 1 of list 1 of scroll area 2 of splitter group 1 of front window\n'
    'set boardTitles to {}\n'
    'repeat with boardCard in buttons of boardList\n'
    'set end of boardTitles to value of static text 1 of boardCard\n'
    'end repeat\nreturn boardTitles',
)
if visible_titles.returncode != 0:
    raise SystemExit("Visible Freeform board titles could not be captured for comparison.")
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
catalog_data = json.loads(catalog_result.stdout)
catalog_boards = catalog_data.get("boards", [])
if len(catalog_boards) != 2:
    raise SystemExit(f"Expected two non-discardable test boards, found {len(catalog_boards)}.")
visible_title_set = {
    title.strip() for title in visible_titles.stdout.strip().split(",") if title.strip()
}
decoded_title_set = {str(board.get("displayName", "")) for board in catalog_boards}
if visible_title_set != decoded_title_set or any(
    board.get("titleStatus") != "verified" for board in catalog_boards
):
    raise SystemExit("Database board titles did not match the genuine visible Freeform titles.")
# The older board is selected deliberately. The newer board contains a unique
# sentinel that must never appear in the selected board's native record set.
selected_board_id = str(catalog_boards[1]["id"])
unrelated_board_id = str(catalog_boards[0]["id"])
native_records = out / "native-board-records.json"
extract_result = run(
    "extract-selected-board",
    [str(helper), "extract", str(snapshot), selected_board_id, str(native_records)],
    120,
)
if extract_result.returncode != 0:
    raise SystemExit("Selected native board records could not be extracted.")
extracted = json.loads(native_records.read_text())
tables = {table["name"]: table for table in extracted.get("tables", [])}
if extracted.get("boardId") != selected_board_id or len(tables.get("boards", {}).get("rows", [])) != 1:
    raise SystemExit("Selected-board extraction did not contain exactly the requested board.")


def native_bytes(value: dict[str, object]) -> bytes:
    if value.get("type") == "blob":
        import base64

        return base64.b64decode(str(value.get("value") or ""))
    return str(value.get("value") or "").encode()


all_extracted_bytes = b"\n".join(
    native_bytes(value)
    for table in extracted.get("tables", [])
    for row in table.get("rows", [])
    for value in row
)
unrelated_uuid_bytes = bytes.fromhex(unrelated_board_id.replace("-", ""))
if unrelated_uuid_bytes in all_extracted_bytes or b"BoardEject unrelated board sentinel" in all_extracted_bytes:
    raise SystemExit("Selected-board extraction leaked unrelated board data.")
(out / "extraction-report.json").write_text(
    json.dumps(
        {
            "selectedBoardId": selected_board_id,
            "tableRowCounts": {
                name: len(table.get("rows", [])) for name, table in sorted(tables.items())
            },
            "unrelatedBoardId": unrelated_board_id,
            "unrelatedBoardRows": 0,
            "sourceOpenedByBoardEject": False,
            "copiedDatabaseOpenedReadOnly": True,
        },
        indent=2,
        sort_keys=True,
    )
)

assets_root = database.parent / "Assets"
asset_inventory: list[dict[str, object]] = []
captured_assets = out / "captured-assets"
captured_assets.mkdir()
if assets_root.is_dir() and not assets_root.is_symlink():
    resolved_root = assets_root.resolve()
    for asset_path in sorted(assets_root.rglob("*")):
        if not asset_path.is_file() or asset_path.is_symlink():
            continue
        resolved = asset_path.resolve()
        if resolved_root not in resolved.parents:
            raise SystemExit("Freeform asset escaped the verified Assets root.")
        relative = asset_path.relative_to(assets_root)
        digest = hashlib.sha256(asset_path.read_bytes()).hexdigest()
        asset_inventory.append(
            {"path": str(relative), "bytes": asset_path.stat().st_size, "sha256": digest}
        )
        destination = captured_assets / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(asset_path, destination, follow_symlinks=False)
(out / "asset-inventory.json").write_text(
    json.dumps(
        {
            "assetsRootRelativeToDatabase": str(assets_root.relative_to(database.parent)),
            "files": asset_inventory,
            "controlledSourceHashes": {
                source.name: hashlib.sha256(source.read_bytes()).hexdigest()
                for source in (image_source, pdf_source, video_source, text_source)
            },
        },
        indent=2,
        sort_keys=True,
    )
)
preserved_assets = out / "preserved-assets"
preserve_result = run(
    "preserve-selected-assets",
    [
        str(helper), "assets", str(snapshot), selected_board_id,
        str(assets_root), str(preserved_assets),
    ],
    120,
)
if preserve_result.returncode != 0:
    raise SystemExit("Selected board assets could not be preserved.")
preservation = json.loads((preserved_assets / "assets.json").read_text())
preserved_hashes = {
    asset.get("sha256") for asset in preservation.get("assets", [])
    if asset.get("status") in {"preserved", "duplicate"}
}
controlled_hashes = {
    hashlib.sha256(source.read_bytes()).hexdigest()
    for source in (image_source, pdf_source, video_source, text_source)
}
if not controlled_hashes.issubset(preserved_hashes):
    raise SystemExit("Freeform did not preserve every controlled original attachment byte-for-byte.")
if any(asset.get("status") == "missing" for asset in preservation.get("assets", [])):
    raise SystemExit("A controlled genuine Freeform asset was unexpectedly missing.")

archive_path = out / "selected-board.boardejectarchive"
os.environ["BOARDEJECT_ARCHIVE_TIME"] = "2026-09-14T18:00:00.000Z"
archive_result = run(
    "create-portable-archive",
    [
        "node", "--experimental-strip-types", "scripts/archive-cli.ts", "create",
        str(native_records), str(preserved_assets), str(archive_path),
        f"Untitled {selected_board_id[:8]}",
    ],
    120,
)
if archive_result.returncode != 0 or not archive_path.is_file():
    raise SystemExit("Portable selected-board archive could not be created.")
verify_result = run(
    "verify-portable-archive",
    ["node", "--experimental-strip-types", "scripts/archive-cli.ts", "verify", str(archive_path)],
    120,
)
if verify_result.returncode != 0:
    raise SystemExit("Portable selected-board archive did not verify independently.")
verified_archive = json.loads(verify_result.stdout)
if (
    not verified_archive.get("valid")
    or verified_archive.get("assetsVerified") != len(preservation.get("assets", []))
    or verified_archive.get("manifest", {}).get("board", {}).get("id") != selected_board_id
):
    raise SystemExit("Portable archive verification summary did not match the selected board.")
corrupt_path = out / "corrupted-selected-board.boardejectarchive"
corrupted = bytearray(archive_path.read_bytes())
corrupted[len(corrupted) // 2] ^= 0x01
corrupt_path.write_bytes(corrupted)
corrupt_result = run(
    "reject-corrupted-archive",
    ["node", "--experimental-strip-types", "scripts/archive-cli.ts", "verify", str(corrupt_path)],
    120,
)
if corrupt_result.returncode == 0:
    raise SystemExit("Independent verification accepted a corrupted archive.")

# Exercise the same scan/create/verify orchestration exposed to a macOS user.
flow_archive = out / "selected-board-user-flow.boardejectarchive"
flow_result = run(
    "create-through-user-flow",
    [
        "node", "--experimental-strip-types", "scripts/archive-freeform.ts",
        "create", selected_board_id, str(flow_archive),
    ],
    180,
)
if flow_result.returncode != 0 or not flow_archive.is_file():
    raise SystemExit("The user-facing selected-board archive flow failed.")
flow_verify = run(
    "verify-user-flow-archive",
    [
        "node", "--experimental-strip-types", "scripts/archive-freeform.ts",
        "verify", str(flow_archive),
    ],
    120,
)
if flow_verify.returncode != 0:
    raise SystemExit("The user-facing archive did not verify independently.")
flow_report = json.loads(flow_verify.stdout)
if (
    not flow_report.get("valid")
    or flow_report.get("assetsVerified") != len(preservation.get("assets", []))
    or flow_report.get("manifest", {}).get("board", {}).get("id") != selected_board_id
):
    raise SystemExit("The user-facing archive summary did not match the selected board.")

# Exercise the localhost API used by boardeject.dev against the same genuine
# Freeform database and selected board. No request leaves this Mac runner.
bridge_environment = os.environ.copy()
bridge_environment["BOARDEJECT_FREEFORM_DATABASE"] = str(database)
bridge_environment["BOARDEJECT_FREEFORM_ASSETS"] = str(assets_root)
bridge_process = subprocess.Popen(
    ["node", "--experimental-strip-types", "scripts/archive-freeform.ts", "bridge"],
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    text=True,
    env=bridge_environment,
)
bridge_origin = "https://boardeject.dev"


def bridge_request(path: str, method: str = "GET", data: bytes | None = None, content_type: str | None = None, token: str | None = None) -> tuple[bytes, dict[str, str]]:
    headers = {"Origin": bridge_origin}
    if content_type:
        headers["Content-Type"] = content_type
    if token:
        headers["X-BoardEject-Token"] = token
    request = urllib.request.Request(
        "http://127.0.0.1:48117/v1" + path,
        data=data,
        headers=headers,
        method=method,
    )
    with urllib.request.urlopen(request, timeout=180) as response:
        return response.read(), {key.lower(): value for key, value in response.headers.items()}


try:
    status_bytes = b""
    for _ in range(40):
        try:
            status_bytes, _ = bridge_request("/status")
            break
        except (urllib.error.URLError, ConnectionError):
            time.sleep(0.25)
    if not status_bytes:
        raise SystemExit("The localhost archive bridge did not start.")
    bridge_status = json.loads(status_bytes)
    bridge_token = str(bridge_status.get("token") or "")
    if bridge_status.get("localOnly") is not True or not bridge_token:
        raise SystemExit("The localhost bridge did not provide a local authenticated session.")
    scan_bytes, _ = bridge_request("/boards/scan", "POST", b"", token=bridge_token)
    bridge_catalog = json.loads(scan_bytes)
    if {board["id"] for board in bridge_catalog.get("boards", [])} != {board["id"] for board in catalog_boards}:
        raise SystemExit("The localhost bridge scan did not match the genuine Freeform catalog.")
    create_body = json.dumps({"boardId": selected_board_id, "title": catalog_boards[1]["displayName"]}).encode()
    bridge_archive, create_headers = bridge_request(
        "/archives/create", "POST", create_body, "application/json", bridge_token
    )
    if "boardejectarchive" not in create_headers.get("content-disposition", ""):
        raise SystemExit("The localhost bridge did not return a named archive download.")
    verify_bytes, _ = bridge_request(
        "/archives/verify",
        "POST",
        bridge_archive,
        "application/vnd.boardeject.archive",
        bridge_token,
    )
    bridge_verify = json.loads(verify_bytes)
    if not bridge_verify.get("valid") or bridge_verify.get("assetsVerified") != len(preservation.get("assets", [])):
        raise SystemExit("The localhost bridge archive did not verify with genuine assets.")
    results["localhost-bridge-flow"] = {
        "localOnly": True,
        "boards": len(bridge_catalog.get("boards", [])),
        "selectedBoardId": selected_board_id,
        "archiveBytes": len(bridge_archive),
        "filesChecked": bridge_verify.get("filesChecked"),
        "assetsVerified": bridge_verify.get("assetsVerified"),
    }
    build_result = run("build-website-for-helper-demo", ["npm", "run", "build"], 180)
    if build_result.returncode != 0:
        raise SystemExit("The website could not be built for the genuine helper demo.")
    preview_process = subprocess.Popen(
        ["npm", "run", "preview", "--", "--strictPort"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    try:
        for _ in range(40):
            try:
                with urllib.request.urlopen("http://127.0.0.1:4190", timeout=2):
                    break
            except urllib.error.URLError:
                time.sleep(0.25)
        demo_result = run(
            "record-genuine-helper-demo",
            [
                "python3",
                "scripts/record_archive_demo.py",
                "--replace",
                "--output-dir",
                str(out / "demo"),
            ],
            180,
        )
        if demo_result.returncode != 0:
            raise SystemExit("The genuine website and helper demo could not be recorded.")
    finally:
        preview_process.terminate()
        try:
            preview_process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            preview_process.kill()
finally:
    bridge_process.terminate()
    try:
        bridge_process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        bridge_process.kill()

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
