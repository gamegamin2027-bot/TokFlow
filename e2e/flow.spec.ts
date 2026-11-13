import { expect, test } from "@playwright/test";

const analyzed = {
  id: "7123456789012345678",
  url: "https://www.tiktok.com/@demo/video/7123456789012345678",
  username: "demo",
  title: "Vidéo de démonstration",
  authorName: "Compte Démo",
  playerUrl: "https://www.tiktok.com/player/v1/7123456789012345678",
  durationSeconds: 42,
  linkDownload: true,
  qualities: [
    { id: "h264_1080p_1-0", label: "1080p", codec: "H.264", sizeBytes: 8_400_000 },
    { id: "h264_540p_1-0", label: "540p", codec: "H.264", sizeBytes: 2_100_000 },
  ],
};

test("un lien invalide affiche une erreur claire et une alternative (API réelle)", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Lien de la vidéo TikTok").fill("https://example.com/video");
  await page.getByRole("button", { name: "Analyser le lien" }).click();
  const alert = page.locator("#analyze-error");
  await expect(alert).toContainText("Seuls les liens tiktok.com sont pris en charge");
  await expect(alert.getByRole("button", { name: /convertir un fichier/ })).toBeVisible();
});

test("un champ vide ne déclenche aucune requête", async ({ page }) => {
  let called = false;
  await page.route("**/api/analyze", (r) => {
    called = true;
    return r.abort();
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Analyser le lien" }).click();
  await expect(page.locator("#analyze-error")).toContainText("Collez d'abord le lien");
  expect(called).toBe(false);
});

test("parcours lien → choix du format → téléchargement (TikTok simulé côté réseau)", async ({ page }) => {
  await page.route("**/api/analyze", (r) => r.fulfill({ json: analyzed }));
  let payload: Record<string, unknown> = {};
  await page.route("**/api/download", (r) => {
    payload = r.request().postDataJSON();
    return r.fulfill({ status: 200, contentType: "video/mp4", headers: { "content-disposition": 'attachment; filename="tiktok-demo.mp4"' }, body: Buffer.alloc(2048) });
  });
  await page.goto("/");
  await page.getByLabel("Lien de la vidéo TikTok").fill(analyzed.url);
  await page.getByRole("button", { name: "Analyser le lien" }).click();

  const result = page.getByTestId("result");
  await expect(result.getByTestId("result-title")).toHaveText("Vidéo de démonstration");
  await expect(result).toContainText("Sans filigrane");
  await expect(result.getByRole("radio", { name: /1080p · Meilleure/ })).toHaveAttribute("aria-checked", "true");

  await result.getByRole("radio", { name: /540p/ }).click();
  const download = page.waitForEvent("download");
  await result.getByRole("button", { name: "Télécharger sans filigrane" }).click();
  expect((await download).suggestedFilename()).toBe("tiktok-demo.mp4");
  await expect(result.getByTestId("saved")).toContainText("tiktok-demo.mp4");
  expect(payload).toEqual({ url: analyzed.url, format: "mp4", quality: "h264_540p_1-0" });

  await result.getByRole("radio", { name: /MP3/ }).click();
  await expect(result.getByRole("button", { name: "Télécharger l'audio MP3" })).toBeVisible();
  await expect(result.getByRole("radio", { name: /192 kbps/ })).toHaveAttribute("aria-checked", "true");
});

test("une erreur serveur pendant le téléchargement est affichée avec « Réessayer »", async ({ page }) => {
  await page.route("**/api/analyze", (r) => r.fulfill({ json: analyzed }));
  await page.route("**/api/download", (r) => r.fulfill({ status: 503, json: { error: { code: "BUSY", message: "Le service traite déjà plusieurs fichiers." } } }));
  await page.goto("/");
  await page.getByLabel("Lien de la vidéo TikTok").fill(analyzed.url);
  await page.getByRole("button", { name: "Analyser le lien" }).click();
  await page.getByRole("button", { name: "Télécharger sans filigrane" }).click();
  await expect(page.getByTestId("result").getByRole("alert")).toContainText("Le service traite déjà plusieurs fichiers.");
  await expect(page.getByRole("button", { name: "Réessayer" })).toBeVisible();
});

test("un lien non téléchargeable explique la limite et propose des alternatives", async ({ page }) => {
  await page.route("**/api/analyze", (r) => r.fulfill({ json: { ...analyzed, linkDownload: false, qualities: [], linkUnavailableReason: "TikTok ne met à disposition pour cette vidéo qu'une version avec filigrane incrusté." } }));
  await page.goto("/");
  await page.getByLabel("Lien de la vidéo TikTok").fill(analyzed.url);
  await page.getByRole("button", { name: "Analyser le lien" }).click();
  const result = page.getByTestId("result");
  await expect(result.getByRole("alert")).toContainText("version avec filigrane");
  await expect(result.getByRole("button", { name: "Convertir un fichier", exact: true })).toBeVisible();
  await expect(result.getByRole("link", { name: /Ouvrir sur TikTok/ })).toBeVisible();
  await expect(result.getByTestId("download-button")).toHaveCount(0);
});

test("conversion réelle d'un fichier importé en MP3 (FFmpeg, sans simulation)", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("file-input").setInputFiles("e2e/.fixtures/sample.mp4");
  const result = page.getByTestId("result");
  await expect(result.getByTestId("result-title")).toHaveText("sample.mp4");
  await expect(result.getByRole("radio", { name: /Originale · 720p/ })).toBeVisible();
  await expect(result.getByRole("radio", { name: /1080p/ })).toHaveCount(0);

  await result.getByRole("radio", { name: /MP3/ }).click();
  const download = page.waitForEvent("download");
  await result.getByTestId("download-button").click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("sample.mp3");
  const { statSync } = await import("node:fs");
  expect(statSync(await file.path()).size).toBeGreaterThan(5000);
});

test("lien TikTok réel : analyse puis MP4 sans filigrane (E2E_LIVE=1)", async ({ page }) => {
  test.skip(!process.env.E2E_LIVE, "Test réseau réel, activé avec E2E_LIVE=1");
  await page.goto("/");
  await page.getByLabel("Lien de la vidéo TikTok").fill("https://www.tiktok.com/@scout2015/video/6718335390845095173");
  await page.getByRole("button", { name: "Analyser le lien" }).click();
  const result = page.getByTestId("result");
  await expect(result).toContainText("Sans filigrane", { timeout: 40_000 });
  const download = page.waitForEvent("download", { timeout: 80_000 });
  await result.getByRole("button", { name: "Télécharger sans filigrane" }).click();
  expect((await download).suggestedFilename()).toMatch(/^tiktok-scout2015-\d+\.mp4$/);
});
