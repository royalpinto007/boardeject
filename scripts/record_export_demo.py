"""Record a genuine Freeform clipboard import through the localhost helper."""

import argparse
import shutil
import subprocess
import tempfile
import time
from pathlib import Path

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError, sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument("--replace", action="store_true")
parser.add_argument("--output-dir", default="docs")
parser.add_argument("--base-url", default="http://127.0.0.1:4190")
parser.add_argument("--capture-file")
parser.add_argument("--restore-helper")
parser.add_argument("--copy-freeform-selection", action="store_true")
args = parser.parse_args()
output = Path(args.output_dir)
output.mkdir(parents=True, exist_ok=True)
ffmpeg = shutil.which("ffmpeg")
if not ffmpeg:
    bundled = sorted((Path.home() / "Library/Caches/ms-playwright").glob("ffmpeg-*/ffmpeg-mac"))
    if not bundled:
        raise SystemExit("FFmpeg is required to encode the export demo.")
    ffmpeg = str(bundled[-1])
for name in ("demo.mp4", "demo.gif", "demo-poster.png"):
    if (output / name).exists() and not args.replace:
        raise SystemExit("Export demo exists. Use --replace to regenerate.")

with tempfile.TemporaryDirectory(prefix="boardeject-export-demo-") as temporary:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel="chrome", headless=True)
        context = browser.new_context(
            viewport={"width": 1440, "height": 900},
            record_video_dir=temporary,
            record_video_size={"width": 1440, "height": 900},
        )
        if args.base_url.startswith("https://"):
            context.grant_permissions(
                ["local-network-access"], origin=args.base_url.rstrip("/")
            )
        page = context.new_page()
        page.goto(f"{args.base_url.rstrip('/')}?debug#export", wait_until="networkidle")
        page.get_by_role("button", name="Import copied selection").wait_for()
        if args.capture_file or args.restore_helper:
            if not args.capture_file or not args.restore_helper:
                raise SystemExit(
                    "--capture-file and --restore-helper must be provided together."
                )
            subprocess.run(
                [args.restore_helper, args.capture_file],
                check=True,
                capture_output=True,
                text=True,
            )
        if args.copy_freeform_selection:
            subprocess.run(
                [
                    "osascript",
                    "-e",
                    'tell application "Freeform" to activate\n'
                    'delay 1\n'
                    'tell application "System Events"\n'
                    'tell process "Freeform"\n'
                    'key code 53\n'
                    'click at {300, 100}\n'
                    'keystroke "a" using command down\n'
                    'delay 0.5\n'
                    'keystroke "c" using command down\n'
                    'delay 1\n'
                    'end tell\n'
                    'end tell',
                ],
                check=True,
                capture_output=True,
                text=True,
            )
        started = time.monotonic()
        page.get_by_role("button", name="Import copied selection").click()
        try:
            page.get_by_role("heading", name="1 editable elements").wait_for(
                timeout=30_000
            )
        except PlaywrightTimeoutError:
            page.screenshot(path=str(output / "failure.png"), full_page=True)
            (output / "failure.html").write_text(page.content())
            status = page.get_by_role("status").first.text_content() or "No status message."
            raise SystemExit(f"Clipboard import did not finish: {status}")
        page.wait_for_timeout(900)
        page.screenshot(path=str(output / "demo-poster.png"))
        page.get_by_role("button", name="Open in Excalidraw").click()
        page.wait_for_function("() => typeof window.boardejectSnapshot === 'function'")
        page.wait_for_timeout(900)
        text_id = page.evaluate("""() => {
          const text = window.boardejectSnapshot().elements.find(element => element.type === 'text');
          return text?.id;
        }""")
        if not text_id:
            raise SystemExit("The genuine capture did not produce editable text.")
        point = page.evaluate("""id => {
          const {elements, state} = window.boardejectSnapshot();
          const element = elements.find(candidate => candidate.id === id);
          return [(element.x + 20 + state.scrollX) * state.zoom.value + state.offsetLeft,
                  (element.y + 15 + state.scrollY) * state.zoom.value + state.offsetTop];
        }""", text_id)
        page.mouse.dblclick(point[0], point[1])
        page.locator("textarea").wait_for(state="visible")
        page.keyboard.press("Meta+a")
        page.keyboard.type("Still editable.", delay=55)
        page.keyboard.press("Escape")
        page.wait_for_timeout(1400)
        duration = time.monotonic() - started
        path = page.video.path()
        context.close()
        browser.close()

    subprocess.run(
        [ffmpeg, "-y", "-i", str(path), "-an", "-t", f"{min(duration + 0.5, 15):.3f}", "-c:v", "libx264", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(output / "demo.mp4")],
        check=True,
        capture_output=True,
    )
    subprocess.run(
        [ffmpeg, "-y", "-i", str(output / "demo.mp4"), "-filter_complex", "fps=12,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer:bayer_scale=4", "-loop", "0", str(output / "demo.gif")],
        check=True,
        capture_output=True,
    )

print("Recorded a genuine Freeform clipboard import through the localhost helper.")
