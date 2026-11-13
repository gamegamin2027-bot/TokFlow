import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Les tests de traitement utilisent le FFmpeg fourni par la dépendance de développement.
const ffmpeg = process.env.FFMPEG_PATH || (createRequire(import.meta.url)("ffmpeg-static") as string);

export default defineConfig({
  test: { include: ["tests/**/*.test.ts"], environment: "node", env: { FFMPEG_PATH: ffmpeg }, testTimeout: 120_000, hookTimeout: 240_000 },
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
});
