"""Validate actual Excalidraw interactions, without fabricating native capture."""
from playwright.sync_api import sync_playwright


def open_example(page, base="http://127.0.0.1:4190"):
    page.goto(base + "/?debug")
    page.get_by_role("button", name="Try example board").click()
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
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        errors = []
        remote = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("request", lambda request: remote.append(request.url) if not request.url.startswith(("http://127.0.0.1", "data:", "blob:")) else None)
        open_example(page)
        prove_editability(page)
        assert not errors, errors
        assert not remote, remote
        page.get_by_role("button", name="BoardEject").click()
        page.locator("video").evaluate("video => video.play()")
        page.wait_for_timeout(500)
        assert page.locator("video").evaluate("video => video.currentTime > 0 && video.videoWidth > 0 && !video.error")
        for width in (360, 768, 1280):
            page.set_viewport_size({"width": width, "height": 900})
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        browser.close()
        print("PASS: shape drag, bound arrow follows, editable text, no external requests, responsive layout")
