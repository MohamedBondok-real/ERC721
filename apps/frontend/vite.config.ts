/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import * as path from "path";

const API_TARGET = process.env.VITE_PROXY_TARGET ?? "http://127.0.0.1:4000";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // The shared package is published as CJS with `export *` barrels, which a bundler cannot
      // statically analyse. Resolving straight to the TypeScript source keeps the frontend on a
      // single copy of the domain rules, wording and hash derivations.
      "@breastcare/shared": path.resolve(__dirname, "../../packages/shared/src/index.ts"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: false,
    // Browser code never calls localhost directly: every request goes to a relative /api URL
    // and the dev server proxies it, which also keeps the preview origin working.
    proxy: {
      "/api": { target: API_TARGET, changeOrigin: true },
    },
  },
  preview: {
    host: "0.0.0.0",
    port: 5173,
    proxy: { "/api": { target: API_TARGET, changeOrigin: true } },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    chunkSizeWarningLimit: 1400,
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
