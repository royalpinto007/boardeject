import { defineConfig } from "vite";
export default defineConfig({
  worker: { format: 'es' },
  root: "apps/web",
  build: { outDir: "../../dist", emptyOutDir: true, target: "esnext" },
  server: { fs: { allow: ["../.."] } },
});
