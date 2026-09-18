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
    page.get_by_role("heading", name="Test a capture.").wait_for()
    picker = page.locator("#capture-file")
    picker.set_input_files("tests/fixtures/upstream/real-board.crlnative")
    page.get_by_role("heading", name="Conversion report").wait_for()
    assert "compatibility is not supported" in page.locator(".capture-report").inner_text()
    assert page.get_by_role("button", name="Download .excalidraw").count() == 0
    picker.set_input_files({"name": "broken.boardeject", "mimeType": "application/json", "buffer": b"broken"})
    page.get_by_role("alert").wait_for()
    assert "Invalid JSON" in page.get_by_role("alert").inner_text()
    assert page.locator(".capture-report").count() == 0
    # Apple-generated decoder references, not Freeform pressure/eraser captures.
    picker.set_input_files("tests/fixtures/apple/masked-gap.drawing")
    page.get_by_text("Masked ink or an unreadable native stroke record", exact=False).wait_for()
    assert page.get_by_role("button", name="Download .excalidraw").count() == 0
    picker.set_input_files("tests/fixtures/apple/variable-width.drawing")
    page.get_by_role("button", name="Download .excalidraw").wait_for()
    page.locator(".capture-report > details > summary").first.click()
    assert "uniform Excalidraw stroke" in page.locator(".capture-report").inner_text()
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
    page.get_by_role("button", name="← BoardEject", exact=True).click()
    picker.set_input_files("tests/fixtures/freeform-4.5/tables/table-baseline.crlnative")
    page.get_by_role("button", name="Download .excalidraw").wait_for()
    page.locator(".capture-report > details > summary").first.click()
    page.get_by_text("Recovered a validated table layout", exact=False).wait_for()
    with page.expect_download() as table_event:
        page.get_by_role("button", name="Download .excalidraw").click()
    table_document = json.loads(Path(table_event.value.path()).read_text())
    assert len(table_document["elements"]) == 8
    assert [e["text"] for e in table_document["elements"] if e["type"] == "text"] == ["A1", "B1", "A2", "B2"]
    for fixture_name, expected_count, expected_text in (
        ("multiple-two-tables", 16, "D2"),
        ("embedded-a1", 9, "ANCHORED A1"),
    ):
        picker.set_input_files(
            f"tests/fixtures/freeform-4.5/tables/variants/{fixture_name}.crlnative"
        )
        page.get_by_role("button", name="Download .excalidraw").wait_for()
        with page.expect_download() as variant_event:
            page.get_by_role("button", name="Download .excalidraw").click()
        variant_document = json.loads(Path(variant_event.value.path()).read_text())
        assert len(variant_document["elements"]) == expected_count
        assert expected_text in [
            element["text"]
            for element in variant_document["elements"]
            if element["type"] == "text"
        ]
    # Exercise the ordinary homepage worker with the same native bytes in a helper envelope.
    import base64
    # Genuine single-object Freeform captures with resource/style sidecars.
    for case in ("image-baseline", "text-mixed", "text-multiline-combined"):
        fixture = Path("tests/fixtures/freeform-4.5")
        content = json.loads((fixture / (case + ".content.json")).read_text())[0]
        flavors = [{"uti": "com.apple.freeform.CRLNativeData", "base64": base64.b64encode((fixture / (case + ".crlnative")).read_bytes()).decode()}, {"uti": "com.apple.apps.content-language.canvas-object-1.0", "base64": base64.b64encode((fixture / (case + ".content.json")).read_bytes()).decode()}]
        if case == "image-baseline":
            flavors.append({"uti": content["resource"]["indirect"]["identifier"], "base64": base64.b64encode((fixture / (case + ".resource.png")).read_bytes()).decode()})
        capture = json.dumps({"format":"boardeject.clipboard", "version":1, "flavors":flavors})
        picker.set_input_files({"name":case+".boardeject", "mimeType":"application/json", "buffer":capture.encode()})
        page.get_by_role("button", name="Download .excalidraw").wait_for()
        with page.expect_download() as native_event:
            page.get_by_role("button", name="Download .excalidraw").click()
        result = json.loads(Path(native_event.value.path()).read_text())
        assert len(result["elements"]) == 1
        if case == "image-baseline":
            asset = next(iter(result["files"].values()))
            assert asset["mimeType"] == "image/svg+xml"
            pixels = page.evaluate("""async url => {
              const image = new Image(); image.src=url; await image.decode();
              const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
              const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
              return [Array.from(ctx.getImageData(32,40,1,1).data),Array.from(ctx.getImageData(16,16,1,1).data)];
            }""", asset["dataURL"])
            assert pixels[0][0] > 150 and pixels[0][3] > 200, pixels
            assert pixels[1][3] < 100, pixels  # rounded mask removes the corner
        else:
            expected = "First Bold\nBoth" if case == "text-multiline-combined" else "Plain Bold Italic"
            assert result["elements"][0]["text"] == expected
            assert result["elements"][0]["textAlign"] == "center"
        page.get_by_role("button", name="Preview result").click()
        page.locator(".excalidraw").wait_for()
        page.get_by_role("button", name="← BoardEject", exact=True).click()
    envelope = json.dumps({"format":"boardeject.clipboard", "version":1, "flavors":[{"uti":"com.apple.freeform.CRLNativeData", "base64":base64.b64encode(Path("tests/fixtures/freeform-4.5/tables/table-baseline.crlnative").read_bytes()).decode()}]})
    page.goto(base + "/")
    page.locator('input[type="file"]').set_input_files({"name":"table.boardeject", "mimeType":"application/json", "buffer":envelope.encode()})
    page.get_by_role("heading", name="8 editable elements").wait_for()
    for width in (360, 768, 1280):
        page.set_viewport_size({"width": width, "height": 900})
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
    # Every sanitized genuine Freeform capture must produce either a conversion
    # report or a clean unsupported result in the production capture tester.
    page.goto(base + "/test-capture")
    picker = page.locator("#capture-file")
    native_captures = sorted(Path("tests/fixtures/freeform-4.5").rglob("*.crlnative"))
    for capture_path in native_captures:
        picker.set_input_files(str(capture_path))
        page.locator(".capture-report").wait_for()
        assert page.locator('[role="alert"]').count() == 0, capture_path
        assert page.locator(".capture-report").inner_text().strip(), capture_path
    assert len(native_captures) >= 60, len(native_captures)
    assert not errors, errors
    assert all(method == "GET" for method, url in requests), requests
    assert not external_responses, external_responses
    # Production CSP can block host-injected analytics and editor font fallbacks.
    # A blocked request event is not a successful external network response.
    expected_local = (base + "/", "http://127.0.0.1:48117/v1/status")
    external_attempts = [url for method, url in requests if not url.startswith(expected_local)]
    if base.startswith("http://127.0.0.1"):
        assert not external_attempts, external_attempts
    if external_attempts:
        print(f"NOTE: {len(external_attempts)} external request attempts received no response (CSP-blocked); no uploads occurred")
    browser.close()
    print(f"PASS: {len(native_captures)} genuine native captures, file selection, safe failures, ink, preview/download, responsive layout, no uploads/external responses")
