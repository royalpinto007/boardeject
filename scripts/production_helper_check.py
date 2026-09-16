"""Exercise the production website against a real local helper and Freeform store."""

import json
import os
from pathlib import Path
import re
import subprocess
import time
import urllib.error
import urllib.request
import zipfile

from playwright.sync_api import sync_playwright


base = os.environ.get("BOARDEJECT_SITE_URL", "https://boardeject.dev").rstrip("/")
bridge_executable = os.environ.get("BOARDEJECT_BRIDGE_EXECUTABLE")
board_name = os.environ["BOARDEJECT_TEST_BOARD_NAME"]
capture_file = os.environ.get("BOARDEJECT_TEST_CAPTURE")
restore_helper = os.environ.get("BOARDEJECT_RESTORE_CLIPBOARD")
if not bridge_executable:
    raise SystemExit("BOARDEJECT_BRIDGE_EXECUTABLE is required.")


def start_bridge() -> subprocess.Popen[str]:
    process = subprocess.Popen(
        [bridge_executable, "bridge"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        env=os.environ.copy(),
    )
    for _ in range(40):
        try:
            request = urllib.request.Request(
                "http://127.0.0.1:48117/v1/status",
                headers={"Origin": "https://boardeject.dev"},
            )
            with urllib.request.urlopen(request, timeout=2) as response:
                if json.loads(response.read()).get("localOnly") is True:
                    return process
        except (urllib.error.URLError, ConnectionError):
            time.sleep(0.25)
    process.terminate()
    raise SystemExit("The packaged localhost helper did not start.")


def stop_bridge(process: subprocess.Popen[str]) -> None:
    process.terminate()
    try:
        process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=10)


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(channel="chrome", headless=True)
    context = browser.new_context(accept_downloads=True)
    context.grant_permissions(["local-network-access"], origin=base)
    page = context.new_page()

    page.goto(base, wait_until="domcontentloaded")
    page.get_by_role("heading", name="Install or open the helper").wait_for()

    bridge = start_bridge()
    try:
        page.get_by_role("button", name=re.compile(r"I opened it.*connect")).click()
        page.get_by_role("heading", name="Helper connected").wait_for()
        if capture_file or restore_helper:
            if not capture_file or not restore_helper:
                raise SystemExit(
                    "BOARDEJECT_TEST_CAPTURE and BOARDEJECT_RESTORE_CLIPBOARD must be set together."
                )
            subprocess.run(
                [restore_helper, capture_file],
                check=True,
                capture_output=True,
                text=True,
            )
        page.get_by_role("button", name="Import copied selection").click()
        page.get_by_role("heading", name=re.compile(r"[1-9][0-9]* editable elements")).wait_for(timeout=120_000)
        with page.expect_download() as export_event:
            page.get_by_role("button", name="Download .excalidraw").click()
        exported = Path(export_event.value.path())
        export_data = json.loads(exported.read_text())
        if export_data.get("type") != "excalidraw" or not export_data.get("elements"):
            raise SystemExit("Production did not return an editable Excalidraw document.")
        page.get_by_role("link", name="Archive a board").click()
        page.get_by_role("button", name="Scan Freeform").click()
        page.get_by_role("button", name=board_name).wait_for(timeout=120_000)

        stop_bridge(bridge)
        page.get_by_role("button", name="Scan again").click()
        page.get_by_role("heading", name="That did not work").wait_for()
        page.get_by_text("The Mac helper is not running", exact=False).wait_for()

        bridge = start_bridge()
        page.get_by_role("button", name="Reconnect helper").click()
        page.get_by_role("heading", name="Helper connected").wait_for()
        page.get_by_role("button", name="Scan Freeform").click()
        page.get_by_role("button", name=board_name).click()
        page.get_by_role("button", name="Create local archive").click()
        page.get_by_role("heading", name="Archive created").wait_for(
            timeout=120_000,
        )
        with page.expect_download() as event:
            page.get_by_role("button", name="Save archive").click()
        downloaded = Path(event.value.path())
        if not event.value.suggested_filename.endswith(".boardejectarchive"):
            raise SystemExit("Production returned an unexpected archive filename.")
        with zipfile.ZipFile(downloaded) as archive:
            if "manifest.json" not in archive.namelist():
                raise SystemExit("Downloaded production archive has no manifest.")
        page.get_by_role("button", name="Verify now").click()
        page.get_by_role("heading", name="Archive verified").wait_for(
            timeout=120_000,
        )
        page.get_by_text("No missing or corrupted files.", exact=True).wait_for()
    finally:
        stop_bridge(bridge)
        context.close()
        browser.close()

print("PASS: production clipboard export, offline, restart, error, scan, archive download, and verify flow")
