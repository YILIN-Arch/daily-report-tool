import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(process.cwd(), "index.html"),
        v1: resolve(process.cwd(), "v1.html"),
        v2: resolve(process.cwd(), "v2.html"),
      },
    },
  },
});
