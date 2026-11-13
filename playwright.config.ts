import { defineConfig, devices } from "@playwright/test";
import ffmpegStatic from "ffmpeg-static";

const port = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  use: { baseURL: `http://127.0.0.1:${port}`, locale: "fr-FR", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "tablet", use: { ...devices["Desktop Chrome"], viewport: { width: 820, height: 1180 } }, testMatch: /screenshots|landing/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /screenshots|landing/ },
  ],
  webServer: {
    command: "node .next/standalone/server.js",
    url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      FFMPEG_PATH: process.env.FFMPEG_PATH ?? (ffmpegStatic as unknown as string),
      RATE_LIMIT_ANALYZE_PER_MIN: "1000",
      RATE_LIMIT_JOBS_PER_10MIN: "1000",
    },
  },
});
