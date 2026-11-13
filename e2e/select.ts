import { expect, type Locator, type Page } from "@playwright/test";

/** Ouvre une liste déroulante du produit et choisit une option par son libellé. */
export async function choose(page: Page, trigger: Locator, option: string | RegExp) {
  await trigger.click();
  const listbox = page.getByRole("listbox");
  await expect(listbox).toBeVisible();
  // Le menu reste dans l'écran et ne recouvre pas toute la page (plus de « gros bloc » natif).
  const box = (await listbox.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
  await listbox.getByRole("option", { name: option, exact: typeof option === "string" }).click();
  await expect(listbox).toHaveCount(0);
}
