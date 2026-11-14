import { createHash, randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";

const video = {
  id: "7123456789012345678",
  url: "https://www.tiktok.com/@demo/video/7123456789012345678",
  username: "demo",
  title: "Vidéo de démonstration",
  authorName: "Compte Démo",
  playerUrl: "https://www.tiktok.com/player/v1/7123456789012345678",
  durationSeconds: 42,
  linkDownload: true,
  qualities: [{ id: "h264_540p_1-0", label: "540p", codec: "H.264", sizeBytes: 2_100_000 }],
};

test("un lien partagé à l'ouverture (/?lien=…) est traité aussitôt et retiré de l'adresse", async ({ page }) => {
  const seen: unknown[] = [];
  await page.route("**/api/resolve", (r) => {
    seen.push((r.request().postDataJSON() as { url: string }).url);
    return r.fulfill({ json: video });
  });
  await page.goto(`/?lien=${encodeURIComponent(video.url)}`);
  await expect(page.getByTestId("result").getByTestId("result-title")).toHaveText("Vidéo de démonstration");
  await expect(page.getByLabel("Lien de la vidéo TikTok")).toHaveValue(video.url);
  expect(seen).toEqual([video.url]);
  expect(new URL(page.url()).search).toBe("");
});

test("dans l'application : le fichier est remis à l'application octet pour octet, le presse-papiers vient d'elle", async ({ page }) => {
  // Fausse application : même protocole de messages que l'application Android.
  await page.addInitScript((link) => {
    const files = new Map<string, string[]>();
    const saved: { name: string; mime: string; base64: string[] }[] = [];
    const app = {
      onmessage: null as ((e: { data: string }) => void) | null,
      postMessage(raw: string) {
        const m = JSON.parse(raw) as { id: number; type: string; file?: string; name?: string; mime?: string; data?: string };
        const reply = (extra: object) => setTimeout(() => app.onmessage?.({ data: JSON.stringify({ id: m.id, ok: true, ...extra }) }), 0);
        if (m.type === "clipboard") return reply({ text: link });
        if (m.type === "begin") {
          const file = `f${files.size + 1}`;
          files.set(file, []);
          (window as unknown as { __meta: Record<string, object> }).__meta = { ...(window as unknown as { __meta?: Record<string, object> }).__meta, [file]: { name: m.name, mime: m.mime } };
          return reply({ text: file });
        }
        if (m.type === "chunk") {
          files.get(m.file!)!.push(m.data!);
          return reply({});
        }
        if (m.type === "finish") {
          const meta = (window as unknown as { __meta: Record<string, { name: string; mime: string }> }).__meta[m.file!];
          saved.push({ ...meta, base64: files.get(m.file!)! });
          return reply({});
        }
      },
    };
    Object.assign(window, { TokFlowApp: app, __saved: saved });
  }, video.url);

  const body = randomBytes(1_000_003); // plusieurs morceaux, taille non multiple de 3
  await page.route("**/api/resolve", (r) => r.fulfill({ json: video }));
  await page.route("**/api/download", (r) => r.fulfill({ status: 200, contentType: "video/mp4", headers: { "content-disposition": 'attachment; filename="tiktok-demo.mp4"' }, body }));

  await page.goto("/");
  await page.getByRole("button", { name: "Coller" }).click();
  const result = page.getByTestId("result");
  await expect(result.getByTestId("result-title")).toHaveText("Vidéo de démonstration");

  let browserDownload = false;
  page.on("download", () => (browserDownload = true));
  await result.getByRole("button", { name: "Télécharger la vidéo" }).click();
  await expect(result.getByTestId("saved")).toContainText("tiktok-demo.mp4");

  const saved = await page.evaluate(() => (window as unknown as { __saved: { name: string; mime: string; base64: string[] }[] }).__saved);
  expect(saved).toHaveLength(1);
  expect(saved[0].name).toBe("tiktok-demo.mp4");
  expect(saved[0].mime).toBe("video/mp4");
  expect(saved[0].base64.length).toBeGreaterThan(2);
  const received = Buffer.concat(saved[0].base64.map((part) => Buffer.from(part, "base64")));
  expect(received.length).toBe(body.length);
  expect(createHash("sha256").update(received).digest("hex")).toBe(createHash("sha256").update(body).digest("hex"));
  expect(browserDownload).toBe(false);
});
