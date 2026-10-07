import { defineConfig } from "vite";

// core/ lives one level up and is read-only for the app (owned by 钉).
export default defineConfig({
  base: "./",
  server: { host: true, fs: { allow: [".."] } },
  preview: { host: true },
  build: { target: "es2022", assetsInlineLimit: 0, chunkSizeWarningLimit: 900 },
  test: { include: ["test/**/*.test.ts"] },
} as any);
