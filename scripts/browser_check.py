"""Validate actual Excalidraw interactions, without fabricating native capture."""
import os

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError, sync_playwright

BASE = os.environ.get("BOARDEJECT_TEST_URL", "http://127.0.0.1:4190").rstrip("/")
HELPER = "http://127.0.0.1:48117/v1"


def mock_helper(route):
    path = route.request.url.removeprefix(HELPER)
    headers = {
        "access-control-allow-origin": BASE,
        "access-control-expose-headers": "Content-Disposition",
        "cache-control": "no-store",
    }
    if path == "/status":
        route.fulfill(json={"service": "boardeject-local-helper", "apiVersion": 1, "token": "browser-check-token", "localOnly": True}, headers=headers)
    elif path == "/boards/scan":
        route.fulfill(json={"format": "boardeject.freeform-catalog", "boards": [{"id": "11111111-1111-1111-1111-111111111111", "displayName": "Product planning", "titleStatus": "verified", "objectCount": 37, "assetReferenceCount": 8}], "warnings": []}, headers=headers)
    elif path == "/archives/create":
        route.fulfill(body=b"local archive", content_type="application/vnd.boardeject.archive", headers={**headers, "content-disposition": 'attachment; filename="Product-planning.boardejectarchive"'})
    elif path == "/archives/verify":
        route.fulfill(json={"valid": True, "filesChecked": 10, "assetsVerified": 8, "missing": 0, "corrupted": 0, "errors": [], "warnings": []}, headers=headers)
    else:
        route.fulfill(status=404, json={"error": "Not found"}, headers=headers)


def open_example(page, base=BASE):
    page.goto(base + "/?debug")
    page.locator(".hero").wait_for()
    for link in page.locator('a[href^="https://"]').all():
        assert link.get_attribute("target") == "_blank"
        assert "noopener" in (link.get_attribute("rel") or "")
    assert page.locator('a[href="#export"]').get_attribute("target") is None
    page.get_by_role("button", name="Try browser demo").click()
    page.get_by_role("button", name="Open in Excalidraw").click()
    page.wait_for_function("() => typeof window.boardejectSnapshot === 'function'")
    page.wait_for_timeout(600)


def point(page, element_id, dx=10, dy=10):
    return page.evaluate("""({id, dx, dy}) => {
      const {elements, state} = window.boardejectSnapshot();
      const e = elements.find(e => e.id === id);
      return [(e.x + dx + state.scrollX) * state.zoom.value + state.offsetLeft,
              (e.y + dy + state.scrollY) * state.zoom.value + state.offsetTop];
    }""", {"id": element_id, "dx": dx, "dy": dy})


def prove_editability(page, demo=False):
    before = page.evaluate("window.boardejectSnapshot().elements")
    x, y = point(page, "card-1")
    page.mouse.move(x, y)
    page.mouse.down()
    if demo:
        for step in range(1, 61):
            page.mouse.move(x, y + 45 * step / 60)
            page.wait_for_timeout(25)
    else:
        page.mouse.move(x, y + 45, steps=35)
    page.mouse.up()
    page.wait_for_timeout(350)
    after = page.evaluate("window.boardejectSnapshot().elements")
    old = {e["id"]: e for e in before}
    new = {e["id"]: e for e in after}
    assert new["card-1"]["y"] > old["card-1"]["y"] + 40
    assert new["card-1"]["y"] > new["title"]["y"] + new["title"]["height"] + 20
    assert new["card-1"]["y"] + new["card-1"]["height"] < new["scribble"]["y"] - 20
    assert new["arrow-0"]["points"] != old["arrow-0"]["points"]
    assert new["arrow-0"]["endBinding"]["elementId"] == "card-1"
    if demo:
        page.wait_for_timeout(1200)
    page.mouse.click(1200, 700)
    x, y = point(page, "title", 60, 20)
    page.mouse.dblclick(x, y)
    page.locator("textarea").wait_for(state="visible")
    page.keyboard.press("Control+a")
    page.keyboard.type("Your ideas. Still editable.", delay=45)
    page.keyboard.press("Escape")
    page.wait_for_timeout(300)
    assert page.evaluate("window.boardejectSnapshot().elements.find(e => e.id === 'title').text") == "Your ideas. Still editable."


if __name__ == "__main__":
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel="chrome", headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 900})
        if BASE.startswith("https://"):
            context.grant_permissions(["local-network-access"], origin=BASE)
        page = context.new_page()
        page.route(HELPER + "/**", mock_helper)
        errors = []
        remote = []
        remote_responses = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("request", lambda request: remote.append(request.url) if not request.url.startswith((BASE, HELPER, "data:", "blob:")) else None)
        page.on("response", lambda response: remote_responses.append(response.url) if not response.url.startswith((BASE + "/", HELPER)) else None)
        open_example(page)
        prove_editability(page)
        assert not errors, errors
        assert not remote_responses, remote_responses
        if BASE.startswith("http://127.0.0.1"):
            assert not remote, remote
        page.get_by_role("button", name="← BoardEject", exact=True).click()
        page.locator("#demo video").evaluate("video => video.play()")
        page.wait_for_timeout(500)
        assert page.locator("#demo video").evaluate("video => video.currentTime > 0 && video.videoWidth > 0 && !video.error")
        page.goto(BASE + "/")
        page.get_by_role("heading", name="Install or open the helper").wait_for()
        page.get_by_role("link", name="Back up a board").click()
        page.get_by_role("heading", name="Helper connected").wait_for()
        assert page.locator('header a[href="/mac-helper"]').is_visible()
        assert page.locator("header .brand img").get_attribute("src") == "/favicon.svg"
        clipboard_box = page.get_by_role("button", name="Use copied BoardEject capture").bounding_box()
        helper_box = page.get_by_role("link", name="Set up the macOS helper").bounding_box()
        assert clipboard_box and helper_box
        assert helper_box["y"] >= clipboard_box["y"] + clipboard_box["height"] + 8
        page.get_by_role("button", name="Scan Freeform").click()
        page.get_by_role("button", name="Product planning").click()
        page.get_by_role("button", name="Create local backup").click()
        page.get_by_role("heading", name="Backup created").wait_for(timeout=3000)
        page.get_by_role("button", name="Verify now").click()
        try:
            page.get_by_role("heading", name="Archive verified").wait_for()
        except PlaywrightTimeoutError as error:
            state = page.locator(".archive-utility").get_attribute("data-step")
            detail = page.locator(".archive-utility").inner_text()
            raise AssertionError(f"Archive verification stalled in {state}: {detail}") from error
        assert "10" in page.locator(".proof-grid").inner_text()
        assert "8" in page.locator(".proof-grid").inner_text()
        for width in (360, 768, 1280):
            page.set_viewport_size({"width": width, "height": 900})
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        page.goto(BASE + "/test-capture")
        page.get_by_role("heading", name="Test your actual capture.").wait_for()
        assert page.locator('header a[href="/mac-helper"]').is_visible()
        assert page.locator("header .brand img").get_attribute("src") == "/favicon.svg"
        page.set_viewport_size({"width": 360, "height": 900})
        picker = page.locator(".capture-file-button").bounding_box()
        drop = page.locator(".capture-drop").bounding_box()
        assert picker and drop
        assert abs((picker["x"] + picker["width"] / 2) - (drop["x"] + drop["width"] / 2)) < 2
        assert page.get_by_text("No file selected", exact=True).is_visible()
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        for path, heading in (
            ("/privacy", "Privacy"),
            ("/terms", "Terms of use"),
            ("/mac-helper", "BoardEject for your Mac."),
            ("/support", "Useful where verified. Safe where uncertain."),
            ("/license", "MIT License"),
            ("/samples/source", "Sample source and license"),
        ):
            response = page.goto(BASE + path)
            assert response.status == 200
            page.get_by_role("heading", name=heading).wait_for()
            assert page.locator("header .brand").is_visible()
            assert page.locator("header .brand img").get_attribute("src") == "/favicon.svg"
            if path == "/mac-helper":
                assert page.locator('header a[href="/mac-helper"]').count() == 0
                assert page.locator(".package-icon").get_attribute("src") == "/favicon.svg"
                download_link = page.get_by_role("link", name="Download Mac helper").first
                assert download_link.get_attribute("href") == "https://downloads.boardeject.dev/BoardEject-macOS-universal.dmg"
                zip_link = page.get_by_role("link", name="Prefer a ZIP?")
                assert zip_link.get_attribute("href") == "https://downloads.boardeject.dev/BoardEject-macOS-universal.zip"
                page.get_by_role("heading", name="Approve the unsigned helper once.").wait_for()
                page.get_by_role("heading", name="Open Anyway once").wait_for()
                page.get_by_text("Launch at Login is optional", exact=False).wait_for()
                assert page.get_by_role("link", name="Apple's Gatekeeper guidance ↗").get_attribute("href").startswith("https://support.apple.com/")
            else:
                assert page.locator('header a[href="/mac-helper"]').is_visible()
            for width in (360, 1280):
                page.set_viewport_size({"width": width, "height": 900})
                assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        browser.close()
        if remote:
            print(f"NOTE: {len(remote)} external request attempts received no response (CSP-blocked)")
        print("PASS: shape drag, bound arrow follows, editable text, no external responses, responsive layout")
