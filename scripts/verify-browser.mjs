// Vérification réelle dans un navigateur (ordinateur puis téléphone) d'une instance de TokFlow.
// Usage : node scripts/verify-browser.mjs https://tokflow-2kvd.onrender.com
// Parcours d'un visiteur : coller un lien, voir la grille, lire les animations, sélectionner, télécharger, ouvrir le ZIP.
import { readFileSync } from "node:fs";
import { chromium, devices } from "@playwright/test";

const BASE = (process.argv[2] ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const SHOTS = process.env.OUT ?? "/tmp";
const SHORT = "https://vm.tiktok.com/ZGdXHfBPR/"; // 14 bannières animées
const MIXED = "https://www.tiktok.com/@hrumizou/photo/7706538157596052743"; // 25 bannières, 6 animées
const VIDEO = "https://www.tiktok.com/@scout2015/video/6718335390845095173";

let failed = 0;
const check = (ok, label, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "OK   " : "ÉCHEC"} ${label}${detail ? ` — ${detail}` : ""}`);
};
function zipNames(zip) {
  const names = [];
  let at = 0;
  while (at + 30 < zip.length && zip.readUInt32LE(at) === 0x04034b50) {
    const size = zip.readUInt32LE(at + 18);
    const len = zip.readUInt16LE(at + 26);
    names.push(zip.toString("utf8", at + 30, at + 30 + len));
    at += 30 + len + size;
  }
  return names;
}
const saved = async (download) => readFileSync(await download.path());

async function visit(name, options) {
  console.log(`\n— ${name}`);
  const browser = await chromium.launch();
  const context = await browser.newContext({ ...options, locale: "fr-FR", acceptDownloads: true });
  const page = await context.newPage();
  const problems = [];
  page.on("pageerror", (e) => problems.push(String(e)));
  page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && problems.push(m.text()));
  const field = page.getByLabel("Lien de la vidéo TikTok");
  const cards = page.getByTestId("banner-card");
  const count = page.getByTestId("banner-count");
  try {
    await page.goto(BASE, { waitUntil: "load", timeout: 120_000 });
    await page.waitForTimeout(3000); // site distant : laisser la page devenir interactive avant le collage simulé

    // 1. Coller un lien court : la grille apparaît sans autre action.
    await field.focus();
    await field.evaluate((el, value) => {
      const data = new DataTransfer();
      data.setData("text/plain", value);
      el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
    }, SHORT);
    await page.getByTestId("banner-result").waitFor({ timeout: 90_000 });
    check((await cards.count()) === 14, "lien court collé → 14 bannières dans la grille", await page.getByTestId("banner-summary").innerText());
    check((await cards.evaluateAll((els) => els.map((el) => Number(el.dataset.n)).join())) === "1,2,3,4,5,6,7,8,9,10,11,12,13,14", "ordre d'origine");
    check((await page.getByTestId("banner-summary").innerText()).includes("14 animées"), "14 animations récupérées");

    // 2. Les animations se lisent réellement (dimensions connues, temps de lecture qui avance).
    let playing = 0;
    const sizes = new Set();
    for (let i = 0; i < 14; i++) {
      const video = cards.nth(i).locator("video");
      await video.scrollIntoViewIfNeeded();
      const state = await video.evaluate(async (el) => {
        for (let t = 0; t < 300 && (el.readyState < 2 || el.currentTime === 0); t++) await new Promise((r) => setTimeout(r, 100));
        return { w: el.videoWidth, h: el.videoHeight, time: el.currentTime, muted: el.muted, loop: el.loop, ready: el.readyState, net: el.networkState, paused: el.paused, error: el.error?.message ?? null };
      }).catch(() => null);
      if (state && state.h > 0 && state.time > 0) playing++;
      else console.log(`      aperçu ${i + 1} : ${JSON.stringify(state)}`);
      if (state) sizes.add(`${state.w}x${state.h}`);
    }
    check(playing === 14, "aperçu animé : les 14 vidéos se lisent", `${playing}/14 · ${[...sizes].join(", ")}`);
    await page.screenshot({ path: `${SHOTS}/tokflow-bannieres-${name}.png`, fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(overflow <= 0, "aucun débordement horizontal");

    // 3. Sélection.
    check((await count.innerText()) === "14 sélectionnées sur 14", "tout est sélectionné au départ");
    await page.getByRole("button", { name: "Tout désélectionner" }).click();
    check((await count.innerText()) === "Aucune bannière sélectionnée" && (await page.getByTestId("banner-zip").isDisabled()), "Tout désélectionner (ZIP désactivé)");
    for (const n of ["02", "04", "07", "09", "12", "13"]) await page.getByLabel(`Sélectionner la bannière ${n}`).check();
    await page.getByLabel("Sélectionner la bannière 13").uncheck();
    check((await count.innerText()) === "5 sélectionnées sur 14", "sélection et désélection individuelles", await count.innerText());

    // 4. ZIP de la sélection.
    let download = page.waitForEvent("download", { timeout: 120_000 });
    await page.getByTestId("banner-zip").click();
    let file = await download;
    let names = zipNames(await saved(file));
    check(names.join() === "Banniere_02.mp4,Banniere_04.mp4,Banniere_07.mp4,Banniere_09.mp4,Banniere_12.mp4", "ZIP : exactement les 5 bannières sélectionnées", `${file.suggestedFilename()} → ${names.join(", ")}`);

    // 5. Téléchargements individuels.
    download = page.waitForEvent("download", { timeout: 60_000 });
    await cards.nth(2).getByTestId("banner-mp4").click();
    file = await download;
    let data = await saved(file);
    check(file.suggestedFilename() === "Banniere_03.mp4" && data.toString("latin1", 4, 8) === "ftyp", "téléchargement individuel MP4", `${file.suggestedFilename()} · ${Math.round(data.length / 1024)} Ko`);
    download = page.waitForEvent("download", { timeout: 60_000 });
    await cards.nth(2).getByTestId("banner-jpg").click();
    file = await download;
    data = await saved(file);
    check(file.suggestedFilename() === "Banniere_03.jpg" && data[0] === 0xff && data[1] === 0xd8, "téléchargement individuel JPG", `${file.suggestedFilename()} · ${Math.round(data.length / 1024)} Ko`);

    // 6. Tout sélectionner.
    await page.getByRole("button", { name: "Tout sélectionner" }).click();
    check((await count.innerText()) === "14 sélectionnées sur 14", "Tout sélectionner");

    // 7. Publication partiellement animée : mélange MP4 et images, mention explicite.
    await field.fill(MIXED);
    await field.press("Enter");
    await page.getByTestId("banner-summary").filter({ hasText: "25 bannières" }).waitFor({ timeout: 90_000 });
    const summary = await page.getByTestId("banner-summary").innerText();
    const flags = await cards.evaluateAll((els) => els.map((el) => (el.dataset.animated === "true" ? "A" : "f")).join(""));
    check(summary.includes("6 animées") && flags === "AfAfAfAfAfAffffffffffffff", "publication mixte : 25 bannières, 6 animées", `${summary} · ${flags}`);
    check((await cards.nth(1).getByTestId("banner-format").innerText()) === "Image fixe — animation indisponible" && (await cards.nth(1).getByTestId("banner-mp4").count()) === 0, "image fixe : mention explicite, JPG seulement");
    await cards.nth(1).locator("img").scrollIntoViewIfNeeded();
    const natural = await cards.nth(1).locator("img").evaluate(async (el) => {
      for (let t = 0; t < 150 && !(el.complete && el.naturalWidth); t++) await new Promise((r) => setTimeout(r, 100));
      return `${el.naturalWidth}x${el.naturalHeight}`;
    });
    check(!natural.startsWith("0x"), "aperçu d'une image fixe", natural);
    await page.getByRole("button", { name: "Tout désélectionner" }).click();
    for (const n of ["01", "02", "25"]) await page.getByLabel(`Sélectionner la bannière ${n}`).check();
    await page.getByTestId("banner-with-images").check();
    download = page.waitForEvent("download", { timeout: 120_000 });
    await page.getByTestId("banner-zip").click();
    names = zipNames(await saved(await download));
    check(names.join() === "Banniere_01.jpg,Banniere_01.mp4,Banniere_02.jpg,Banniere_25.jpg", "ZIP mixte avec l'option « image JPG en plus »", names.join(", "));

    // 8. Erreurs.
    await field.fill("https://example.com/video");
    await field.press("Enter");
    await page.locator("#retrieve-error").waitFor({ timeout: 30_000 });
    check((await page.getByTestId("banner-result").count()) === 0, "lien étranger : message d'erreur, aucune grille", (await page.locator("#retrieve-error").innerText()).split("\n")[0]);
    await field.fill("https://www.tiktok.com/@hrumizou/photo/7000000000000000001");
    await field.press("Enter");
    await page.locator("#retrieve-error").filter({ hasText: "plus disponible" }).waitFor({ timeout: 60_000 }).then(() => check(true, "publication inexistante : message clair"), () => check(false, "publication inexistante : message clair"));

    // 9. La vidéo fonctionne toujours : MP4 puis MP3.
    await field.fill(VIDEO);
    await field.press("Enter");
    const result = page.getByTestId("result");
    await result.waitFor({ timeout: 120_000 });
    check((await result.innerText()).includes("Sans filigrane"), "vidéo classique : résultat vidéo habituel (pas de grille)");
    download = page.waitForEvent("download", { timeout: 180_000 });
    await result.getByRole("button", { name: "Télécharger la vidéo" }).click();
    file = await download;
    data = await saved(file);
    check(data.toString("latin1", 4, 8) === "ftyp" && data.length > 100_000, "téléchargement vidéo MP4", `${file.suggestedFilename()} · ${(data.length / 1e6).toFixed(2)} Mo`);
    download = page.waitForEvent("download", { timeout: 180_000 });
    await result.getByRole("button", { name: "Télécharger le son" }).click();
    file = await download;
    data = await saved(file);
    check(file.suggestedFilename().endsWith(".mp3") && data.length > 20_000, "téléchargement audio MP3", `${file.suggestedFilename()} · ${Math.round(data.length / 1024)} Ko`);

    // 10. Conversion d'un fichier importé (la vidéo qui vient d'être téléchargée).
    if (process.env.SAMPLE) {
      await page.getByTestId("file-input").setInputFiles(process.env.SAMPLE);
      await result.waitFor({ timeout: 30_000 });
      download = page.waitForEvent("download", { timeout: 180_000 });
      await result.getByRole("button", { name: /Télécharger le son|Extraire/ }).first().click();
      file = await download;
      data = await saved(file);
      check(file.suggestedFilename().endsWith(".mp3") && data.length > 10_000, "fichier importé → MP3", `${file.suggestedFilename()} · ${Math.round(data.length / 1024)} Ko`);
    }
    check(problems.length === 0, "aucune erreur dans la console du navigateur", problems.slice(0, 3).join(" | "));
  } catch (e) {
    check(false, "parcours interrompu", String(e).split("\n")[0]);
    await page.screenshot({ path: `${SHOTS}/tokflow-bannieres-${name}-echec.png`, fullPage: true }).catch(() => undefined);
  }
  await browser.close();
}

console.log(`Instance vérifiée : ${BASE}`);
const only = process.env.ONLY;
if (!only || only === "ordinateur") await visit("ordinateur", { viewport: { width: 1440, height: 900 } });
if (!only || only === "telephone") await visit("telephone", devices["Pixel 7"]);
console.log(failed ? `\n${failed} ÉCHEC(S)` : "\nTout est conforme.");
process.exit(failed ? 1 : 0);
