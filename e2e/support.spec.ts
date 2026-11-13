import { expect, test } from "@playwright/test";
import { FOUNDER_STATE, MAIL_PORT } from "../playwright.config";
import { FOUNDER } from "./founder";
import { choose } from "./select";

const sentMails = async () => (await (await fetch(`http://127.0.0.1:${MAIL_PORT}/sent`)).json()) as { authorization: string; body: { from: string; to: string[]; subject: string; text: string } }[];

test("formulaire d'assistance : validation, puis aucune confirmation si l'enregistrement échoue", async ({ page }) => {
  await page.goto("/assistance");
  await page.getByRole("button", { name: "Envoyer ma demande" }).click();
  for (const id of ["sf-category", "sf-email", "sf-subject", "sf-description"]) await expect(page.locator(`#${id}-error`)).toBeVisible();
  await expect(page.getByTestId("support-confirmation")).toHaveCount(0);

  await choose(page, page.getByLabel("Catégorie de la demande"), "Erreur technique");
  await page.getByLabel("Adresse e-mail").fill("pas-un-email");
  await page.getByLabel("Lien TikTok concerné").fill("https://example.com/x");
  await page.getByLabel("Sujet").fill("Sujet de test");
  await page.getByLabel("Description détaillée").fill("Une description suffisamment longue pour être acceptée.");
  await page.getByRole("button", { name: "Envoyer ma demande" }).click();
  await expect(page.locator("#sf-email-error")).toBeVisible();
  await expect(page.locator("#sf-url-error")).toBeVisible();
  await expect(page.locator("#sf-category-error")).toHaveCount(0);

  // Panne de la base : le formulaire reste affiché, avec un message d'échec.
  await page.getByLabel("Adresse e-mail").fill("visiteur@example.com");
  await page.getByLabel("Lien TikTok concerné").fill("");
  await page.route("**/api/support", (r) => r.fulfill({ status: 503, json: { error: { code: "DB_UNAVAILABLE", message: "Votre demande n'a pas pu être enregistrée. Réessayez dans un instant." } } }));
  await page.getByRole("button", { name: "Envoyer ma demande" }).click();
  await expect(page.getByText("Votre demande n'a pas pu être enregistrée")).toBeVisible();
  await expect(page.getByTestId("support-confirmation")).toHaveCount(0);
  await expect(page.getByLabel("Sujet")).toHaveValue("Sujet de test");
});

test("demande envoyée → enregistrée → retrouvée dans le Centre de support → réponse par e-mail → historique", async ({ page, browser }, info) => {
  const tag = `${info.project.name}-${Date.now()}`;
  const visitorEmail = `client-${tag}@example.com`;
  const subject = `MP3 impossible à télécharger ${tag}`;

  // 1. Le visiteur, sans compte, envoie sa demande.
  await page.goto("/assistance");
  await choose(page, page.getByLabel("Catégorie de la demande"), "Problème de téléchargement audio");
  await page.getByLabel("Adresse e-mail").fill(visitorEmail);
  await page.getByLabel("Lien TikTok concerné").fill("https://www.tiktok.com/@scout2015/video/6718335390845095173");
  await page.getByLabel("Sujet").fill(subject);
  await page.getByLabel("Description détaillée").fill("Le bouton du son affiche une erreur après quelques secondes.\nTéléphone Android, navigateur Chrome.");
  await page.getByRole("button", { name: "Envoyer ma demande" }).click();
  const confirmation = page.getByTestId("support-confirmation");
  await expect(confirmation).toContainText("Votre demande a bien été transmise");
  await expect(confirmation).toContainText(visitorEmail);
  const id = (await page.getByTestId("ticket-id").innerText()).trim();
  expect(id).toMatch(/^TF-[A-Z0-9]{8}$/);

  // Un visiteur ne peut pas lire les demandes.
  expect((await page.request.get("/api/founder/tickets")).status()).toBe(401);
  expect((await page.request.get(`/api/founder/tickets/${id}`)).status()).toBe(401);

  // 2. Le fondateur retrouve la demande dans sa boîte de réception.
  const founder = await browser.newContext({ storageState: FOUNDER_STATE, viewport: info.project.use.viewport ?? undefined, baseURL: info.project.use.baseURL });
  const admin = await founder.newPage();
  await admin.goto("/fondateur");
  await expect(admin.getByRole("heading", { level: 1 })).toHaveText("Centre de support");
  await admin.getByLabel("Rechercher une demande").fill(id);
  const row = admin.getByTestId("ticket-row");
  await expect(row).toHaveCount(1);
  await expect(row).toContainText(id);
  await expect(row).toContainText(subject);
  await expect(row).toContainText(visitorEmail);
  await expect(row).toContainText("Problème de téléchargement audio");
  await expect(row).toContainText("Nouveau");

  // Filtres : la mauvaise catégorie masque la demande, la bonne la retrouve.
  await choose(admin, admin.getByLabel("Filtrer par catégorie"), "Partenariat");
  await expect(admin.getByText("Aucune demande ne correspond à ces critères")).toBeVisible();
  await choose(admin, admin.getByLabel("Filtrer par catégorie"), "Problème de téléchargement audio");
  await choose(admin, admin.getByLabel("Filtrer par statut"), "Résolu");
  await expect(admin.getByText("Aucune demande ne correspond à ces critères")).toBeVisible();
  await choose(admin, admin.getByLabel("Filtrer par statut"), "Nouveau");
  await expect(row).toHaveCount(1);
  await admin.getByRole("button", { name: "Plus récentes d'abord" }).click();
  await expect(admin.getByRole("button", { name: "Plus anciennes d'abord" })).toBeVisible();
  await expect(row).toHaveCount(1);

  // 3. Détail complet.
  await row.click();
  const detail = admin.getByTestId("ticket-detail");
  await expect(detail.getByRole("heading", { level: 1 })).toHaveText(subject);
  await expect(detail).toContainText(visitorEmail);
  await expect(detail).toContainText("https://www.tiktok.com/@scout2015/video/6718335390845095173");
  await expect(detail).toContainText("Téléphone Android, navigateur Chrome.");
  await expect(detail.getByLabel("Statut actuel")).toHaveText("Nouveau");
  const history = detail.getByTestId("history").locator("li");
  await expect(history).toHaveCount(1);
  await expect(history.first()).toContainText("Demande reçue");

  // 4. Changement de statut, tracé dans l'historique.
  await choose(admin, detail.getByLabel("Statut actuel"), "En cours");
  await expect(history).toHaveCount(2);
  await expect(history.nth(1)).toContainText("Nouveau → En cours");

  // 5. Réponse par e-mail : message vide refusé, puis envoi réel au fournisseur.
  const before = (await sentMails()).length;
  await detail.getByRole("button", { name: "Répondre" }).click();
  const composer = detail.getByTestId("reply-composer");
  await expect(composer.getByLabel("Destinataire")).toHaveValue(visitorEmail);
  await expect(composer.getByLabel("Sujet")).toHaveValue(`Re: ${subject} [${id}]`);
  await composer.getByRole("button", { name: "Envoyer" }).click();
  await expect(composer.locator("#reply-message-error")).toBeVisible();
  expect((await sentMails()).length).toBe(before);

  const message = "Bonjour,\nLe problème est corrigé, vous pouvez réessayer.\nL'équipe TokFlow";
  await composer.getByLabel("Message").fill(message);
  await composer.getByRole("button", { name: "Envoyer" }).click();
  await expect(detail.getByTestId("reply-sent")).toContainText(`Réponse envoyée à ${visitorEmail}`);
  await expect(composer).toHaveCount(0);

  const mails = await sentMails();
  expect(mails.length).toBe(before + 1);
  const mail = mails[mails.length - 1];
  expect(mail.authorization).toBe("Bearer re_test_key");
  expect(mail.body).toMatchObject({ from: "TokFlow <support@tokflow.test>", to: [visitorEmail], subject: `Re: ${subject} [${id}]`, text: message });

  // 6. Historique et statut mis à jour, conservés après rechargement.
  await expect(detail.getByLabel("Statut actuel")).toHaveText("En attente de réponse");
  await expect(history).toHaveCount(4);
  await expect(history.filter({ hasText: `Réponse envoyée par e-mail à ${visitorEmail}` })).toContainText("Le problème est corrigé");
  await expect(history.filter({ hasText: "En cours → En attente de réponse" })).toHaveCount(1);
  await admin.reload();
  await admin.getByLabel("Rechercher une demande").fill(id);
  await expect(admin.getByTestId("ticket-row")).toHaveCount(1);
  await expect(admin.getByTestId("ticket-row")).toContainText("En attente de réponse");
  await admin.getByTestId("ticket-row").click();
  await expect(admin.getByTestId("history").locator("li")).toHaveCount(4);
  await founder.close();
});

test("si le fournisseur refuse l'e-mail, rien n'est inscrit dans l'historique", async ({ page, browser }, info) => {
  const email = `refus-${info.project.name}-${Date.now()}@example.com`;
  const created = await page.request.post("/api/support", { data: { category: "other", email, subject: "Adresse refusée par le fournisseur", description: "Demande utilisée pour vérifier le cas d'échec de l'envoi." } });
  expect(created.status()).toBe(201);
  const { id } = (await created.json()) as { id: string };

  const founder = await browser.newContext({ storageState: FOUNDER_STATE, baseURL: info.project.use.baseURL });
  const admin = await founder.newPage();
  await admin.goto("/fondateur");
  await admin.getByLabel("Rechercher une demande").fill(id);
  await expect(admin.getByTestId("ticket-row")).toHaveCount(1);
  await admin.getByTestId("ticket-row").click();
  const detail = admin.getByTestId("ticket-detail");
  await detail.getByRole("button", { name: "Répondre" }).click();
  await detail.getByLabel("Message").fill("Bonjour, ceci ne partira pas.");
  await detail.getByTestId("reply-composer").getByRole("button", { name: "Envoyer" }).click();
  await expect(detail.getByText("L'e-mail n'a pas été envoyé")).toBeVisible();
  await expect(detail.getByTestId("reply-sent")).toHaveCount(0);
  await expect(detail.getByTestId("history").locator("li")).toHaveCount(1);
  await expect(detail.getByLabel("Statut actuel")).toHaveText("Nouveau");
  await founder.close();
});

test("déconnexion puis reconnexion du fondateur par l'adresse discrète", async ({ browser }, info) => {
  const ctx = await browser.newContext({ baseURL: info.project.use.baseURL });
  const page = await ctx.newPage();
  await page.goto("/fondateur/connexion");
  await page.getByLabel("Adresse e-mail").fill(FOUNDER.email);
  await page.getByLabel("Mot de passe").fill("mauvais-mot-de-passe");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByText("E-mail ou mot de passe incorrect.")).toBeVisible();
  await page.getByLabel("Mot de passe").fill(FOUNDER.password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Centre de support");
  await page.getByRole("button", { name: "Déconnexion" }).first().click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/fondateur");
  await expect(page).toHaveURL(/\/fondateur\/connexion$/);
  await ctx.close();
});
