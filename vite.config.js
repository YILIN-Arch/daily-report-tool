import { resolve } from "node:path";
import { defineConfig } from "vite";

const isDailyReportBuild = process.env.BUILD_TARGET === "daily-report";
const isGitHubPagesBuild = process.env.GITHUB_PAGES === "true";
const pagesRepo = process.env.PAGES_REPO || "daily-report-tool";
const pagesBase = `/${pagesRepo}/`;

export default defineConfig({
  base: isGitHubPagesBuild ? pagesBase : "/",
  publicDir: isDailyReportBuild ? false : "public",
  build: {
    rollupOptions: {
      input: isDailyReportBuild
        ? {
            dailyReport: resolve(process.cwd(), "daily-report.html"),
          }
        : {
            dailyReport: resolve(process.cwd(), "daily-report.html"),
            main: resolve(process.cwd(), "index.html"),
            v2: resolve(process.cwd(), "v2.html"),
            v3: resolve(process.cwd(), "v3.html"),
          },
    },
  },
});
