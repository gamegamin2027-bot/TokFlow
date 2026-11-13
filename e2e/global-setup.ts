import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import ffmpegStatic from "ffmpeg-static";

/** Génère une courte vidéo de test (mire + son) pour les tests de conversion réels. */
export default function globalSetup() {
  mkdirSync("e2e/.fixtures", { recursive: true });
  const ffmpeg = process.env.FFMPEG_PATH ?? (ffmpegStatic as unknown as string);
  execFileSync(ffmpeg, ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=size=720x1280:rate=24:duration=2", "-f", "lavfi", "-i", "sine=frequency=440:duration=2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", "e2e/.fixtures/sample.mp4"]);
}
