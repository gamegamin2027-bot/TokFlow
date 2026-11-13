import { test } from "@playwright/test";

/** Captures de contrôle visuel, écrites dans docs/screenshots (E2E_SHOTS=1). */
test("captures d'écran", async ({ page }, info) => {
  test.skip(!process.env.E2E_SHOTS, "Activé avec E2E_SHOTS=1");
  const name = info.project.name;
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `docs/screenshots/${name}-accueil.png`, fullPage: true });

  await page.getByLabel("Lien de la vidéo TikTok").fill("https://www.tiktok.com/@scout2015/video/6718335390845095173");
  await page.getByLabel("Lien de la vidéo TikTok").press("Enter");
  await page.getByTestId("result").waitFor({ timeout: 40_000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `docs/screenshots/${name}-resultat.png` });

  await page.goto("/conditions");
  await page.screenshot({ path: `docs/screenshots/${name}-conditions.png` });
});
