import { cpSync, mkdirSync } from "node:fs";
mkdirSync("apps/web/public/vendor/excalidraw", { recursive: true });
cpSync(
  "node_modules/@excalidraw/excalidraw/dist/prod/fonts",
  "apps/web/public/vendor/excalidraw/fonts",
  { recursive: true },
);
