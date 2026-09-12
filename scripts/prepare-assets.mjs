import { cpSync, mkdirSync } from "node:fs";
mkdirSync("apps/web/public/media", { recursive: true });
for (const asset of ["demo.mp4", "demo-poster.png"]) {
  cpSync(`docs/${asset}`, `apps/web/public/media/${asset}`);
}
mkdirSync("apps/web/public/vendor/excalidraw", { recursive: true });
cpSync(
  "node_modules/@excalidraw/excalidraw/dist/prod/fonts",
  "apps/web/public/vendor/excalidraw/fonts",
  { recursive: true },
);
