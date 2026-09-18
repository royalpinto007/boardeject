import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

// A real HTML entry keeps Cloudflare Pages' clean-URL canonicalization from
// redirecting a rewrite of /index.html back to the home page.
const home = readFileSync("dist/index.html", "utf8");
const captureFallback = `<!-- static-fallback:start -->
<div class="static-fallback">
<header class="static-nav"><a href="/">↗ BoardEject</a><a href="/mac-helper">Get the Mac helper</a></header>
<main class="static-page"><p class="static-kicker">Experimental capture tester</p><h1>Test a capture.</h1><p class="static-intro">Choose a file. Get editable Excalidraw. Nothing is uploaded.</p><div class="static-actions"><a href="/mac-helper">Create a capture on Mac</a></div><p>Enable JavaScript to choose a file and review the conversion.</p></main>
</div>
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
