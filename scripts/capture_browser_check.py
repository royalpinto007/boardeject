"""Exercise real file selection/drop against existing public regression inputs."""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

base = os.environ.get("BOARDEJECT_TEST_URL", "http://127.0.0.1:4190").rstrip("/")
with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome", headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 900}, accept_downloads=True)
    requests, errors, external_responses = [], [], []
    page.on("request", lambda request: requests.append((request.method, request.url)))
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("response", lambda response: external_responses.append(response.url) if not response.url.startswith(base + "/") else None)
    response = page.goto(base + "/test-capture")
    assert response.status == 200
    page.get_by_role("heading", name="Test your actual capture.").wait_for()
    picker = page.locator("#capture-file")
    picker.set_input_files("tests/fixtures/upstream/real-board.crlnative")
    page.get_by_role("heading", name="Conversion report").wait_for()
    assert "compatibility is not supported" in page.locator(".capture-report").inner_text()
    assert page.get_by_role("button", name="Download .excalidraw").count() == 0
    picker.set_input_files({"name": "broken.boardeject", "mimeType": "application/json", "buffer": b"broken"})
    page.get_by_role("alert").wait_for()
    assert "Invalid JSON" in page.get_by_role("alert").inner_text()
    assert page.locator(".capture-report").count() == 0
    # Drop existing upstream ink decoder fixture, never a fabricated native capture.
    data = list(Path("tests/fixtures/upstream/ink-pen.drawing").read_bytes())
    page.locator(".capture-drop").evaluate("""(element, bytes) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([new Uint8Array(bytes)], 'ink-pen.drawing'));
      element.dispatchEvent(new DragEvent('drop', {bubbles:true, dataTransfer:transfer}));
    }""", data)
    download_button = page.get_by_role("button", name="Download .excalidraw")
    download_button.wait_for()
    with page.expect_download() as event:
        download_button.click()
    import json
    document = json.loads(Path(event.value.path()).read_text())
    assert document["type"] == "excalidraw"
    assert len(document["elements"]) > 0
    page.get_by_role("button", name="Preview result").click()
    page.locator(".excalidraw").wait_for()
    page.get_by_role("button", name="BoardEject").click()
    for width in (360, 768, 1280):
        page.set_viewport_size({"width": width, "height": 900})
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
    assert not errors, errors
    assert all(method == "GET" for method, url in requests), requests
    assert not external_responses, external_responses
    # Production CSP can block host-injected analytics and editor font fallbacks.
    # A blocked request event is not a successful external network response.
    external_attempts = [url for method, url in requests if not url.startswith(base + "/")]
    if base.startswith("http://127.0.0.1"):
        assert not external_attempts, external_attempts
    if external_attempts:
        print(f"NOTE: {len(external_attempts)} external request attempts received no response (CSP-blocked); no uploads occurred")
    browser.close()
    print("PASS: native file selection, failure clears stale output, ink drop, preview/download, responsive layout, no uploads/external responses")
