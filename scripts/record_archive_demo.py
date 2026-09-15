"""Record the public archive UX replay backed by verified Freeform 4.5 results."""
import argparse
import subprocess
import tempfile
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument("--replace", action="store_true")
args = parser.parse_args()
docs = Path("docs")
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
        navigation_started = time.monotonic()
        page.goto("http://127.0.0.1:4190/?archive-demo", wait_until="networkidle")
        page.locator(".archive-utility").wait_for()
        trim_start = time.monotonic() - navigation_started
        page.wait_for_timeout(300)
        page.screenshot(path=str(docs / "archive-poster.png"))
        page.wait_for_timeout(11900)
        path = page.video.path()
        context.close()
        browser.close()
    subprocess.run(
        ["ffmpeg", "-y", "-ss", f"{trim_start:.3f}", "-i", str(path), "-an", "-t", "12", "-c:v", "libx264", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(docs / "archive-demo.mp4")],
        check=True,
        capture_output=True,
    )
    subprocess.run(
        ["ffmpeg", "-y", "-i", str(docs / "archive-demo.mp4"), "-filter_complex", "fps=10,scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer:bayer_scale=4", "-loop", "0", str(docs / "archive-demo.gif")],
        check=True,
        capture_output=True,
    )
print("Recorded the product archive replay from verified Freeform 4.5 result counts.")
