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
  it("ne refuse aucune écriture connue d'un lien de vidéo", () => {
    const id = "7123456789012345678";
    const z = "\u200B";
    const accepted: [string, "video" | "photo" | "short"][] = [
      // Autres adresses de TikTok
      [`https://us.tiktok.com/@user/video/${id}`, "video"],
      [`https://vn.tiktok.com/@user/video/${id}?lang=vi`, "video"],
      [`https://www.tiktokv.com/share/video/${id}/`, "video"],
      [`https://m.tiktokv.com/share/video/${id}/?region=FR`, "video"],
      [`https://www.tiktok.com/i18n/share/video/${id}/`, "video"],
      [`https://www.tiktok.com/share/item/${id}`, "video"],
      [`https://www.tiktok.com/fr/@user/video/${id}`, "video"],
      [`https://www.tiktok.com/pt-BR/@user/video/${id}`, "video"],
      [`https://www.tiktok.com//@user/video/${id}`, "video"],
      [`https://www.tiktok.com/@user/video/${id}/`, "video"],
      [`https://www.tiktok.com/@user/video/${id}.html`, "video"],
      [`https://www.tiktok.com/video/${id}`, "video"],
      [`https://www.tiktok.com/embed/v3/${id}`, "video"],
      [`https://www.tiktok.com/player/v2/${id}`, "video"],
      [`https://www.tiktok.com/@user%20x/video/${id}`, "video"],
      [`https://www.tiktok.com/@用户/video/${id}`, "video"],
      [`https://www.tiktok.com/@user/video/${id}?is_from_webapp=1&sender_device=pc&web_id=7300000000000000000`, "video"],
      [`https://www.tiktok.com/foryou?item_id=${id}`, "video"],
      [`https://www.tiktok.com/login?redirect_url=${encodeURIComponent(`https://www.tiktok.com/@user/video/${id}`)}`, "video"],
      [`https://www.tiktok.com/@user/photo/${id}`, "photo"],
      [`https://www.tiktok.com/@/photo/${id}?_r=1`, "photo"],
      // Liens courts
      ["https://vm.tiktok.com/ZMabc123", "short"],
      ["https://vt.tiktok.com/ZS92nXSxnsTPy-Skw7w/", "short"],
      ["https://vm.tiktok.com/t/ZMabc123/", "short"],
      ["https://lite.tiktok.com/t/ZSabc123/", "short"],
      ["tiktok.com/t/ZTabc123", "short"],
      ["https://vm.tiktok.com/ZMabc123/?k=1", "short"],
      // Fautes de frappe et textes de partage
      [`https:/www.tiktok.com/@user/video/${id}`, "video"],
      [`https//www.tiktok.com/@user/video/${id}`, "video"],
      [`ttps://www.tiktok.com/@user/video/${id}`, "video"],
      [`https://https://www.tiktok.com/@user/video/${id}`, "video"],
      [`Https://Www.TikTok.Com/@user/video/${id}`, "video"],
      [`<https://www.tiktok.com/@user/video/${id}>`, "video"],
      [`(https://www.tiktok.com/@user/video/${id}).`, "video"],
      [`"https://vm.tiktok.com/ZMabc123/"`, "short"],
      [`${z}https://vm.tiktok.com/ZMabc123/${z}`, "short"],
      [`https://vm.tiktok.com/ZM${z}abc123/`, "short"],
      ["Regarde!https://vm.tiktok.com/ZMabc123/", "short"],
      ["Mira este video👉https://vm.tiktok.com/ZMabc123/", "short"],
      ["https://vm.tiktok.com/ZMabc123/ Découvre la vidéo de @user sur TikTok", "short"],
      ["Check out user's video! #TikTok > https://vt.tiktok.com/ZSabc123/", "short"],
      [`看看这个视频：https://www.tiktok.com/@user/video/${id}，很有趣`, "video"],
      [`Lien :\nhttps://www.tiktok.com/@user/video/${id}\n\nEnvoyé depuis mon téléphone`, "video"],
    ];
    for (const [text, kind] of accepted) {
      let link;
      try {
        link = parseTikTokUrl(text);
      } catch (e) {
        throw new Error(`refusé à tort (${(e as ApiError).code}) : ${text}`);
      }
      expect(link.kind, text).toBe(kind);
      // L'adresse rendue est toujours reconstruite sur un serveur TikTok connu.
      expect(link.url, text).toMatch(/^https:\/\/(?:www\.tiktok\.com\/(?:@[A-Za-z0-9._-]+\/(?:video|photo)\/\d+|t\/[A-Za-z0-9_-]+\/)|v[mt]\.tiktok\.com\/[A-Za-z0-9_-]+\/)$/);
      if (kind !== "short") expect(link, text).toMatchObject({ id });
    }
  });
  it("ne se laisse pas détourner par une adresse piégée", () => {
    const id = "7123456789012345678";
    for (const u of [
      `https://evil.example/https://www.tiktok.com/@a/video/${id}`,
      `https://evil.example/?u=https://www.tiktok.com/@a/video/${id}`,
      `https://evil.example/#https://www.tiktok.com/@a/video/${id}`,
      `https://www.tiktok.com@evil.example/@a/video/${id}`,
      `https://www.tiktok.com.evil.example/@a/video/${id}`,
      `https://evil.example\\@www.tiktok.com/@a/video/${id}`,
      `https://xn--tiktok-9za.com/@a/video/${id}`,
      `https://www.tiktok.com:8443/@a/video/${id}`,
      `https://www.tiktok.com/login?redirect_url=${encodeURIComponent(`https://evil.example/@a/video/${id}`)}`,
      `javascript:alert(1)//www.tiktok.com/@a/video/${id}`,
      `file:///www.tiktok.com/@a/video/${id}`,
      `ftp://www.tiktok.com/@a/video/${id}`,
      "http://169.254.169.254/latest/meta-data/",
      "http://localhost/t/ZMabc123/",
      "https://vm.tiktok.com.evil.example/ZMabc123/",
    ]) {
      const result = code(() => parseTikTokUrl(u));
      expect(result, u).toMatch(/UNSUPPORTED_URL|INVALID_URL/);
    }
  });
  it("explique pourquoi un lien TikTok n'est pas une vidéo", () => {
    for (const u of ["https://www.tiktok.com/@scout2015", "https://www.tiktok.com/@scout2015/live", "https://www.tiktok.com/music/son-original-7123456789012345678", "https://www.tiktok.com/tag/fyp", "https://www.tiktok.com/", "https://shop.tiktok.com/view/product/1729384756012345678"]) {
      try {
        parseTikTokUrl(u);
        throw new Error(`accepté à tort : ${u}`);
      } catch (e) {
        expect(e, u).toMatchObject({ code: "UNSUPPORTED_URL", reason: "page" });
        expect((e as Error).message).toContain("Copier le lien");
      }
    }
    expect(() => parseTikTokUrl("https://youtube.com/watch?v=1")).toThrowError(/ne vient pas de TikTok/);
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
    await expect(resolveTikTokLink(short, loop)).rejects.toMatchObject({ code: "LINK_DEAD" });
  });
  it("refuse une redirection hors TikTok", async () => {
    await expect(resolveTikTokLink(short, res("https://evil.example/x"))).rejects.toMatchObject({ code: "LINK_DEAD" });
  });
  it("signale un lien court expiré", async () => {
    await expect(resolveTikTokLink(short, res())).rejects.toMatchObject({ code: "LINK_DEAD" });
    await expect(resolveTikTokLink(short, res("https://www.tiktok.com/?_r=1"))).rejects.toMatchObject({ code: "LINK_DEAD" });
  });
  it("distingue une panne de TikTok d'un lien mort", async () => {
    const down = (async () => { throw new Error("réseau"); }) as unknown as typeof fetch;
    await expect(resolveTikTokLink(short, down)).rejects.toMatchObject({ code: "UPSTREAM_ERROR" });
  });
  it("réessaie comme un téléphone quand la première réponse ne mène nulle part", async () => {
    let n = 0;
    const flaky = (async () => new Response(null, { status: 302, headers: { location: n++ ? "https://www.tiktok.com/@user/video/7123456789012345678" : "https://www.tiktok.com/?_r=1" } })) as unknown as typeof fetch;
    expect((await resolveTikTokLink(short, flaky)).id).toBe("7123456789012345678");
    expect(n).toBe(2);
  });
  it("lit l'adresse officielle quand TikTok répond par une page, sans jamais prendre une autre vidéo de la page", async () => {
    const page = (html: string) => (async () => new Response(html, { status: 200, headers: { "content-type": "text/html" } })) as unknown as typeof fetch;
    const other = '<a href="https://www.tiktok.com/@autre/video/7999999999999999999">tendance</a>';
    expect((await resolveTikTokLink(short, page(`<html><head>${other}<link rel="canonical" href="https://www.tiktok.com/@user/video/7123456789012345678"></head></html>`))).id).toBe("7123456789012345678");
    expect((await resolveTikTokLink(short, page(`<meta property="og:url" content="https://www.tiktok.com/@user/video/7123456789012345678?x=1&amp;y=2">`))).id).toBe("7123456789012345678");
    await expect(resolveTikTokLink(short, page(`<html>${other}</html>`))).rejects.toMatchObject({ code: "LINK_DEAD" });
    await expect(resolveTikTokLink(short, page('<link rel="canonical" href="https://evil.example/@user/video/7123456789012345678">'))).rejects.toMatchObject({ code: "LINK_DEAD" });
  });
  it("renvoie un carrousel de photos vers le mode Bannières", async () => {
    await expect(resolveTikTokLink(short, res("https://www.tiktok.com/@user/photo/7123456789012345678"))).rejects.toMatchObject({ code: "UNSUPPORTED_URL", reason: "photo" });
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
