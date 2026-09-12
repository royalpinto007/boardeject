"""Record genuine browser interactions. Never imitate Apple Freeform footage."""
import argparse
import subprocess
import tempfile
import time
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_check import open_example, prove_editability

parser = argparse.ArgumentParser()
parser.add_argument('--replace', action='store_true')
args = parser.parse_args()
docs = Path('docs')
for name in ('demo.mp4', 'demo.gif', 'demo-poster.png'):
    if (docs / name).exists() and not args.replace:
        raise SystemExit('Demo exists. Use --replace to regenerate.')
with tempfile.TemporaryDirectory(prefix='boardeject-demo-') as temporary:
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='chrome', headless=True)
        context = browser.new_context(viewport={'width': 1440, 'height': 900}, record_video_dir=temporary, record_video_size={'width': 1440, 'height': 900})
        page = context.new_page()
        started = time.monotonic()
        open_example(page)
        start = time.monotonic() - started
        page.screenshot(path=str(docs / 'demo-poster.png'))
        page.wait_for_timeout(800)
        prove_editability(page, demo=True)
        page.wait_for_timeout(1800)
        path = page.video.path()
        context.close()
        browser.close()
    subprocess.run(['ffmpeg', '-y', '-ss', str(start), '-i', str(path), '-an', '-c:v', 'libx264', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(docs / 'demo.mp4')], check=True, capture_output=True)
    subprocess.run(['ffmpeg', '-y', '-i', str(docs / 'demo.mp4'), '-filter_complex', 'fps=15,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse', '-loop', '0', str(docs / 'demo.gif')], check=True, capture_output=True)
print('Recorded actual shape drag, following arrow and text edit. Synthetic board, no Freeform capture footage.')
