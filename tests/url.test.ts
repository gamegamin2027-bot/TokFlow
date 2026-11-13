import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/errors";
import { isAllowedThumbnailUrl, parseTikTokUrl, resolveTikTokLink } from "@/lib/tiktok/url";

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as ApiError).code;
  }
  return "OK";
};

describe("parseTikTokUrl", () => {
  it("normalise un lien vidéo et retire le tracking", () => {
    expect(parseTikTokUrl(" https://www.tiktok.com/@scout2015/video/6718335390845095173?is_from_webapp=1&lang=fr ")).toEqual({
      kind: "video",
      id: "6718335390845095173",
      username: "scout2015",
      url: "https://www.tiktok.com/@scout2015/video/6718335390845095173",
    });
  });
  it("accepte m.tiktok.com et l'absence de protocole", () => {
    expect(parseTikTokUrl("m.tiktok.com/@a.b_c/video/7000000000000000000").kind).toBe("video");
  });
  it("reconnaît les liens courts", () => {
    expect(parseTikTokUrl("https://vm.tiktok.com/ZMabc123/")).toEqual({ kind: "short", url: "https://vm.tiktok.com/ZMabc123/" });
    expect(parseTikTokUrl("https://www.tiktok.com/t/ZTabc123/").kind).toBe("short");
  });
  it("accepte toutes les écritures d'un lien de vidéo", () => {
    const id = "7123456789012345678";
    for (const u of [
      `https://www.tiktok.com/@user/video/${id}`,
      `http://tiktok.com/@user-name.x/video/${id}/`,
      `https://www.tiktok.com/@/video/${id}`,
      `https://m.tiktok.com/v/${id}.html?u_code=abc`,
      `https://www.tiktok.com/share/video/${id}`,
      `https://www.tiktok.com/embed/v2/${id}`,
      `https://www.tiktok.com/embed/${id}`,
      `https://www.tiktok.com/player/v1/${id}`,
      `WWW.TIKTOK.COM/@user/video/${id}#comments`,
    ]) {
      const link = parseTikTokUrl(u);
      expect(link, u).toMatchObject({ kind: "video", id });
      expect(link.url).toMatch(new RegExp(`^https://www\\.tiktok\\.com/@[A-Za-z0-9._-]+/video/${id}$`));
    }
  });
  it("retrouve le lien dans un texte de partage", () => {
    expect(parseTikTokUrl("Regarde cette vidéo ! https://vm.tiktok.com/ZMh-a_c12/ Envoyé depuis TikTok")).toEqual({ kind: "short", url: "https://vm.tiktok.com/ZMh-a_c12/" });
    expect(parseTikTokUrl("vu sur TikTok : https://www.tiktok.com/@user/video/7123456789012345678?_r=1.").kind).toBe("video");
    expect(code(() => parseTikTokUrl("https://evil.example/?next=https://www.tiktok.com.evil.io/@a/video/12345678901"))).toMatch(/UNSUPPORTED_URL|INVALID_URL/);
    expect(code(() => parseTikTokUrl("https://evil.example/tiktok.com/@a/video/12345678901"))).toMatch(/UNSUPPORTED_URL|INVALID_URL/);
  });
  it("rejette les entrées invalides", () => {
    expect(code(() => parseTikTokUrl(""))).toBe("INVALID_URL");
    expect(code(() => parseTikTokUrl(42))).toBe("INVALID_URL");
    expect(code(() => parseTikTokUrl("http://"))).toBe("INVALID_URL");
    expect(code(() => parseTikTokUrl("https://user:pw@www.tiktok.com/@a/video/12345678901"))).toBe("INVALID_URL");
  });
  it("rejette les autres domaines (anti-SSRF)", () => {
    for (const u of ["https://youtube.com/watch?v=1", "https://tiktok.com.evil.io/@a/video/12345678901", "https://eviltiktok.com/@a/video/12345678901", "http://127.0.0.1/@a/video/12345678901", "https://www.tiktok.com:8443/@a/video/12345678901"]) {
      expect(code(() => parseTikTokUrl(u))).toMatch(/UNSUPPORTED_URL|INVALID_URL/);
    }
  });
  it("rejette les pages TikTok qui ne sont pas des vidéos", () => {
    expect(code(() => parseTikTokUrl("https://www.tiktok.com/@scout2015"))).toBe("UNSUPPORTED_URL");
    expect(code(() => parseTikTokUrl("https://www.tiktok.com/@a/video/abc"))).toBe("UNSUPPORTED_URL");
  });
});

describe("resolveTikTokLink", () => {
  const short = { kind: "short", url: "https://vm.tiktok.com/ZMabc123/" } as const;
  const res = (location?: string) => (async () => new Response(null, { status: 301, headers: location ? { location } : {} })) as unknown as typeof fetch;

  it("suit une redirection vers tiktok.com", async () => {
    const r = await resolveTikTokLink(short, res("https://www.tiktok.com/@user/video/7123456789012345678?_r=1"));
    expect(r.id).toBe("7123456789012345678");
  });
  it("suit une redirection en deux temps, jamais hors de TikTok", async () => {
    const hops = ["https://www.tiktok.com/t/ZTabc123/", "https://m.tiktok.com/v/7123456789012345678.html?x=1"];
    const chain = (async () => new Response(null, { status: 302, headers: { location: hops.shift()! } })) as unknown as typeof fetch;
    expect(await resolveTikTokLink(short, chain)).toMatchObject({ kind: "video", id: "7123456789012345678" });
    const loop = (async () => new Response(null, { status: 302, headers: { location: "https://vm.tiktok.com/ZMabc123/" } })) as unknown as typeof fetch;
    await expect(resolveTikTokLink(short, loop)).rejects.toMatchObject({ code: "UNSUPPORTED_URL" });
  });
  it("refuse une redirection hors TikTok", async () => {
    await expect(resolveTikTokLink(short, res("https://evil.example/x"))).rejects.toMatchObject({ code: "UNSUPPORTED_URL" });
  });
  it("signale un lien court expiré", async () => {
    await expect(resolveTikTokLink(short, res())).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("isAllowedThumbnailUrl", () => {
  it("n'autorise que les CDN TikTok en https", () => {
    expect(isAllowedThumbnailUrl("https://p16-sign.tiktokcdn-us.com/obj/x.jpeg?x=1")).toBe(true);
    expect(isAllowedThumbnailUrl("http://p16-sign.tiktokcdn-us.com/x.jpeg")).toBe(false);
    expect(isAllowedThumbnailUrl("https://tiktokcdn.com.evil.io/x.jpeg")).toBe(false);
    expect(isAllowedThumbnailUrl("https://169.254.169.254/latest")).toBe(false);
  });
});
