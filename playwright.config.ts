import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";
import ffmpegStatic from "ffmpeg-static";

const port = Number(process.env.E2E_PORT ?? 3100);
export const MAIL_PORT = Number(process.env.E2E_MAIL_PORT ?? 3199);
export const FOUNDER_STATE = "e2e/.data/founder.json";

const desktop = { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } };

export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  use: { baseURL: `http://127.0.0.1:${port}`, locale: "fr-FR", trace: "retain-on-failure" },
  projects: [
    // 1. Base vide : le premier visiteur crée le compte fondateur (testé dans le navigateur).
    { name: "premiere-visite", testMatch: /first-visit\.setup\.ts/, use: desktop },
    // 2. Le reste du site, une fois le fondateur créé.
    { name: "desktop", use: desktop, dependencies: ["premiere-visite"] },
    { name: "tablet", use: { ...devices["Desktop Chrome"], viewport: { width: 820, height: 1180 } }, testMatch: /(screenshots|landing)\.spec\.ts/, dependencies: ["premiere-visite"] },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /(screenshots|landing|support|flow)\.spec\.ts/, dependencies: ["premiere-visite"] },
  ],
  webServer: {
    // Base PostgreSQL embarquée neuve à chaque exécution.
    command: "rm -rf e2e/.data && node .next/standalone/server.js",
    url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      FFMPEG_PATH: process.env.FFMPEG_PATH ?? (ffmpegStatic as unknown as string),
      RATE_LIMIT_ANALYZE_PER_MIN: "1000",
      RATE_LIMIT_JOBS_PER_10MIN: "1000",
      RATE_LIMIT_SUPPORT_PER_HOUR: "1000",
      ALLOW_EMBEDDED_DB: "1",
      // Chemin absolu : le serveur autonome change de répertoire de travail.
      DATA_DIR: resolve("e2e/.data/pg"),
      INSECURE_COOKIES: "1",
      // Le vrai client Resend de l'application parle à un serveur HTTP local qui enregistre les envois.
      RESEND_API_URL: `http://127.0.0.1:${MAIL_PORT}/emails`,
      RESEND_API_KEY: "re_test_key",
      EMAIL_FROM: "TokFlow <support@tokflow.test>",
    },
  },
});
