import { expect, test, type Page, type Route } from "@playwright/test";

/** Mode Bannières : l'interface, face à des réponses d'API simulées (les appels réels sont dans scripts/verify-*.mjs). */
const POST = "https://www.tiktok.com/@demo/photo/7000000000000000001";
const ID = "0123456789abcdef0123456789abcdef";
const set = {
  id: ID,
  postId: "7000000000000000001",
  author: "demo",
  title: "Bannières de démonstration",
  count: 5,
  animatedCount: 2,
  clipStatus: "partial",
  notice: "Certaines bannières n'ont pas d'animation accessible : elles sont proposées en image.",
  items: [1, 2, 3, 4, 5].map((n) => ({ n, animated: n === 1 || n === 3, width: 2524, height: 1420, clipBytes: n === 1 || n === 3 ? 204_800 : undefined })),
};
// PNG 1×1 : suffit pour qu'un aperçu d'image se charge.
const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

const field = (page: Page) => page.getByLabel("Lien de la vidéo TikTok");
const cards = (page: Page) => page.getByTestId("banner-card");

async function mock(page: Page, options: { banners?: (r: Route) => unknown } = {}) {
  const calls = { resolve: 0, banners: [] as string[], zips: [] as unknown[], files: [] as string[] };
  await page.route("**/api/resolve", (r) => {
    calls.resolve++;
    return r.fulfill({ status: 400, json: { error: { code: "UNSUPPORTED_URL", message: "Ce lien n'est pas un lien de vidéo TikTok pris en charge." } } });
  });
  await page.route("**/api/banners", (r) => {
    calls.banners.push((r.request().postDataJSON() as { url: string }).url);
    return options.banners ? options.banners(r) : r.fulfill({ json: set });
  });
  await page.route(`**/api/banners/${ID}/zip`, (r) => {
    calls.zips.push(r.request().postDataJSON());
    return r.fulfill({ status: 200, contentType: "application/zip", headers: { "content-disposition": 'attachment; filename="Bannieres_demo_7000000000000000001.zip"' }, body: Buffer.alloc(4096) });
  });
  await page.route(new RegExp(`/api/banners/${ID}/\\d+\\.(mp4|jpg)`), (r) => {
    const url = new URL(r.request().url());
    const name = url.pathname.split("/").pop()!;
    // Aperçus : une vraie petite vidéo (créée par global-setup) et une vraie image.
    if (url.searchParams.get("inline")) return name.endsWith(".jpg") ? r.fulfill({ contentType: "image/png", body: PIXEL }) : r.fulfill({ contentType: "video/mp4", path: "e2e/.fixtures/sample.mp4" });
    calls.files.push(name);
    const [n, ext] = name.split(".");
    return r.fulfill({ status: 200, contentType: ext === "mp4" ? "video/mp4" : "image/jpeg", headers: { "content-disposition": `attachment; filename="Banniere_${n.padStart(2, "0")}.${ext}"` }, body: Buffer.alloc(1024) });
  });
  return calls;
}

async function open(page: Page, url = POST) {
  await page.goto("/");
  await field(page).fill(url);
  await field(page).press("Enter");
  await expect(page.getByTestId("banner-result")).toBeVisible();
}

test("un lien de carrousel affiche la grille des bannières, dans l'ordre, sans passer par l'étape vidéo", async ({ page }) => {
  const calls = await mock(page);
  await open(page);
  expect(calls.resolve).toBe(0);
  expect(calls.banners).toEqual([POST]);

  const result = page.getByTestId("banner-result");
  await expect(result.getByTestId("banner-summary")).toHaveText("5 bannières · 2 animées");
  await expect(result.getByTestId("result-title")).toHaveText("Bannières de démonstration");
  await expect(result).toContainText("@demo");
  await expect(result.getByTestId("banner-notice")).toContainText("proposées en image");
  await expect(cards(page)).toHaveCount(5);
  expect(await cards(page).evaluateAll((els) => els.map((el) => `${el.getAttribute("data-n")}:${el.getAttribute("data-animated")}`))).toEqual(["1:true", "2:false", "3:true", "4:false", "5:false"]);

  // Bannière animée : aperçu vidéo, MP4 et JPG. Image fixe : mention explicite, JPG seulement.
  const animated = cards(page).nth(0);
  await expect(animated.locator("video")).toHaveAttribute("src", `/api/banners/${ID}/1.mp4?inline=1`);
  await expect(animated).toContainText("Animée");
  await expect(animated.getByTestId("banner-format")).toContainText("MP4 animé");
  await expect(animated.getByTestId("banner-mp4")).toBeVisible();
  await expect(animated.getByTestId("banner-jpg")).toBeVisible();
  const still = cards(page).nth(1);
  await expect(still.locator("img")).toHaveAttribute("src", `/api/banners/${ID}/2.jpg?inline=1`);
  await expect(still.getByTestId("banner-format")).toHaveText("Image fixe — animation indisponible");
  await expect(still.getByTestId("banner-mp4")).toHaveCount(0);
  await expect(still.getByTestId("banner-jpg")).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("sélection individuelle, tout sélectionner, tout désélectionner ; le ZIP contient exactement la sélection", async ({ page }) => {
  const calls = await mock(page);
  await open(page);
  const count = page.getByTestId("banner-count");
  const zip = page.getByTestId("banner-zip");
  await expect(count).toHaveText("5 sélectionnées sur 5");
  await expect(page.getByRole("button", { name: "Tout sélectionner" })).toBeDisabled();

  await page.getByRole("button", { name: "Tout désélectionner" }).click();
  await expect(count).toHaveText("Aucune bannière sélectionnée");
  await expect(zip).toBeDisabled();
  await expect(page.getByRole("button", { name: "Tout désélectionner" })).toBeDisabled();
  expect(await cards(page).evaluateAll((els) => els.filter((el) => el.getAttribute("data-selected") === "true").length)).toBe(0);

  for (const n of [4, 1, 2]) await page.getByLabel(`Sélectionner la bannière 0${n}`).check();
  await expect(count).toHaveText("3 sélectionnées sur 5");
  await page.getByLabel("Sélectionner la bannière 02").uncheck();
  await expect(count).toHaveText("2 sélectionnées sur 5");
  await expect(zip).toContainText("· 2");

  const download = page.waitForEvent("download");
  await zip.click();
  expect((await download).suggestedFilename()).toBe("Bannieres_demo_7000000000000000001.zip");
  await expect(page.getByTestId("banner-saved")).toContainText("Bannieres_demo_7000000000000000001.zip");
  expect(calls.zips).toEqual([{ items: [{ n: 1 }, { n: 4 }] }]);

  // Option « ajouter aussi l'image JPG des bannières animées », puis tout sélectionner.
  await page.getByTestId("banner-with-images").check();
  await page.getByRole("button", { name: "Tout sélectionner" }).click();
  await expect(count).toHaveText("5 sélectionnées sur 5");
  const second = page.waitForEvent("download");
  await zip.click();
  await second;
  expect(calls.zips[1]).toEqual({ items: [{ n: 1, formats: ["mp4", "jpg"] }, { n: 2 }, { n: 3, formats: ["mp4", "jpg"] }, { n: 4 }, { n: 5 }] });
});

test("téléchargement individuel : MP4 d'une bannière animée, JPG d'une image fixe", async ({ page }) => {
  const calls = await mock(page);
  await open(page);
  let download = page.waitForEvent("download");
  await cards(page).nth(2).getByTestId("banner-mp4").click();
  expect((await download).suggestedFilename()).toBe("Banniere_03.mp4");
  download = page.waitForEvent("download");
  await cards(page).nth(2).getByTestId("banner-jpg").click();
  expect((await download).suggestedFilename()).toBe("Banniere_03.jpg");
  download = page.waitForEvent("download");
  await cards(page).nth(4).getByTestId("banner-jpg").click();
  expect((await download).suggestedFilename()).toBe("Banniere_05.jpg");
  expect(calls.files).toEqual(["3.mp4", "3.jpg", "5.jpg"]);
});

test("lien court menant à un carrousel : la vidéo est écartée, les bannières s'affichent", async ({ page }) => {
  const calls = await mock(page);
  await open(page, "https://vm.tiktok.com/ZGdXHfBPR/");
  expect(calls.resolve).toBe(1);
  expect(calls.banners).toEqual(["https://vm.tiktok.com/ZGdXHfBPR/"]);
  await expect(cards(page)).toHaveCount(5);
});

test("publication « vidéo » sans flux vidéo : les bannières sont recherchées ; à défaut, le résultat vidéo habituel", async ({ page }) => {
  const video = { id: "7000000000000000001", url: "https://www.tiktok.com/@demo/video/7000000000000000001", username: "demo", title: "Diaporama", playerUrl: "https://www.tiktok.com/player/v1/7000000000000000001", linkDownload: false, linkUnavailableReason: "Aucun flux vidéo public n'est proposé pour ce contenu.", qualities: [] };
  let carousel = true;
  const calls = await mock(page, { banners: (r) => (carousel ? r.fulfill({ json: set }) : r.fulfill({ status: 400, json: { error: { code: "NOT_A_CAROUSEL", message: "Cette publication est une vidéo classique, pas un carrousel de bannières." } } })) });
  await page.route("**/api/resolve", (r) => r.fulfill({ json: video }));
  await open(page, video.url);
  expect(calls.banners).toEqual([video.url]);
  await expect(cards(page)).toHaveCount(5);

  carousel = false;
  await page.getByRole("button", { name: "Fermer le résultat" }).click();
  await field(page).press("Enter");
  await expect(page.getByTestId("result")).toContainText("Diaporama");
  await expect(page.getByTestId("banner-result")).toHaveCount(0);
});

test("images fixes seules et animations indisponibles : messages clairs, JPG proposés", async ({ page }) => {
  const stills = { ...set, animatedCount: 0, clipStatus: "none", notice: "Cette publication ne contient que des images fixes.", items: set.items.map((i) => ({ ...i, animated: false, clipBytes: undefined })) };
  let reply: unknown = stills;
  await mock(page, { banners: (r) => r.fulfill({ json: reply }) });
  await open(page);
  await expect(page.getByTestId("banner-summary")).toHaveText("5 bannières · images fixes");
  await expect(page.getByTestId("banner-notice")).toHaveText("Cette publication ne contient que des images fixes.");
  await expect(page.getByTestId("banner-mp4")).toHaveCount(0);
  await expect(page.getByTestId("banner-jpg")).toHaveCount(5);
  await expect(page.getByTestId("banner-with-images")).toHaveCount(0);

  // Service d'animations en panne : les images restent là, avec un bouton pour réessayer.
  reply = { ...stills, clipStatus: "unavailable", notice: "Les animations n'ont pas pu être récupérées pour le moment : les bannières sont proposées en image. Réessayez plus tard pour obtenir les MP4." };
  await page.getByRole("button", { name: "Fermer le résultat" }).click();
  await field(page).press("Enter");
  await expect(page.getByTestId("banner-notice")).toContainText("n'ont pas pu être récupérées");
  await expect(cards(page)).toHaveCount(5);
  reply = set;
  await page.getByTestId("banner-result").getByRole("button", { name: "Réessayer" }).click();
  await expect(page.getByTestId("banner-summary")).toHaveText("5 bannières · 2 animées");
});

for (const [name, status, code, message, title] of [
  ["publication supprimée ou privée", 404, "POST_UNAVAILABLE", "Cette publication est introuvable : supprimée, privée ou réservée.", "Cette publication n'est plus disponible"],
  ["TikTok injoignable", 502, "TIKTOK_UNREACHABLE", "TikTok n'a pas répondu. Réessayez dans un instant.", "TikTok est momentanément injoignable"],
  ["trop de demandes", 429, "RATE_LIMITED", "Trop de requêtes. Patientez un instant avant de réessayer.", "Trop de demandes"],
] as const) {
  test(`${name} : message explicite, aucune grille`, async ({ page }) => {
    await mock(page, { banners: (r) => r.fulfill({ status, json: { error: { code, message } } }) });
    await page.goto("/");
    await field(page).fill(POST);
    await field(page).press("Enter");
    const alert = page.locator("#retrieve-error");
    await expect(alert).toContainText(title);
    await expect(alert).toContainText(message);
    await expect(page.getByTestId("banner-result")).toHaveCount(0);
  });
}

test("lien qui n'est ni une vidéo ni un carrousel : l'erreur d'origine est conservée", async ({ page }) => {
  const calls = await mock(page, { banners: (r) => r.fulfill({ status: 400, json: { error: { code: "NOT_A_POST", message: "Ce lien TikTok ne désigne pas une publication (vidéo ou photos)." } } }) });
  await page.goto("/");
  await field(page).fill("https://www.tiktok.com/@demo");
  await field(page).press("Enter");
  await expect(page.locator("#retrieve-error")).toContainText("Ce lien n'est pas pris en charge");
  expect(calls.resolve).toBe(1);
});

test("analyse expirée pendant un téléchargement : le visiteur peut la relancer", async ({ page }) => {
  await mock(page);
  await page.route(`**/api/banners/${ID}/zip`, (r) => r.fulfill({ status: 410, json: { error: { code: "EXPIRED", message: "Cette analyse a expiré. Relancez-la à partir du lien." } } }));
  await open(page);
  await page.getByTestId("banner-zip").click();
  await expect(page.getByTestId("banner-error")).toHaveText("Cette analyse a expiré. Relancez-la à partir du lien.");
  await page.getByRole("button", { name: "Relancer l'analyse" }).click();
  await expect(page.getByTestId("banner-error")).toHaveCount(0);
  await expect(cards(page)).toHaveCount(5);
});
