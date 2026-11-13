import { readFileSync, statSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const FIXTURE = "e2e/.fixtures/coupes.mp4"; // 6 bannières de 2,5 s, coupes franches
const LIVE = "https://www.tiktok.com/@scout2015/video/6718335390845095173";

/** Noms des fichiers d'une archive ZIP (lecture du répertoire central). */
function zipNames(path: string): string[] {
  const buf = readFileSync(path);
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  let p = buf.readUInt32LE(end + 16);
  return Array.from({ length: buf.readUInt16LE(end + 10) }, () => {
    const len = buf.readUInt16LE(p + 28);
    const name = buf.subarray(p + 46, p + 46 + len).toString("utf8");
    p += 46 + len + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
    return name;
  });
}

async function analyseFixture(page: Page) {
  await page.goto("/");
  await page.getByRole("radio", { name: "Bannières" }).click();
  await expect(page.getByTestId("mode-hint")).toContainText("séquence animée");
  await page.getByTestId("file-input").setInputFiles(FIXTURE);
  const result = page.getByTestId("result");
  await expect(result.getByRole("tab", { name: /Bannières/ })).toHaveAttribute("aria-selected", "true");
  await expect(result.getByTestId("banner-results")).toBeVisible({ timeout: 60_000 });
  return result;
}

test("bannières : analyse réelle, grille, sélection et archive ZIP limitée à la sélection", async ({ page }) => {
  const result = await analyseFixture(page);
  await expect(result.getByTestId("banner-verdict")).toContainText("6 séquences");
  await expect(result.getByTestId("banner-card")).toHaveCount(6);
  await expect(result.getByTestId("banner-badge")).toHaveText("6");
  await expect(result.getByTestId("banner-count")).toHaveText("6 sélectionnées sur 6");
  await expect(result.getByTestId("banner-download")).toHaveText("Télécharger les 6 bannières sélectionnées");
  // Chaque carte : vignette réelle, durée, case à cocher, aperçu, téléchargement.
  const first = result.getByTestId("banner-card").first();
  await expect(first).toContainText("Bannière 01");
  await expect(first).toContainText("2,5 s");
  await expect.poll(() => first.locator("img").evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(100);

  // Compteur mis à jour en direct.
  await result.getByRole("button", { name: "Tout désélectionner" }).click();
  await expect(result.getByTestId("banner-count")).toHaveText("0 sélectionnée sur 6");
  await expect(result.getByTestId("banner-download")).toBeDisabled();
  await result.getByLabel("Sélectionner Bannière 02").check({ force: true });
  await result.getByLabel("Sélectionner Bannière 05").check({ force: true });
  await expect(result.getByTestId("banner-count")).toHaveText("2 sélectionnées sur 6");
  await expect(result.getByTestId("banner-download")).toHaveText("Télécharger les 2 bannières sélectionnées");

  const download = page.waitForEvent("download", { timeout: 90_000 });
  await result.getByTestId("banner-download").click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("coupes-bannieres.zip");
  expect(zipNames(await file.path())).toEqual(["Bannière 02.mp4", "Bannière 05.mp4"]);
  await expect(result.locator('[data-testid="saved"]:visible')).toContainText("coupes-bannieres.zip");

  await result.getByRole("button", { name: "Tout sélectionner" }).click();
  await expect(result.getByTestId("banner-count")).toHaveText("6 sélectionnées sur 6");
});

test("bannières : téléchargement individuel, aperçu vidéo et correction manuelle du découpage", async ({ page }) => {
  const result = await analyseFixture(page);

  let download = page.waitForEvent("download", { timeout: 60_000 });
  await result.getByRole("button", { name: "Télécharger Bannière 03" }).click();
  let file = await download;
  expect(file.suggestedFilename()).toBe("Bannière 03.mp4");
  expect(statSync(await file.path()).size).toBeGreaterThan(20_000);

  // Aperçu : la vidéo est réellement lue, dans les limites de la bannière.
  await result.getByRole("button", { name: "Aperçu de Bannière 02" }).click();
  const dialog = page.getByTestId("banner-dialog");
  await expect(dialog).toContainText("Bannière 02 sur 6");
  await expect(dialog.getByTestId("banner-dialog-range")).toContainText("De 2,48 s à 4,98 s");
  const player = dialog.getByTestId("banner-player");
  await expect.poll(() => player.evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThanOrEqual(2);
  for (let i = 0; i < 5; i++) {
    const t = await player.evaluate((v: HTMLVideoElement) => v.currentTime);
    expect(t).toBeGreaterThan(2.2);
    expect(t).toBeLessThan(5.1);
    await page.waitForTimeout(300);
  }

  // Correction : début avancé de 0,2 s, fin reculée de 0,1 s, puis ré-extraction.
  await dialog.getByRole("button", { name: "Début : avancer de 0,1 seconde" }).click();
  await dialog.getByRole("button", { name: "Début : avancer de 0,1 seconde" }).click();
  await dialog.getByRole("button", { name: "Fin : reculer de 0,1 seconde" }).click();
  await expect(dialog.getByTestId("banner-dialog-range")).toContainText("De 2,68 s à 4,88 s · 2,2 s");
  await dialog.getByTestId("banner-apply").click();
  download = page.waitForEvent("download", { timeout: 60_000 });
  await dialog.getByTestId("banner-dialog-download").click();
  file = await download;
  expect(file.suggestedFilename()).toBe("Bannière 02.mp4");
  await expect(dialog).toHaveCount(0);
  const card = result.getByTestId("banner-card").nth(1);
  await expect(card).toContainText("ajustée");
  await expect(card).toContainText("2,2 s");

  // Fusion de deux bannières puis découpe : la numérotation suit.
  await result.getByRole("button", { name: "Ajuster Bannière 05" }).click();
  await dialog.getByRole("button", { name: "Fusionner avec la suivante" }).click();
  await expect(dialog).toContainText("Bannière 05 sur 5");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(result.getByTestId("banner-card")).toHaveCount(5);
  await expect(result.getByTestId("banner-card").nth(4)).toContainText("5,0 s");
});

test("bannières : le réglage du découpage relance la détection", async ({ page }) => {
  const result = await analyseFixture(page);
  await result.getByLabel("Réglage du découpage").click();
  await page.getByRole("option", { name: "Plus de coupes" }).click();
  await expect(result.getByLabel("Réglage du découpage")).toHaveText("Plus de coupes");
  await expect(result.getByTestId("banner-card")).toHaveCount(6);
});

test("bannières : la vidéo et le son restent disponibles à côté", async ({ page }) => {
  const result = await analyseFixture(page);
  await result.getByRole("tab", { name: "Audio" }).click();
  const download = page.waitForEvent("download", { timeout: 60_000 });
  await result.getByRole("button", { name: "Télécharger le son" }).click();
  expect((await download).suggestedFilename()).toBe("coupes.mp3");
  await result.getByRole("tab", { name: /Bannières/ }).click();
  await expect(result.getByTestId("banner-card")).toHaveCount(6); // l'analyse n'est pas perdue
});

/* ---------- Mode Auto (réponses simulées) ---------- */

const video = {
  id: "7123456789012345678",
  url: "https://www.tiktok.com/@demo/video/7123456789012345678",
  username: "demo",
  title: "Compilation",
  playerUrl: "https://www.tiktok.com/player/v1/7123456789012345678",
  durationSeconds: 15,
  linkDownload: true,
  qualities: [{ id: "h264_720p_1-0", label: "720p", codec: "H.264" }],
};
const job = (over: Record<string, unknown>) => ({ id: "a".repeat(32), status: "ready", progress: 1, label: "TokFlow-1", expiresAt: Date.now() + 600_000, sensitivity: "normal", duration: 15, width: 720, height: 1280, segments: [], ...over });
const segments = (n: number) => Array.from({ length: n }, (_, i) => ({ index: i + 1, start: i * 3, end: i * 3 + 3 }));

async function autoFlow(page: Page, ready: Record<string, unknown>) {
  let posted: unknown;
  await page.route("**/api/resolve", (r) => r.fulfill({ json: video }));
  await page.route("**/api/banners", (r) => {
    posted = r.request().postDataJSON();
    return r.fulfill({ status: 202, json: job({ status: "analysing", progress: 0.4 }) });
  });
  await page.route("**/api/banners/*", (r) => (r.request().method() === "GET" ? r.fulfill({ json: job(ready) }) : r.fulfill({ status: 204 })));
  await page.route("**/api/banners/*/thumb**", (r) => r.fulfill({ status: 404 }));
  await page.goto("/");
  await page.getByLabel("Lien de la vidéo TikTok").fill(video.url);
  await page.getByLabel("Lien de la vidéo TikTok").press("Enter");
  await expect(page.getByTestId("result-title")).toHaveText("Compilation");
  return () => posted;
}

test("mode Auto : une compilation de bannières ouvre l'onglet Bannières", async ({ page }) => {
  const posted = await autoFlow(page, { verdict: "banners", reason: "5 séquences de durée comparable (environ 3,0 s) : cette vidéo ressemble à une compilation de bannières.", segments: segments(5) });
  const result = page.getByTestId("result");
  await expect(result.getByRole("tab", { name: /Bannières/ })).toHaveAttribute("aria-selected", "true");
  await expect(result.getByTestId("auto-note")).toContainText("Mode Auto");
  await expect(result.getByTestId("banner-card")).toHaveCount(5);
  expect(posted()).toEqual({ url: video.url, quality: "h264_720p_1-0" });
  // Les deux autres modes restent accessibles.
  await result.getByRole("tab", { name: "Vidéo" }).click();
  await expect(result.getByRole("button", { name: "Télécharger la vidéo" })).toBeVisible();
});

test("mode Auto : une vidéo classique reste sur l'onglet Vidéo, sans classement inventé", async ({ page }) => {
  await autoFlow(page, { verdict: "single", reason: "Une seule séquence continue a été détectée : cette vidéo ressemble à une vidéo classique.", segments: segments(1) });
  const result = page.getByTestId("result");
  await expect(result.getByRole("tab", { name: /Bannières/ }).locator("svg.animate-spin")).toHaveCount(0);
  await expect(result.getByRole("tab", { name: "Vidéo" })).toHaveAttribute("aria-selected", "true");
  await expect(result.getByTestId("banner-badge")).toHaveCount(0);
  await result.getByRole("tab", { name: /Bannières/ }).click();
  await expect(result.getByTestId("banner-verdict")).toContainText("vidéo classique");
});

test("bannières : une analyse expirée propose de la relancer", async ({ page }) => {
  await page.route("**/api/resolve", (r) => r.fulfill({ json: video }));
  await page.route("**/api/banners", (r) => r.fulfill({ status: 202, json: job({ status: "analysing", progress: 0.2 }) }));
  await page.route("**/api/banners/*", (r) => r.fulfill({ status: 410, json: { error: { code: "EXPIRED", message: "Cette analyse a expiré : les fichiers temporaires ont été supprimés. Relancez la récupération." } } }));
  await page.goto("/");
  await page.getByRole("radio", { name: "Bannières" }).click();
  await page.getByLabel("Lien de la vidéo TikTok").fill(video.url);
  await page.getByLabel("Lien de la vidéo TikTok").press("Enter");
  const result = page.getByTestId("result");
  await expect(result).toContainText("Cette analyse a expiré");
  await expect(result.getByRole("button", { name: "Relancer l'analyse" })).toBeVisible();
});

test.describe("TikTok réel (E2E_LIVE=1)", () => {
  test.skip(!process.env.E2E_LIVE, "Tests réseau réels, activés avec E2E_LIVE=1");

  test("lien réel en mode Bannières : analyse complète puis téléchargement d'une séquence", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("radio", { name: "Bannières" }).click();
    await page.getByLabel("Lien de la vidéo TikTok").fill(LIVE);
    await page.getByLabel("Lien de la vidéo TikTok").press("Enter");
    const result = page.getByTestId("result");
    await expect(result.getByTestId("banner-results")).toBeVisible({ timeout: 120_000 });
    expect(await result.getByTestId("banner-card").count()).toBeGreaterThanOrEqual(1);
    const download = page.waitForEvent("download", { timeout: 120_000 });
    await result.getByRole("button", { name: "Télécharger Bannière 01" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe("Bannière 01.mp4");
    expect(statSync(await file.path()).size).toBeGreaterThan(50_000);
  });
});
