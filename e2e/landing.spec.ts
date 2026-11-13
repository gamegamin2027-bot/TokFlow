import { expect, test } from "@playwright/test";

test("la page d'accueil présente le produit sans débordement horizontal", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("sans filigrane");
  await expect(page.getByLabel("Lien de la vidéo TikTok")).toBeVisible();
  await expect(page.getByRole("button", { name: "Récupérer" })).toBeVisible();
  for (const id of ["fonctionnalites", "comment-ca-marche", "faq"]) await expect(page.locator(`#${id}`)).toBeAttached();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("plus aucune étape « Analyser », aucun lien sortant vers TikTok, aucune adresse e-mail de contact", async ({ page }) => {
  for (const path of ["/", "/a-propos", "/assistance", "/confidentialite", "/conditions"]) {
    await page.goto(path);
    await expect(page.getByText(/analyser/i)).toHaveCount(0);
    await expect(page.locator('a[href*="tiktok.com"]')).toHaveCount(0);
    await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0);
  }
});

test("les pages secondaires répondent", async ({ page }) => {
  for (const [path, title] of [["/a-propos", "Un outil simple"], ["/assistance", "Centre d'assistance TokFlow"], ["/confidentialite", "Politique de confidentialité"], ["/conditions", "Conditions d'utilisation"]] as const) {
    const res = await page.goto(path);
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(title);
  }
  expect((await page.goto("/inconnue"))?.status()).toBe(404);
  // L'ancienne page Contact renvoie vers le Centre d'assistance.
  await page.goto("/contact");
  await expect(page).toHaveURL(/\/assistance$/);
});

test("la FAQ se déplie", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Dois-je être l'auteur/ }).click();
  await expect(page.getByText("TokFlow traite toute vidéo consultable publiquement")).toBeVisible();
});
