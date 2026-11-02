import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";

// The integration manifest is the single source of truth for the version number.
const manifest = JSON.parse(
  readFileSync(resolve(__dirname, "../custom_components/skydark_calendar/manifest.json"), "utf8")
) as { version: string };

export default defineConfig({
  plugins: [react()],
  define: {
    __SKYDARK_VERSION__: JSON.stringify(manifest.version),
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  base: "/skydark/",
  server: {
    proxy: {
      "/api": "http://127.0.0.1:4000",
    },
  },
  build: {
    outDir: resolve(__dirname, "../custom_components/skydark_calendar/www"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
      },
      output: {
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
