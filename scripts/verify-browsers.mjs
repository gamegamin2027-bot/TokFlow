// Contrôle de l'interface sur les trois moteurs de navigateur (Chromium, Firefox, WebKit/Safari),
// en français et en anglais, sur ordinateur et sur téléphone.
//   node scripts/verify-browsers.mjs http://127.0.0.1:3000      (OUT=dossier des captures)
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
const { chromium, firefox, webkit } = createRequire(import.meta.url)("playwright");

const BASE = (process.argv[2] ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const OUT = process.env.OUT ?? "/tmp/verify-browsers";
mkdirSync(OUT, { recursive: true });
let failures = 0;
const check = (ok, label, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "OK   " : "ÉCHEC"} ${label}${detail ? ` — ${detail}` : ""}`);
};

const engines = { chromium, firefox, webkit };
const screens = { ordinateur: { viewport: { width: 1440, height: 900 } }, telephone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true } };
const pages = ["/", "/a-propos", "/assistance", "/confidentialite", "/conditions"];

for (const [engine, type] of Object.entries(engines)) {
  const browser = await type.launch();
  for (const [screen, options] of Object.entries(screens)) {
    console.log(`\n— ${engine} · ${screen}`);
    const context = await browser.newContext({ ...options, locale: "fr-FR" });
    const page = await context.newPage();
    const problems = [];
    page.on("pageerror", (e) => problems.push(String(e)));
    // Ignoré : préchargement de lien interrompu par les navigations du script lui-même (rien de tel au repos).
    page.on("console", (m) => m.type() === "error" && !/Failed to fetch RSC payload|access control checks/.test(m.text()) && problems.push(m.text()));
    try {
      await page.goto(BASE, { waitUntil: "load", timeout: 120_000 });
      await page.waitForTimeout(1500);
      check((await page.locator("html").getAttribute("lang")) === "fr", "français par défaut pour un navigateur en français");
      const field = page.getByLabel("Lien de la vidéo TikTok");
      const box = await field.boundingBox();
      check(!!box && box.y + box.height < options.viewport.height, "champ visible sans défilement", box ? `à ${Math.round(box.y)} px du haut` : "absent");
      check(await page.getByRole("button", { name: "Récupérer" }).isVisible(), "bouton « Récupérer » visible");
      for (const path of pages) {
        if (path !== "/") await page.goto(BASE + path, { waitUntil: "networkidle" });
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        check(overflow <= 0, `aucun débordement horizontal sur ${path}`, overflow > 0 ? `${overflow} px` : "");
      }
      await page.goto(BASE, { waitUntil: "networkidle" });
      await page.screenshot({ path: `${OUT}/${engine}-${screen}-fr.png` });

      // Changement de langue : immédiat, conservé après rechargement, réversible.
      await page.getByTestId("language-switcher").click();
      await page.getByRole("button", { name: "English", exact: true }).click();
      await page.getByRole("button", { name: "Get video" }).waitFor({ timeout: 15_000 });
      check((await page.locator("html").getAttribute("lang")) === "en", "passage à l'anglais sans changer de page");
      check((await page.getByRole("heading", { level: 1 }).innerText()).includes("without watermark"), "titre traduit");
      await page.waitForLoadState("networkidle"); // un rechargement lancé pendant un préchargement produit une fausse alerte sous WebKit
      await page.reload({ waitUntil: "load" });
      check(await page.getByRole("button", { name: "Get video" }).isVisible(), "choix conservé après rechargement");
      const overflowEn = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      check(overflowEn <= 0, "aucun débordement horizontal en anglais");
      await page.getByRole("button", { name: "Get video" }).click();
      await page.locator("#retrieve-error").waitFor({ timeout: 10_000 });
      check((await page.locator("#retrieve-error").innerText()).includes("No link"), "message d'erreur traduit");
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT}/${engine}-${screen}-en.png` });
      await page.getByTestId("language-switcher").click();
      await page.getByRole("button", { name: "Français", exact: true }).click();
      await page.getByRole("button", { name: "Récupérer" }).waitFor({ timeout: 15_000 });
      check(true, "retour au français");

      // La FAQ et le menu fonctionnent sur ce moteur.
      await page.getByRole("button", { name: /Dois-je être l'auteur/ }).click();
      check(await page.getByText("TokFlow traite toute vidéo consultable publiquement").isVisible(), "la FAQ se déplie");
      if (screen === "telephone") {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.getByRole("button", { name: "Ouvrir le menu" }).click();
        check(await page.getByRole("navigation", { name: "Navigation mobile" }).isVisible(), "menu mobile");
        await page.waitForLoadState("networkidle"); // laisser finir les préchargements avant de quitter la page
      }
      await page.waitForLoadState("networkidle");
      await page.goto(BASE, { waitUntil: "load" });
      await page.screenshot({ path: `${OUT}/${engine}-${screen}-page.png`, fullPage: true });
      check(problems.length === 0, "aucune erreur dans la console", problems.slice(0, 2).join(" | "));
    } catch (e) {
      check(false, "parcours interrompu", String(e).split("\n")[0]);
      await page.screenshot({ path: `${OUT}/${engine}-${screen}-echec.png` }).catch(() => undefined);
    }
    await context.close();
  }
  // Un navigateur réglé en anglais reçoit l'anglais d'emblée.
  const en = await browser.newContext({ locale: "en-US" });
  const p = await en.newPage();
  await p.goto(BASE, { waitUntil: "load" });
  check((await p.locator("html").getAttribute("lang")) === "en", `${engine} : anglais d'emblée pour un navigateur en anglais`);
  await en.close();
  await browser.close();
}
console.log(failures ? `\n${failures} ÉCHEC(S)` : "\nTout est conforme.");
process.exit(failures ? 1 : 0);
