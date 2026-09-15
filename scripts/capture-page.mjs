import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

// A real HTML entry keeps Cloudflare Pages' clean-URL canonicalization from
// redirecting a rewrite of /index.html back to the home page.
const home = readFileSync("dist/index.html", "utf8");
const captureFallback = `<!-- static-fallback:start -->
<header class="static-nav"><a href="/">↗ BoardEject</a><a href="/mac-helper">Get the Mac helper</a></header>
<main class="static-page"><p class="static-kicker">Experimental capture tester</p><h1>See what your Freeform capture can become.</h1><p class="static-intro">Choose or drop a genuine BoardEject capture. It is parsed locally in your browser, then you can review converted and unsupported objects, preview the result, and download an editable .excalidraw file.</p><div class="static-actions"><a href="/mac-helper">Create a capture on Mac</a><a href="/samples/real-board.crlnative">Download a test sample</a></div><section><h2>Nothing is uploaded</h2><p>Your capture stays in this browser. Malformed and unsupported inputs fail with a clear report.</p></section><section><h2>Try the full page</h2><p>JavaScript is required for local parsing, preview, and download. Enable it to choose a capture.</p></section></main>
<!-- static-fallback:end -->`;
writeFileSync(
  "dist/test-capture.html",
  home.replace(
    /<!-- static-fallback:start -->[\s\S]*<!-- static-fallback:end -->/,
    captureFallback,
  ),
);
mkdirSync("dist/samples", { recursive: true });
for (const name of [
  "ink-pen.drawing",
  "real-board.crlnative",
  "NOTICE.md",
  "LICENSE-MIT",
]) {
  copyFileSync(`tests/fixtures/upstream/${name}`, `dist/samples/${name}`);
}
