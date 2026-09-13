import { copyFileSync } from "node:fs";

// A real HTML entry keeps Cloudflare Pages' clean-URL canonicalization from
// redirecting a rewrite of /index.html back to the home page.
copyFileSync("dist/index.html", "dist/test-capture.html");
