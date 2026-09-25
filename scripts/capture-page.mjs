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
const explorerFallback = `<!-- static-fallback:start -->
<div class="static-fallback"><header class="static-nav"><a class="static-brand" href="/"><img src="/favicon.svg" width="30" height="30" alt="" />BoardEject</a><a href="/mac-helper">Mac helper</a></header><main class="static-page"><p class="static-kicker">Archive Explorer</p><h1>Your board, unpacked.</h1><p>Open a .boardejectarchive to verify it, browse original files, and download assets. Everything stays on your device.</p><p>Enable JavaScript to choose your archive. No Mac or helper required to open an existing archive.</p><a href="/">Create an archive →</a></main></div>
<!-- static-fallback:end -->`;
writeFileSync(
  "dist/open.html",
  home
    .replace(
      /<!-- static-fallback:start -->[\s\S]*<!-- static-fallback:end -->/,
      explorerFallback,
    )
    .replace(
      /<title>[^<]*<\/title>/,
      "<title>Open a Freeform archive | BoardEject</title>",
    )
    .replaceAll(
      'href="https://boardeject.dev/"',
      'href="https://boardeject.dev/open"',
    )
    .replace(
      'property="og:url" content="https://boardeject.dev/"',
      'property="og:url" content="https://boardeject.dev/open"',
    )
    .replaceAll(
      "BoardEject | Your board. Your format.",
      "Open a Freeform archive | BoardEject",
    ),
);
for (const name of [
  "ink-pen.drawing",
  "real-board.crlnative",
  "NOTICE.md",
  "LICENSE-MIT",
]) {
  copyFileSync(`tests/fixtures/upstream/${name}`, `dist/samples/${name}`);
}
