"""Record the actual Explorer using a supplied genuine archive, never fake UI."""
import argparse
import subprocess
import tempfile
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument("archive", type=Path)
parser.add_argument("--url", default="http://127.0.0.1:4190")
parser.add_argument("--output", type=Path, required=True)
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=True)
with tempfile.TemporaryDirectory(prefix="boardeject-explorer-video-") as temp:
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 900}, record_video_dir=temp, record_video_size={"width": 1280, "height": 900})
        page = context.new_page()
        began = time.monotonic()
        page.goto(args.url.rstrip("/") + "/open")
        page.wait_for_load_state("networkidle")
        start = time.monotonic() - began
        page.wait_for_timeout(350)
        page.get_by_label("Choose archive", exact=True).set_input_files(args.archive)
        page.get_by_role("heading", name="Archive verified", exact=True).wait_for()
        page.get_by_role("heading", name="Your board, unpacked.").click()
        page.wait_for_timeout(2000)
        page.locator(".archive-board").scroll_into_view_if_needed()
        page.locator(".archive-status").scroll_into_view_if_needed()
        page.screenshot(path=str(args.output / "explorer-poster.png"))
        page.wait_for_timeout(2200)
        image = page.locator(".archive-asset").filter(has=page.locator(".archive-thumbnail")).last
        image.get_by_role("button", name="Preview", exact=True).click()
        image.scroll_into_view_if_needed()
        page.wait_for_timeout(3000)
        page.get_by_role("button", name="Download all files").scroll_into_view_if_needed()
        with page.expect_download() as download:
            page.get_by_role("button", name="Download all files").click()
        assert download.value.suggested_filename.endswith(".zip")
        page.wait_for_timeout(2500)
        duration = time.monotonic() - began - start
        video = page.video.path()
        context.close()
        browser.close()
    subprocess.run(["ffmpeg", "-y", "-ss", str(start), "-i", str(video), "-t", str(duration), "-an", "-c:v", "libx264", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(args.output / "explorer-demo.mp4")], check=True, capture_output=True)
    subprocess.run(["ffmpeg", "-y", "-i", str(args.output / "explorer-demo.mp4"), "-filter_complex", "fps=10,scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer", "-loop", "0", str(args.output / "explorer-demo.gif")], check=True, capture_output=True)
print("Recorded actual archive verification, preview, and original-file extraction.")
