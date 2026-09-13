"""Compare SVG shadow alpha with a supplied genuine Freeform PNG.

Read-only experiment for the verified 64x48 capture rendered at 2x. Does not
promote captures or change conversion parameters. Inputs stay outside Git.
"""
import argparse
import base64
import json
from pathlib import Path
from PIL import Image
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument("native_png")
parser.add_argument("content_json")
parser.add_argument("resource_png")
args = parser.parse_args()
native = Image.open(args.native_png).convert("RGBA")
if native.size != (140, 108):
    raise SystemExit("This comparison only validates the 140x108 baseline render")
content = json.loads(Path(args.content_json).read_text())[0]
resource = base64.b64encode(Path(args.resource_png).read_bytes()).decode()
path = content["mask"]["path"]["bezier"]["path"]
# Native opaque image begins at x=6 and y=0 at 2x. Score only pixels outside
# the source rectangle, where image color cannot obscure shadow alpha.
indices = [(x, y) for y in range(108) for x in range(140) if x < 6 or x >= 134 or y >= 96]
with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome")
    page = browser.new_page()
    results = []
    for sigma in [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3]:
        svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="140" height="108" viewBox="-3 0 70 54"><defs><clipPath id="m"><path d="{path}"/></clipPath><filter id="s" x="-100%" y="-100%" width="300%" height="300%"><feDropShadow dx="0" dy="2" stdDeviation="{sigma}" flood-opacity="0.25"/></filter></defs><g filter="url(#s)"><image width="64" height="48" href="data:image/png;base64,{resource}" clip-path="url(#m)"/></g></svg>'
        url = "data:image/svg+xml;base64," + base64.b64encode(svg.encode()).decode()
        pixels = page.evaluate("""async url => {
          const i=new Image();i.src=url;await i.decode();
          const c=document.createElement('canvas');c.width=140;c.height=108;
          const ctx=c.getContext('2d');ctx.drawImage(i,0,0);
          return Array.from(ctx.getImageData(0,0,140,108).data);
        }""", url)
        error = sum(abs(pixels[(y*140+x)*4+3]-native.getpixel((x,y))[3]) for x,y in indices)/len(indices)
        results.append({"svgSigma": sigma, "shadowAlphaMAE": error})
    browser.close()
print(json.dumps({"nativeRadius":3,"offset":2,"opacity":0.25,"pixelsCompared":len(indices),"results":results,"generalMappingVerified":False}, indent=2))
