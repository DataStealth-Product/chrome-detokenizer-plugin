import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  root: path.resolve(__dirname),
  publicDir: false,
  envDir: path.resolve(__dirname, ".."),
  build: {
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: false,
    sourcemap: true,
    rollupOptions: {
      input: path.resolve(__dirname, "src/content/index.ts"),
      output: {
        format: "iife",
        inlineDynamicImports: true,
        entryFileNames: "assets/content.js"
      }
    }
  }
});
