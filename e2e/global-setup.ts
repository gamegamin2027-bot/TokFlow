import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createServer } from "node:http";
import ffmpegStatic from "ffmpeg-static";
import { MAIL_PORT } from "../playwright.config";

type Sent = { authorization: string | undefined; body: Record<string, unknown> };

/**
 * - Génère une courte vidéo de test (mire + son) pour les conversions réelles.
 * - Démarre un faux point d'entrée Resend : il reçoit les vraies requêtes HTTP de l'application,
 *   les enregistre (GET /sent) et refuse les destinataires contenant « refus ».
 */
export default async function globalSetup() {
  mkdirSync("e2e/.fixtures", { recursive: true });
  const ffmpeg = process.env.FFMPEG_PATH ?? (ffmpegStatic as unknown as string);
  execFileSync(ffmpeg, ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=size=720x1280:rate=24:duration=2", "-f", "lavfi", "-i", "sine=frequency=440:duration=2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", "e2e/.fixtures/sample.mp4"]);

  const sent: Sent[] = [];
  const server = createServer((req, res) => {
    const json = (status: number, data: unknown) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    };
    if (req.method === "GET" && req.url === "/sent") return json(200, sent);
    if (req.method !== "POST" || req.url !== "/emails") return json(404, { message: "not found" });
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const body = JSON.parse(raw) as Record<string, unknown>;
      if (String((body.to as string[])[0]).includes("refus")) return json(422, { message: "Invalid `to` field" });
      sent.push({ authorization: req.headers.authorization, body });
      json(200, { id: `mock-${sent.length}` });
    });
  });
  await new Promise<void>((resolve) => server.listen(MAIL_PORT, "127.0.0.1", resolve));
  return () => new Promise<void>((resolve) => server.close(() => resolve()));
}
