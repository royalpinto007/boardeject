"""Record the website connected to a running local helper and real Freeform data."""
import argparse
import subprocess
import tempfile
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument("--replace", action="store_true")
parser.add_argument("--output-dir", default="docs")
parser.add_argument("--base-url", default="http://127.0.0.1:4190")
args = parser.parse_args()
docs = Path(args.output_dir)
docs.mkdir(parents=True, exist_ok=True)
for name in ("archive-demo.mp4", "archive-demo.gif", "archive-poster.png"):
    if (docs / name).exists() and not args.replace:
        raise SystemExit("Archive demo exists. Use --replace to regenerate.")

with tempfile.TemporaryDirectory(prefix="boardeject-archive-demo-") as temporary:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel="chrome", headless=True)
        context = browser.new_context(
            viewport={"width": 1440, "height": 900},
            record_video_dir=temporary,
            record_video_size={"width": 1440, "height": 900},
        )
        page = context.new_page()
        page.goto(args.base_url, wait_until="networkidle")
        page.locator(".archive-utility").wait_for()
        page.get_by_role("heading", name="Helper connected").wait_for()
        trim_started = time.monotonic()
        page.get_by_role("link", name="Back up a board").click()
        page.wait_for_timeout(500)
        page.get_by_role("button", name="Scan Freeform").click()
        page.locator(".board-row").first.wait_for()
        page.wait_for_timeout(900)
        page.locator(".board-row").first.click()
        page.wait_for_timeout(600)
        page.get_by_role("button", name="Create local backup").click()
        page.get_by_role("heading", name="Backup created").wait_for(timeout=120000)
        page.wait_for_timeout(900)
        page.get_by_role("button", name="Verify now").click()
        page.get_by_role("heading", name="Archive verified").wait_for(timeout=120000)
        page.wait_for_timeout(1400)
        page.screenshot(path=str(docs / "archive-poster.png"))
        duration = time.monotonic() - trim_started
        path = page.video.path()
        context.close()
        browser.close()
    subprocess.run(
        ["ffmpeg", "-y", "-i", str(path), "-an", "-t", f"{min(duration + 0.6, 15):.3f}", "-c:v", "libx264", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(docs / "archive-demo.mp4")],
        check=True,
        capture_output=True,
    )
    subprocess.run(
        ["ffmpeg", "-y", "-i", str(docs / "archive-demo.mp4"), "-filter_complex", "fps=10,scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer:bayer_scale=4", "-loop", "0", str(docs / "archive-demo.gif")],
        check=True,
        capture_output=True,
    )
print("Recorded boardeject.dev using the localhost helper and genuine Freeform data.")
