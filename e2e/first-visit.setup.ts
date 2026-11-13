import { expect, test } from "@playwright/test";
import { FOUNDER_STATE } from "../playwright.config";
import { FOUNDER } from "./founder";


test("première visite : création du compte fondateur, puis l'inscription disparaît", async ({ page, browser, request }) => {
  // Base vide : n'importe quelle page du site affiche uniquement la création du compte.
  expect((await (await request.get("/api/health")).json()).founder).toBe("pending");
  for (const path of ["/", "/assistance", "/conditions"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Créez le compte fondateur");
    await expect(page.getByLabel("Lien de la vidéo TikTok")).toHaveCount(0);
  }
  // L'espace fondateur est fermé tant que personne n'est connecté.
  expect((await request.get("/api/founder/tickets")).status()).toBe(401);

  // Validation réelle côté serveur.
  await page.getByLabel("Adresse e-mail").fill("pas-un-email");
  await page.getByLabel("Mot de passe", { exact: true }).fill("court");
  await page.getByLabel("Confirmez le mot de passe").fill("court");
  await page.getByRole("button", { name: "Créer le compte fondateur" }).click();
  await expect(page.locator("#auth-email-error")).toBeVisible();
  await expect(page.locator("#auth-password-error")).toContainText("10 caractères");

  await page.getByLabel("Adresse e-mail").fill(FOUNDER.email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(FOUNDER.password);
  await page.getByLabel("Confirmez le mot de passe").fill("autre-chose-123");
  await page.getByRole("button", { name: "Créer le compte fondateur" }).click();
  await expect(page.locator("#auth-confirm-error")).toContainText("ne correspondent pas");

  await page.getByLabel("Confirmez le mot de passe").fill(FOUNDER.password);
  await page.getByRole("button", { name: "Créer le compte fondateur" }).click();
  await expect(page).toHaveURL(/\/fondateur$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Centre de support");
  await expect(page.getByText("Aucune demande pour le moment")).toBeVisible();
  await page.context().storageState({ path: FOUNDER_STATE });

  // Un autre visiteur n'a plus aucun écran de connexion et ne peut plus créer de compte.
  const visitor = await browser.newContext();
  const other = await visitor.newPage();
  await other.goto("/");
  await expect(other.getByRole("heading", { level: 1 })).toContainText("sans filigrane");
  await expect(other.getByText(/fondateur|Se connecter|Connexion/i)).toHaveCount(0);
  const again = await visitor.request.post("/api/auth/setup", { data: { email: "intrus@example.com", password: "un-autre-mot-de-passe" } });
  expect(again.status()).toBe(409);
  const wrong = await visitor.request.post("/api/auth/login", { data: { email: "intrus@example.com", password: "un-autre-mot-de-passe" } });
  expect(wrong.status()).toBe(401);
  await other.goto("/fondateur");
  await expect(other).toHaveURL(/\/fondateur\/connexion$/);
  await expect(other.getByRole("heading", { level: 1 })).toHaveText("Espace fondateur");
  await expect(other.getByLabel("Confirmez le mot de passe")).toHaveCount(0);
  await visitor.close();
});
