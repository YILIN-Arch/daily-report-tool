import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(process.cwd(), "index.html"),
        v2: resolve(process.cwd(), "v2.html"),
        v3: resolve(process.cwd(), "v3.html"),
      },
    },
  },
});
