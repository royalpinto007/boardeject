"""Browser safety and download checks. UI fixtures are explicitly synthetic."""
import os
from pathlib import Path
from zipfile import ZipFile
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get("BOARDEJECT_TEST_URL", "http://127.0.0.1:4190").rstrip("/")
FIXTURES = Path("test-results/explorer")

with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome", headless=True)
    context = browser.new_context(viewport={"width": 1440, "height": 1000})
    page = context.new_page()
    errors = []
    outbound = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(BASE + "/open")
    page.wait_for_load_state("networkidle")
    page.on("request", lambda request: outbound.append(request.url) if request.url.startswith(("http:", "https:")) else None)
    expect(page.get_by_role("heading", name="Your board, unpacked.")).to_be_visible()
    picker = page.get_by_label("Choose archive", exact=True)
    picker.set_input_files(FIXTURES / "valid.boardejectarchive")
    expect(page.get_by_role("heading", name="Archive verified", exact=True)).to_be_visible()
    page.get_by_role("button", name="Preview", exact=True).click()
    expect(page.locator(".archive-media img")).to_be_visible()
    assert page.get_by_role("button", name="Preview", exact=True).count() == 0, "Active HTML/SVG must not offer a preview"
    assert not outbound, outbound
    # No helper, server, or network is needed after the Explorer has loaded.
    context.set_offline(True)
    picker.set_input_files(FIXTURES / "valid.boardejectarchive")
    expect(page.get_by_role("heading", name="Archive verified", exact=True)).to_be_visible()
    expect(page.get_by_text("Original file missing", exact=True)).to_be_visible()
    page.get_by_role("button", name="Preview", exact=True).click()
    expect(page.locator(".archive-media img")).to_be_visible()
    assert page.locator(".archive-media img").evaluate("img => img.naturalWidth") > 0
    with page.expect_download() as info:
        page.get_by_role("button", name="Download notes.txt", exact=True).click()
    assert Path(info.value.path()).read_bytes() == b"original bytes"
    with page.expect_download() as info:
        page.get_by_role("button", name="Download all files").click()
    with ZipFile(info.value.path()) as archive:
        assert archive.read("notes.txt") == b"original bytes"
        assert len(archive.namelist()) == 4
    page.get_by_role("heading", name="Your board, unpacked.").click()
    page.screenshot(path=str(FIXTURES / "desktop.png"), full_page=True)
    for width in (320, 390, 768, 1024):
        page.set_viewport_size({"width": width, "height": 900})
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), width
    page.set_viewport_size({"width": 390, "height": 844})
    page.screenshot(path=str(FIXTURES / "mobile.png"), full_page=True)
    picker.set_input_files(FIXTURES / "corrupt.boardejectarchive")
    expect(page.get_by_role("heading", name="Verification failed", exact=True)).to_be_visible()
    assert page.get_by_role("button", name="Download all files").count() == 0
    picker.set_input_files({"name": "broken.boardejectarchive", "mimeType": "application/zip", "buffer": b"not zip"})
    expect(page.get_by_role("heading", name="Verification failed", exact=True)).to_be_visible()
    picker.set_input_files(FIXTURES / "valid.boardejectarchive")
    expect(page.get_by_role("heading", name="Archive verified", exact=True)).to_be_visible()
    page.get_by_role("button", name="Verify again").click()
    expect(page.get_by_role("heading", name="Archive verified", exact=True)).to_be_visible()
    assert not errors, errors
    assert not outbound, outbound
    browser.close()
print("Explorer browser checks passed: offline, previews, exact downloads, responsive, corrupt input, re-verification.")
