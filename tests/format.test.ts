import { describe, expect, it } from "vitest";
import { formatBytes, formatDuration, shortFileName } from "@/lib/utils";

describe("affichage des nombres et des noms", () => {
  it("raccourcit un nom de fichier au milieu, sans perdre l'extension", () => {
    expect(shortFileName("TokFlow-6718335390845095173.mp4")).toBe("TokFlow-6718335390845095173.mp4");
    const long = shortFileName("TokFlow-7707002491761724690-extra-long-suffix.mp4");
    expect(long.endsWith(".mp4")).toBe(true);
    expect(long).toContain("…");
    expect(long.length).toBeLessThanOrEqual(34);
    expect(long.startsWith("TokFlow-")).toBe(true);
    expect(shortFileName("sans-extension-mais-tres-tres-long-nom-de-fichier")).toContain("…");
  });

  it("affiche les tailles dans une seule unité, comme le fichier final", () => {
    expect(formatBytes(2_004_552)).toBe("1,9 Mo");
    expect(formatBytes(247_000)).toBe("241 Ko");
    expect(formatBytes(0)).toBe("");
  });

  it("affiche une durée courte en minutes:secondes", () => {
    expect(formatDuration(9.96)).toBe("0:10");
    expect(formatDuration(61)).toBe("1:01");
  });
});
