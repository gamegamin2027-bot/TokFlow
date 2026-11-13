import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";
import { createClipSource } from "@/lib/banners/clip-source";

const hasClient = (() => {
  try {
    execFileSync("python3", ["-c", "import curl_cffi"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

// Le service refuse le client standard (403) : le client « navigateur » prend le relais, puis est conservé.
it.skipIf(!hasClient)("service de clips : repli sur le client navigateur après un refus 403", async () => {
  const seen: string[] = [];
  const server = createServer((req, res) => {
    const agent = req.headers["user-agent"] ?? "";
    const standard = !req.headers["sec-ch-ua"]; // le client standard n'envoie pas les en-têtes d'un navigateur
    seen.push(standard ? "standard" : "navigateur");
    if (standard) return res.writeHead(403, { "content-type": "text/html" }).end("<html>refusé</html>");
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ code: 0, data: { id: "7000000000000000001", agent, live_images: ["https://v16.tiktokcdn.com/1.mp4"], images: [] } }));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const api = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/`;
  const link = { id: "7000000000000000001", username: "compte", kind: "photo" as const, canonical: "https://www.tiktok.com/@compte/photo/7000000000000000001" };
  try {
    const source = createClipSource({ TIKWM_API_URL: api })!;
    expect(await source.fetchClips(link)).toEqual({ clips: ["https://v16.tiktokcdn.com/1.mp4"], images: [] });
    expect(seen).toEqual(["standard", "navigateur"]);
    await source.fetchClips(link);
    expect(seen).toEqual(["standard", "navigateur", "navigateur"]); // retenu : plus d'essai inutile
    // Client navigateur désactivé : l'erreur d'origine est rapportée.
    const plain = createClipSource({ TIKWM_API_URL: api, BANNER_BROWSER_CLIENT: "none" })!;
    await expect(plain.fetchClips(link)).rejects.toMatchObject({ code: "CLIPS_ERROR", detail: expect.stringContaining("HTTP 403") });
  } finally {
    server.close();
  }
}, 30_000);
