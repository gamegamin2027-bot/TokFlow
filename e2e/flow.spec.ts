import { statSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { choose } from "./select";

const video = {
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
const LIVE = "https://www.tiktok.com/@scout2015/video/6718335390845095173";

const field = (page: Page) => page.getByLabel("Lien de la vidéo TikTok");
const paste = (page: Page, text: string) =>
  field(page).evaluate((el, value) => {
    const data = new DataTransfer();
    data.setData("text/plain", value);
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, text);

// Les tests à réponses simulées n'ont pas à lancer une vraie analyse de bannières (mode Auto).
test.beforeEach(async ({ page }, info) => {
  if (/réel/i.test(info.titlePath.join(" "))) return;
  await page.route("**/api/banners", (r) => r.fulfill({ status: 503, json: { error: { code: "BUSY", message: "Analyse désactivée dans ce test." } } }));
});

test("coller un lien lance la récupération sans autre action", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/resolve", async (r) => {
    calls++;
    await new Promise((res) => setTimeout(res, 400));
    return r.fulfill({ json: video });
  });
  await page.goto("/");
  await field(page).focus();
  await paste(page, video.url);
  await expect(page.getByTestId("skeleton")).toContainText("Récupération de la vidéo");
  const result = page.getByTestId("result");
  await expect(result.getByTestId("result-title")).toHaveText("Vidéo de démonstration");
  await expect(field(page)).toHaveValue(video.url);
  expect(calls).toBe(1);

  // La vidéo est affichée : miniature/lecteur, informations, durée, et les deux seules actions.
  await expect(result.getByRole("button", { name: "Lire la vidéo" })).toBeVisible();
  await expect(result).toContainText("0:42");
  await expect(result).toContainText("@demo");
  // Les trois modes sont proposés ; l'onglet Vidéo est ouvert par défaut.
  await expect(result.getByRole("tab")).toHaveText([/Vidéo/, /Audio/, /Bannières/]);
  await expect(result.getByRole("tab", { name: "Vidéo" })).toHaveAttribute("aria-selected", "true");
  await expect(result.getByRole("button", { name: "Télécharger la vidéo" })).toBeVisible();
  await result.getByRole("tab", { name: "Audio" }).click();
  await expect(result.getByRole("button", { name: "Télécharger le son" })).toBeVisible();
  await expect(result.getByRole("button", { name: "Télécharger la vidéo" })).toBeHidden();
  await expect(result.locator("a")).toHaveCount(0);
  await result.getByRole("button", { name: "Lire la vidéo" }).click();
  await expect(result.locator("iframe")).toHaveAttribute("src", video.playerUrl);
});

test("la touche Entrée lance la récupération ; vidéo puis son se téléchargent", async ({ page }) => {
  await page.route("**/api/resolve", (r) => r.fulfill({ json: video }));
  const payloads: Record<string, unknown>[] = [];
  await page.route("**/api/download", (r) => {
    const body = r.request().postDataJSON() as Record<string, unknown>;
    payloads.push(body);
    const mp3 = body.format === "mp3";
    return r.fulfill({ status: 200, contentType: mp3 ? "audio/mpeg" : "video/mp4", headers: { "content-disposition": `attachment; filename="tiktok-demo.${mp3 ? "mp3" : "mp4"}"` }, body: Buffer.alloc(2048) });
  });
  await page.goto("/");
  await field(page).fill(video.url);
  await field(page).press("Enter");
  const result = page.getByTestId("result");
  await expect(result).toContainText("Sans filigrane");

  await choose(page, result.getByLabel("Qualité de la vidéo"), /^540p/);
  let download = page.waitForEvent("download");
  await result.getByRole("tab", { name: "Vidéo" }).click();
  await result.getByRole("button", { name: "Télécharger la vidéo" }).click();
  expect((await download).suggestedFilename()).toBe("tiktok-demo.mp4");
  await expect(result.locator('[data-testid="saved"]:visible')).toContainText("tiktok-demo.mp4");

  download = page.waitForEvent("download");
  await result.getByRole("tab", { name: "Audio" }).click();
  await result.getByRole("button", { name: "Télécharger le son" }).click();
  expect((await download).suggestedFilename()).toBe("tiktok-demo.mp3");
  await expect(result.locator('[data-testid="saved"]:visible')).toContainText("tiktok-demo.mp3");

  // Le son est aussi proposé en M4A (piste d'origine).
  await choose(page, result.getByLabel("Format du son"), /^M4A/);
  await expect(result.getByLabel("Qualité du son")).toHaveCount(0);
  download = page.waitForEvent("download");
  await result.getByRole("button", { name: "Télécharger le son" }).click();
  await download;

  expect(payloads).toEqual([
    { url: video.url, format: "mp4", quality: "h264_540p_1-0" },
    { url: video.url, format: "mp3", quality: "h264_540p_1-0", bitrate: 192 },
    { url: video.url, format: "m4a", quality: "h264_540p_1-0", bitrate: 192 },
  ]);
});

test("un lien invalide affiche une erreur claire (API réelle)", async ({ page }) => {
  await page.goto("/");
  await field(page).fill("https://example.com/video");
  await page.getByRole("button", { name: "Récupérer" }).click();
  const alert = page.locator("#retrieve-error");
  await expect(alert).toContainText("Seuls les liens tiktok.com sont pris en charge");
  await expect(alert.getByRole("button", { name: "Convertir un fichier" })).toBeVisible();
  await expect(alert.getByRole("link", { name: "Signaler le problème" })).toHaveAttribute("href", "/assistance");
  await expect(page.getByTestId("result")).toHaveCount(0);
});

test("un champ vide ne déclenche aucune requête", async ({ page }) => {
  let called = false;
  await page.route("**/api/resolve", (r) => {
    called = true;
    return r.abort();
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Récupérer" }).click();
  await expect(page.locator("#retrieve-error")).toContainText("Collez le lien");
  expect(called).toBe(false);
});

for (const [name, status, code, message, title] of [
  ["vidéo supprimée", 404, "VIDEO_DELETED", "Cette vidéo a été supprimée ou n'existe plus sur TikTok.", "Cette vidéo n'est plus disponible"],
  ["vidéo privée", 403, "VIDEO_PRIVATE", "Cette vidéo est privée.", "Cette vidéo n'est pas publique"],
  ["source momentanément indisponible", 502, "UPSTREAM_ERROR", "TikTok ne répond pas correctement à notre serveur pour le moment.", "TikTok est momentanément injoignable"],
] as const) {
  test(`${name} : message explicite, aucun résultat affiché`, async ({ page }) => {
    await page.route("**/api/resolve", (r) => r.fulfill({ status, json: { error: { code, message } } }));
    await page.goto("/");
    await field(page).fill(video.url);
    await field(page).press("Enter");
    const alert = page.locator("#retrieve-error");
    await expect(alert).toContainText(title);
    await expect(alert).toContainText(message);
    await expect(page.getByTestId("result")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Télécharger/ })).toHaveCount(0);
  });
}

test("erreur réseau : le visiteur est prévenu et peut réessayer", async ({ page }) => {
  let fail = true;
  await page.route("**/api/resolve", (r) => (fail ? r.abort("internetdisconnected") : r.fulfill({ json: video })));
  await page.goto("/");
  await field(page).fill(video.url);
  await field(page).press("Enter");
  await expect(page.locator("#retrieve-error")).toContainText("Connexion impossible");
  fail = false;
  await page.locator("#retrieve-error").getByRole("button", { name: "Réessayer" }).click();
  await expect(page.getByTestId("result-title")).toHaveText("Vidéo de démonstration");
});

test("une erreur serveur pendant le téléchargement est affichée avec « Réessayer »", async ({ page }) => {
  await page.route("**/api/resolve", (r) => r.fulfill({ json: video }));
  await page.route("**/api/download", (r) => r.fulfill({ status: 503, json: { error: { code: "BUSY", message: "Le service traite déjà plusieurs fichiers." } } }));
  await page.goto("/");
  await field(page).fill(video.url);
  await field(page).press("Enter");
  const result = page.getByTestId("result");
  await result.getByRole("tab", { name: "Audio" }).click();
  await result.getByRole("button", { name: "Télécharger le son" }).click();
  await expect(result).toContainText("Le service traite déjà plusieurs fichiers.");
  await expect(result.getByRole("button", { name: "Réessayer" })).toBeVisible();
  await expect(result.locator('[data-testid="saved"]:visible')).toHaveCount(0);
});

test("une vidéo sans source sans filigrane : limite expliquée, aucun bouton de téléchargement", async ({ page }) => {
  await page.route("**/api/resolve", (r) => r.fulfill({ json: { ...video, linkDownload: false, qualities: [], linkUnavailableReason: "TikTok ne met à disposition pour cette vidéo qu'une version avec filigrane incrusté." } }));
  await page.goto("/");
  await field(page).fill(video.url);
  await field(page).press("Enter");
  const result = page.getByTestId("result");
  await expect(result).toContainText("version avec filigrane");
  await expect(result.getByRole("button", { name: /Convertir un fichier/ })).toBeVisible();
  await expect(result.locator('a[href*="tiktok.com"]')).toHaveCount(0);
  await expect(result.getByTestId("download-video")).toHaveCount(0);
  await expect(result.getByTestId("download-audio")).toHaveCount(0);
});

test("conversion réelle d'un fichier importé en MP4 et en MP3 (FFmpeg, sans simulation)", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("file-input").setInputFiles("e2e/.fixtures/sample.mp4");
  const result = page.getByTestId("result");
  await expect(result.getByTestId("result-title")).toHaveText("sample.mp4");
  await expect(result.getByLabel("Qualité de la vidéo")).toContainText("Originale · 720p");
  await result.getByLabel("Qualité de la vidéo").click();
  await expect(page.getByRole("option", { name: /Originale · 720p/ })).toBeVisible();
  await expect(page.getByRole("option", { name: /1080p/ })).toHaveCount(0);
  await page.keyboard.press("Escape");

  let download = page.waitForEvent("download");
  await result.getByRole("tab", { name: "Audio" }).click();
  await result.getByRole("button", { name: "Télécharger le son" }).click();
  let file = await download;
  expect(file.suggestedFilename()).toBe("sample.mp3");
  expect(statSync(await file.path()).size).toBeGreaterThan(5000);

  await choose(page, result.getByLabel("Format du son"), /^M4A/);
  download = page.waitForEvent("download");
  await result.getByRole("button", { name: "Télécharger le son" }).click();
  file = await download;
  expect(file.suggestedFilename()).toBe("sample.m4a");
  expect(statSync(await file.path()).size).toBeGreaterThan(5000);

  download = page.waitForEvent("download");
  await result.getByRole("tab", { name: "Vidéo" }).click();
  await result.getByRole("button", { name: "Télécharger la vidéo" }).click();
  file = await download;
  expect(file.suggestedFilename()).toBe("sample.mp4");
  expect(statSync(await file.path()).size).toBeGreaterThan(5000);
});

test.describe("TikTok réel (E2E_LIVE=1)", () => {
  test.skip(!process.env.E2E_LIVE, "Tests réseau réels, activés avec E2E_LIVE=1");

  test("lien collé → vidéo affichée → MP4 sans filigrane puis MP3 réellement téléchargés", async ({ page }) => {
    await page.goto("/");
    await field(page).focus();
    await paste(page, LIVE);
    const result = page.getByTestId("result");
    await expect(result).toContainText("Sans filigrane", { timeout: 40_000 });
    await expect(result).toContainText("@scout2015");
    await expect(result).toContainText("0:10");

    let download = page.waitForEvent("download", { timeout: 80_000 });
    await result.getByRole("tab", { name: "Vidéo" }).click();
    await result.getByRole("button", { name: "Télécharger la vidéo" }).click();
    let file = await download;
    expect(file.suggestedFilename()).toMatch(/^TokFlow-\d+\.mp4$/);
    expect(statSync(await file.path()).size).toBeGreaterThan(500_000);

    download = page.waitForEvent("download", { timeout: 80_000 });
    await result.getByRole("tab", { name: "Audio" }).click();
    await result.getByRole("button", { name: "Télécharger le son" }).click();
    file = await download;
    expect(file.suggestedFilename()).toMatch(/^TokFlow-\d+\.mp3$/);
    expect(statSync(await file.path()).size).toBeGreaterThan(50_000);

    await choose(page, result.getByLabel("Format du son"), /^M4A/);
    download = page.waitForEvent("download", { timeout: 80_000 });
    await result.getByRole("button", { name: "Télécharger le son" }).click();
    file = await download;
    expect(file.suggestedFilename()).toMatch(/^TokFlow-\d+\.m4a$/);
    expect(statSync(await file.path()).size).toBeGreaterThan(50_000);
  });

  test("vidéo inexistante : TokFlow dit qu'elle n'est plus disponible", async ({ page }) => {
    await page.goto("/");
    await field(page).fill("https://www.tiktok.com/@scout2015/video/6718335390845095999");
    await field(page).press("Enter");
    await expect(page.locator("#retrieve-error")).toBeVisible({ timeout: 40_000 });
    await expect(page.getByTestId("result")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Télécharger/ })).toHaveCount(0);
  });
});
