import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/errors";
import { parseProxy } from "@/lib/config";
import { classifyEngineError, networkArgs, redactProxy } from "@/lib/media/link-engine";
import { emailStatus, sendEmail } from "@/lib/server/email";
import { newTicketId, validateTicketInput } from "@/lib/server/support";
import { CATEGORIES, STATUSES } from "@/lib/support-shared";

describe("classifyEngineError", () => {
  it.each([
    ["ERROR: [TikTok] 123: Video not available, status code 10204", "VIDEO_DELETED"],
    ["ERROR: [TikTok] 123: Unable to download webpage: HTTP Error 404: Not Found", "VIDEO_DELETED"],
    ["ERROR: [TikTok] 123: This video is private. Use --cookies", "VIDEO_PRIVATE"],
    ["ERROR: [TikTok] 123: This post may not be comfortable for some audiences. Log in for access", "UPSTREAM_ERROR"],
    ["ERROR: [TikTok] 123: Your IP address is blocked from accessing this post", "UPSTREAM_ERROR"],
    ["ERROR: [TikTok] 123: Unable to extract webpage video data", "UPSTREAM_ERROR"],
    ["ERROR: unable to download video data: HTTP Error 403: Forbidden", "UPSTREAM_ERROR"],
    ["", "UPSTREAM_ERROR"],
  ])("%s → %s", (stderr, code) => {
    expect(classifyEngineError(stderr).code).toBe(code);
  });
  it("ne confond pas un blocage du serveur avec une suppression", () => {
    expect(classifyEngineError("ERROR: Your IP address is blocked").message).toMatch(/bloque l'accès/);
  });
});

describe("validateTicketInput", () => {
  const valid = { category: "technical", email: " Client@Example.com ", tiktokUrl: "", subject: " Un sujet ", description: "Une description suffisamment longue." };
  const fieldsOf = (body: unknown) => {
    try {
      validateTicketInput(body);
      return {};
    } catch (e) {
      return (e as ApiError).fields ?? {};
    }
  };
  it("normalise une demande valide", () => {
    expect(validateTicketInput(valid)).toMatchObject({ category: "technical", email: "client@example.com", tiktokUrl: null, subject: "Un sujet" });
  });
  it("signale chaque champ obligatoire manquant", () => {
    expect(Object.keys(fieldsOf({})).sort()).toEqual(["category", "description", "email", "subject"]);
  });
  it("refuse une catégorie inconnue, un e-mail invalide et un lien hors TikTok", () => {
    expect(Object.keys(fieldsOf({ ...valid, category: "x", email: "a@b", tiktokUrl: "https://example.com/v" })).sort()).toEqual(["category", "email", "tiktokUrl"]);
  });
  it("accepte un lien TikTok court", () => {
    expect(validateTicketInput({ ...valid, tiktokUrl: "https://vm.tiktok.com/ZMabc123/" }).tiktokUrl).toContain("vm.tiktok.com");
  });
  it("propose les dix catégories et les cinq statuts demandés", () => {
    expect(CATEGORIES).toHaveLength(10);
    expect(STATUSES.map((s) => s.label)).toEqual(["Nouveau", "En cours", "En attente de réponse", "Résolu", "Fermé"]);
  });
  it("génère des identifiants uniques", () => {
    const ids = new Set(Array.from({ length: 500 }, newTicketId));
    expect(ids.size).toBe(500);
    expect([...ids][0]).toMatch(/^TF-[A-Z0-9]{8}$/);
  });
});

describe("e-mail", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("indique précisément les variables manquantes et n'envoie rien", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("EMAIL_FROM", "");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    expect(emailStatus()).toEqual({ configured: false, missing: ["RESEND_API_KEY", "EMAIL_FROM"], from: null });
    await expect(sendEmail({ to: "a@example.com", subject: "s", text: "t" })).rejects.toMatchObject({ code: "EMAIL_NOT_CONFIGURED", message: expect.stringContaining("RESEND_API_KEY, EMAIL_FROM") });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe("proxy sortant", () => {
  const proxy = "http://user:s3cret@proxy.example.com:8080";
  it("n'ajoute aucun argument sans proxy", () => expect(networkArgs(null, 0)).toEqual([]));
  it("par Tor, utilise un circuit différent à chaque appel", () => {
    const a = networkArgs(null, 9050)[1];
    expect(a).toMatch(/^socks5h:\/\/c[0-9a-f]{12}:x@127\.0\.0\.1:9050$/);
    expect(networkArgs(null, 9050)[1]).not.toBe(a);
    expect(networkArgs(proxy, 9050)).toEqual(["--proxy", proxy]);
  });
  it("transmet le proxy au moteur", () => expect(networkArgs(proxy)).toEqual(["--proxy", proxy]));
  it("accepte http, https et socks5, refuse le reste", () => {
    expect(parseProxy(proxy)).toBe(proxy);
    expect(parseProxy("socks5://127.0.0.1:1080")).toBe("socks5://127.0.0.1:1080");
    expect(parseProxy("")).toBeNull();
    expect(parseProxy("ftp://x")).toBeNull();
    expect(parseProxy("pas une url")).toBeNull();
  });
  it("ne laisse jamais fuiter les identifiants", () => {
    expect(redactProxy(`ERROR: Unable to connect to proxy ${proxy}`, proxy)).not.toContain("s3cret");
    expect(redactProxy("via http://a:b@h:1/ x", null)).toBe("via http://***@h:1/ x");
  });
  it("signale un proxy en panne sans accuser TikTok", () => {
    expect(classifyEngineError("ERROR: Unable to connect to proxy").message).toMatch(/relais réseau/);
  });
});
