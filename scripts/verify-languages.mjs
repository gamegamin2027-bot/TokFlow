// Vérifie le choix de la langue comme le ferait un visiteur, sur trois moteurs de navigateur :
// chaque langue est choisie dans le menu, puis la page, le menu, le rechargement et une page secondaire sont contrôlés.
// Usage : node scripts/verify-languages.mjs https://exemple.fr
import { createRequire } from "node:module";
const { chromium, firefox, webkit } = createRequire(import.meta.url)("playwright");

const base = (process.argv[2] ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const EXPECTED = {
  fr: { h1: "sans filigrane.", submit: "Récupérer", steps: "Copiez le lien", app: "Télécharger l'application Android", names: ["Français", "Anglais", "Espagnol", "Allemand", "Portugais", "Italien"] },
  en: { h1: "without watermark.", submit: "Get video", steps: "Copy the link", app: "Download the Android app", names: ["French", "English", "Spanish", "German", "Portuguese", "Italian"] },
  es: { h1: "sin marca de agua.", submit: "Obtener", steps: "Copia el enlace", app: "Descargar la aplicación para Android", names: ["Francés", "Inglés", "Español", "Alemán", "Portugués", "Italiano"] },
  de: { h1: "ohne Wasserzeichen.", submit: "Abrufen", steps: "Link kopieren", app: "Android-App herunterladen", names: ["Französisch", "Englisch", "Spanisch", "Deutsch", "Portugiesisch", "Italienisch"] },
  pt: { h1: "sem marca de água.", submit: "Obter", steps: "Copie o link", app: "Descarregar a aplicação Android", names: ["Francês", "Inglês", "Espanhol", "Alemão", "Português", "Italiano"] },
  it: { h1: "senza filigrana.", submit: "Recupera", steps: "Copia il link", app: "Scarica l'app per Android", names: ["Francese", "Inglese", "Spagnolo", "Tedesco", "Portoghese", "Italiano"] },
};
const SECONDARY = {
  fr: { "/a-propos": "Un outil simple, honnête et bien construit.", "/conditions": "Conditions d'utilisation", "/confidentialite": "Politique de confidentialité", "/assistance": "Centre d'assistance TokFlow", send: "Envoyer ma demande" },
  en: { "/a-propos": "A simple, honest and well-built tool.", "/conditions": "Terms of use", "/confidentialite": "Privacy policy", "/assistance": "TokFlow help centre", send: "Send my request" },
  es: { "/a-propos": "Una herramienta sencilla, honesta y bien hecha.", "/conditions": "Condiciones de uso", "/confidentialite": "Política de privacidad", "/assistance": "Centro de ayuda de TokFlow", send: "Enviar mi solicitud" },
  de: { "/a-propos": "Ein einfaches, ehrliches und gut gebautes Werkzeug.", "/conditions": "Nutzungsbedingungen", "/confidentialite": "Datenschutzerklärung", "/assistance": "TokFlow Hilfe-Center", send: "Anfrage senden" },
  pt: { "/a-propos": "Uma ferramenta simples, honesta e bem construída.", "/conditions": "Condições de utilização", "/confidentialite": "Política de privacidade", "/assistance": "Centro de ajuda do TokFlow", send: "Enviar o meu pedido" },
  it: { "/a-propos": "Uno strumento semplice, onesto e ben fatto.", "/conditions": "Condizioni d'uso", "/confidentialite": "Informativa sulla privacy", "/assistance": "Centro assistenza TokFlow", send: "Invia la richiesta" },
};
const ORDER = ["fr", "en", "es", "de", "pt", "it"];
const ROUTE = ["en", "es", "de", "pt", "it", "fr"]; // chaque langue est atteinte depuis la précédente
const SCREENS = { ordinateur: { width: 1280, height: 800 }, telephone: { width: 390, height: 844 } };

let failures = 0;
const check = (ok, label, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "OK   " : "ÉCHEC"} ${label}${detail ? ` — ${detail}` : ""}`);
};

async function pageState(page) {
  return page.evaluate(() => ({
    lang: document.documentElement.lang,
    h1: document.querySelector("h1")?.textContent ?? "",
    submit: document.querySelector('form button[type="submit"]')?.textContent?.trim() ?? "",
    steps: document.querySelector("#comment-ca-marche h3")?.textContent ?? "",
    app: document.querySelector('main a[href="/app/TokFlow.apk"]')?.textContent?.trim() ?? "",
    overflow: document.documentElement.scrollWidth - window.innerWidth,
  }));
}

for (const [engineName, engine] of Object.entries({ chromium, firefox, webkit })) {
  for (const [screenName, viewport] of Object.entries(SCREENS)) {
    console.log(`\n— ${engineName} · ${screenName}`);
    const browser = await engine.launch();
    const context = await browser.newContext({ locale: "fr-FR", viewport });
    const page = await context.newPage();
    await page.goto(base, { waitUntil: "load" });
    await page.waitForTimeout(1500);
    let current = "fr";
    for (const target of ROUTE) {
      const here = EXPECTED[current];
      const want = EXPECTED[target];
      await page.locator('header button[aria-haspopup="true"]').click();
      const names = await page.locator("header ul li button").allTextContents();
      const menuOk = JSON.stringify(names.map((n) => n.trim())) === JSON.stringify(here.names);
      await page.getByRole("button", { name: here.names[ORDER.indexOf(target)], exact: true }).click();
      await page.waitForFunction((l) => document.documentElement.lang === l, target, { timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(400);
      let s = await pageState(page);
      const translated = s.lang === target && s.h1.includes(want.h1) && s.submit === want.submit && s.steps === want.steps && s.app === want.app;
      const cookie = (await context.cookies()).find((c) => c.name === "tf_lang")?.value;
      await page.reload({ waitUntil: "load" });
      await page.waitForTimeout(600);
      s = await pageState(page);
      const kept = s.lang === target && s.h1.includes(want.h1) && s.submit === want.submit;
      // Pages secondaires : chacune doit être rédigée dans la langue choisie (titre différent du français, sauf en français).
      let secondary = target;
      for (const path of ["/a-propos", "/conditions", "/confidentialite", "/assistance"]) {
        await page.goto(base + path, { waitUntil: "load" });
        const st = await page.evaluate(() => ({ lang: document.documentElement.lang, h1: document.querySelector("h1")?.textContent ?? "", send: document.querySelector('form button[type="submit"]')?.textContent?.trim() ?? "" }));
        const good = st.lang === target && st.h1 === SECONDARY[target][path] && (path !== "/assistance" || st.send === SECONDARY[target].send);
        if (!good) secondary = `${path}: ${JSON.stringify(st)}`;
      }
      await page.goto(base, { waitUntil: "load" });
      await page.waitForTimeout(600);
      const back = (await pageState(page)).lang;
      const ok = menuOk && translated && cookie === target && kept && secondary === target && back === target && s.overflow <= 0;
      check(ok, `${current} → ${target}`, ok ? `« ${s.h1.trim().slice(0, 60)} » · bouton « ${s.submit} »` : JSON.stringify({ menuOk, translated, cookie, kept, secondary, back, s, names }));
      current = target;
    }
    await browser.close();
  }
}

console.log(failures ? `\n${failures} ÉCHEC(S)` : "\nToutes les langues fonctionnent.");
process.exit(failures ? 1 : 0);
