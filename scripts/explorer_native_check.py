"""Validate an externally supplied genuine archive. Never commit private input."""
import argparse
import hashlib
import json
import os
from pathlib import Path
from zipfile import ZipFile
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument("archive", type=Path)
parser.add_argument("--url", default=os.environ.get("BOARDEJECT_TEST_URL", "http://127.0.0.1:4190"))
args = parser.parse_args()
with ZipFile(args.archive) as archive:
    manifest = json.loads(archive.read("manifest.json"))
    originals = {a["sha256"]: archive.read(a["archivePath"]) for a in manifest["assets"] if a["status"] != "missing"}

with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome", headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 1000})
    page.goto(args.url.rstrip("/") + "/open")
    page.wait_for_load_state("networkidle")
    requests = []
    page.on("request", lambda r: requests.append(r.url) if r.url.startswith(("https:", "http:")) and "cloudflareinsights" not in r.url else None)
    page.get_by_label("Choose archive", exact=True).set_input_files(args.archive)
    expect(page.get_by_role("heading", name="Archive verified", exact=True)).to_be_visible()
    expect(page.get_by_role("heading", name=manifest["board"]["title"], exact=True)).to_be_visible()
    while page.get_by_role("button", name="Preview", exact=True).count():
        page.get_by_role("button", name="Preview", exact=True).first.click()
    for img in page.locator(".archive-media img").all():
        expect(img).to_be_visible()
        assert img.evaluate("el => el.complete && el.naturalWidth > 0")
    for video in page.locator(".archive-media video").all():
        video.evaluate("el => new Promise((resolve,reject) => { if(el.readyState >= 1) return resolve(); el.onloadedmetadata=resolve; el.onerror=()=>reject('Video decode failed'); setTimeout(()=>reject('Video timeout'),10000); })")
    with page.expect_download() as download:
        page.get_by_role("button", name="Download all files").click()
    with ZipFile(download.value.path()) as extracted:
        hashes = {hashlib.sha256(extracted.read(n)).hexdigest() for n in extracted.namelist()}
        assert hashes == set(originals), "Extracted originals differ"
    for width in (320, 390, 768, 1024, 1440):
        page.set_viewport_size({"width": width, "height": 1000})
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), width
    assert not requests, requests
    browser.close()
print(f"PASS: genuine archive, {len(manifest['assets'])} asset references, exact extracted hashes, media, responsive layout, no archive network requests")
