import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    target: "es2022",
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        entryFileNames: "game.js",
        assetFileNames: "[name][extname]",
      },
    },
  },
});
