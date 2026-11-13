import { describe, expect, it } from "vitest";
import { pickLocale } from "@/lib/i18n/config";
import { en } from "@/lib/i18n/en";
import { fr } from "@/lib/i18n/fr";
import { formatBytes } from "@/lib/utils";

describe("langue du site", () => {
  it("le choix du visiteur passe avant la langue du navigateur", () => {
    expect(pickLocale("en", "fr-FR,fr;q=0.9")).toBe("en");
    expect(pickLocale("fr", "en-US,en;q=0.9")).toBe("fr");
  });

  it("sans choix : première langue proposée parmi celles du navigateur, sinon le français", () => {
    expect(pickLocale(undefined, "en-US,en;q=0.9,fr;q=0.8")).toBe("en");
    expect(pickLocale(undefined, "de-DE,de;q=0.9,en;q=0.6,fr;q=0.7")).toBe("fr");
    expect(pickLocale(undefined, "es-ES,es;q=0.9")).toBe("fr");
    expect(pickLocale(undefined, null)).toBe("fr");
    expect(pickLocale("xx; path=/", "")).toBe("fr"); // cookie inconnu ignoré
    expect(pickLocale(undefined, "en;q=0,fr")).toBe("fr");
  });

  it("les deux dictionnaires ont le même contenu", () => {
    const shape = (v: unknown): unknown => (Array.isArray(v) ? v.map(shape) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).sort().map(([k, x]) => [k, shape(x)])) : typeof v);
    const { failures: frFailures, banners: frBanners, ...frRest } = fr;
    const { failures: enFailures, banners: enBanners, ...enRest } = en;
    expect(shape(enRest)).toEqual(shape(frRest));
    expect(Object.keys(enFailures.titles).sort()).toEqual(Object.keys(frFailures.titles).sort());
    expect(Object.keys(enBanners).sort()).toEqual(Object.keys(frBanners).sort());
    expect(en.home.faq).toHaveLength(fr.home.faq.length);
  });

  it("tailles de fichiers dans chaque langue", () => {
    expect(formatBytes(1536 * 1024)).toBe("1,5 Mo");
    expect(formatBytes(1536 * 1024, en.units)).toBe("1.5 MB");
    expect(fr.banners.selected(1, 14)).toBe("1 sélectionnée sur 14");
    expect(en.banners.count(1)).toBe("1 banner");
  });
});
