import { copyFileSync, mkdirSync } from "node:fs";

// A real HTML entry keeps Cloudflare Pages' clean-URL canonicalization from
// redirecting a rewrite of /index.html back to the home page.
copyFileSync("dist/index.html", "dist/test-capture.html");
mkdirSync("dist/samples", { recursive: true });
for (const name of [
  "ink-pen.drawing",
  "real-board.crlnative",
  "NOTICE.md",
  "LICENSE-MIT",
]) {
  copyFileSync(`tests/fixtures/upstream/${name}`, `dist/samples/${name}`);
}
