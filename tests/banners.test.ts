import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { inflateRawSync } from "node:zlib";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ClipSource } from "@/lib/banners/clip-source";

// Autorise un faux serveur de médias local, pour ces tests uniquement (ignoré en production).
process.env.BANNER_TEST_LOCAL_MEDIA = "1";
process.env.BANNER_MEDIA_TIMEOUT_MS = "1200";
process.env.BANNER_MAX_ACTIVE = "2";
const { analyseBanners, attachBannerClips, getBannerFile, getBannerZip, mediaUrl, resetBanners } = await import("@/lib/banners/service");
const { resolvePostLink } = await import("@/lib/banners/link");
const { fetchBytes } = await import("@/lib/banners/http");
const { createClipSource } = await import("@/lib/banners/clip-source");
const { buildZip } = await import("@/lib/banners/zip");

const MP4 = (tag: number) => Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypmp42"), Buffer.alloc(300, tag)]);
const JPG = (tag: number) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(500, tag)]);
const POST = "https://www.tiktok.com/@compte/photo/7000000000000000001";
const realFetch = globalThis.fetch;

/** Faux serveur de médias : fichiers valides et réponses hostiles. */
let media: Server;
let base = "";
const hits: string[] = [];
beforeAll(async () => {
  media = createServer((req, res) => {
    const url = req.url ?? "";
    hits.push(url);
    let m: RegExpExecArray | null;
    if ((m = /^\/clip\/(\d+)\.mp4$/.exec(url))) return res.end(MP4(Number(m[1])));
    if ((m = /^\/img\/(\d+)\.jpg$/.exec(url))) return res.end(JPG(Number(m[1])));
    if (url === "/redirect.mp4") return res.writeHead(302, { location: "/clip/1.mp4" }).end();
    if (url === "/page.mp4") return res.end("<html>ceci n'est pas une vidéo</html>");
    if (url === "/huge.mp4") {
      res.writeHead(200, { "content-length": 40_000_000 });
      return res.write(MP4(1));
    }
    if (url === "/stream") {
      const t = setInterval(() => res.write(Buffer.alloc(500_000)), 5);
      res.on("close", () => clearInterval(t));
      return;
    }
    if (url === "/drip.mp4") {
      res.write(MP4(1));
      const t = setInterval(() => res.write("x"), 100);
      res.on("close", () => clearInterval(t));
      return;
    }
    if (url === "/mute") return;
    res.statusCode = 404;
    res.end();
  });
  await new Promise<void>((r) => media.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(media.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await resetBanners();
  media.closeAllConnections();
  media.close();
});
afterEach(async () => {
  globalThis.fetch = realFetch;
  await resetBanners();
});

/** Remplace TikTok (page publique, liens courts) ; les requêtes vers le faux serveur de médias passent. */
function stubTikTok(handler: (url: string) => Response | Promise<Response>) {
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith(base)) return realFetch(input, init);
    calls.push(url);
    return handler(url);
  }) as typeof fetch;
  return calls;
}
const page = (count: number, extra: Record<string, unknown> = {}) => {
  const images = Array.from({ length: count }, (_, i) => ({ imageURL: { urlList: ["https://example.com/piege.jpg", `${base}/img/${i + 1}.jpg`] }, imageWidth: 2524, imageHeight: 1420 }));
  const item = { id: "7000000000000000001", desc: "Bannières de test", author: { uniqueId: "compte" }, ...(count ? { imagePost: { images, title: "Titre du carrousel" } } : {}), ...extra };
  const data = { __DEFAULT_SCOPE__: { "webapp.video-detail": { statusCode: 0, itemInfo: { itemStruct: item } } } };
  return new Response(`<html><script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${JSON.stringify(data)}</script></html>`);
};
const source = (clips: (string | null)[], images: string[][] = []): ClipSource & { calls: number } => {
  const s = { name: "test", calls: 0, fetchClips: async () => (s.calls++, { clips, images }) };
  return s;
};
const zipNames = (zip: Buffer) => {
  const names: string[] = [];
  for (let at = zip.indexOf(Buffer.from([0x50, 0x4b, 1, 2])); at >= 0 && zip.readUInt32LE(at) === 0x02014b50; ) {
    const len = zip.readUInt16LE(at + 28);
    names.push(zip.toString("utf8", at + 46, at + 46 + len));
    at += 46 + len;
    if (at + 4 > zip.length) break;
  }
  return names;
};
const code = async (p: Promise<unknown>) => p.then(() => "OK", (e: { code?: string }) => e.code ?? String(e));

describe("bannières : domaines et liens autorisés", () => {
  it("n'accepte comme médias que les serveurs de fichiers TikTok, en https", () => {
    for (const u of ["https://v16m.tiktokcdn-us.com/a/?mime_type=video_mp4", "https://p16-sign-va.tiktokcdn.com/obj/x.jpeg", "https://v19.tiktokcdn-eu.com/x/", "https://api16.tiktokv.com/x"]) expect(mediaUrl(u), u).not.toBeNull();
    for (const u of [
      "https://example.com/clip.mp4",
      "https://tiktokcdn.com.evil.example/clip.mp4",
      "https://eviltiktokcdn.com/clip.mp4",
      "https://tiktokcdn-us.com@evil.example/clip.mp4",
      "https://user:pass@v16m.tiktokcdn-us.com/clip.mp4",
      "https://evil.example/?h=v16m.tiktokcdn-us.com",
      "http://v16m.tiktokcdn-us.com/clip.mp4",
      "https://v16m.tiktokcdn-us.com:8443/clip.mp4",
      "https://169.254.169.254/latest/meta-data/",
      "https://127.0.0.1/x",
      "https://[::1]/x",
      "https://localhost/x",
      "https://10.0.0.5/x",
      "file:///etc/passwd",
      "ftp://v16m.tiktokcdn-us.com/x",
      "//v16m.tiktokcdn-us.com/x",
      "",
      "pas une adresse",
    ])
      expect(mediaUrl(u), u).toBeNull();
  });

  it("reconnaît les liens de publication et refuse le reste sans aucune requête", async () => {
    const calls = stubTikTok(() => new Response(null));
    expect(await resolvePostLink(" https://www.tiktok.com/@a.b_c/photo/12345678901?is_from_webapp=1 ")).toEqual({ id: "12345678901", username: "a.b_c", kind: "photo", canonical: "https://www.tiktok.com/@a.b_c/photo/12345678901" });
    expect((await resolvePostLink("m.tiktok.com/@a/video/12345678901")).kind).toBe("video");
    expect(await code(resolvePostLink("https://example.com/@a/photo/12345678901"))).toBe("NOT_TIKTOK");
    expect(await code(resolvePostLink("https://tiktok.com.evil.io/@a/photo/12345678901"))).toBe("NOT_TIKTOK");
    expect(await code(resolvePostLink("http://169.254.169.254/latest/meta-data/"))).toBe("NOT_TIKTOK");
    expect(await code(resolvePostLink("https://www.tiktok.com/@a"))).toBe("NOT_A_POST");
    expect(await code(resolvePostLink("https://user:pw@www.tiktok.com/@a/photo/12345678901"))).toBe("INVALID_URL");
    expect(await code(resolvePostLink("https://www.tiktok.com:8443/@a/photo/12345678901"))).toBe("INVALID_URL");
    expect(await code(resolvePostLink("file:///etc/passwd"))).toBe("INVALID_URL");
    expect(await code(resolvePostLink(42))).toBe("INVALID_URL");
    expect(await code(resolvePostLink("x".repeat(3000)))).toBe("INVALID_URL");
    expect(calls).toEqual([]);
  });

  it("suit les liens courts, 5 redirections au plus, uniquement vers TikTok", async () => {
    const redirect = (to: string) => new Response(null, { status: 302, headers: { location: to } });
    let calls = stubTikTok(() => redirect("https://www.tiktok.com/@compte/photo/12345678901?_r=1&share=x"));
    expect((await resolvePostLink("https://vm.tiktok.com/ZGdXHfBPR/")).canonical).toBe("https://www.tiktok.com/@compte/photo/12345678901");
    calls = stubTikTok(() => redirect("https://evil.example/@a/photo/12345678901"));
    expect(await code(resolvePostLink("https://vm.tiktok.com/abc/"))).toBe("NOT_TIKTOK");
    expect(calls).toHaveLength(1); // le site étranger n'est jamais contacté
    calls = stubTikTok(() => redirect("http://169.254.169.254/latest/meta-data/"));
    expect(await code(resolvePostLink("https://vt.tiktok.com/abc/"))).toBe("NOT_TIKTOK");
    expect(calls).toHaveLength(1);
    stubTikTok(() => redirect("https://www.tiktok.com:8080/@a/photo/12345678901"));
    expect(await code(resolvePostLink("https://vm.tiktok.com/abc/"))).toBe("INVALID_URL");
    calls = stubTikTok((u) => redirect(u.includes("vm.") ? "https://vt.tiktok.com/b/" : "https://vm.tiktok.com/a/"));
    expect(await code(resolvePostLink("https://vm.tiktok.com/a/"))).toBe("TOO_MANY_REDIRECTS");
    expect(calls).toHaveLength(5);
    stubTikTok(() => new Response(null));
    expect(await code(resolvePostLink("https://vm.tiktok.com/mort/"))).toBe("LINK_DEAD");
  });
});

describe("bannières : requêtes sortantes bornées", () => {
  it("coupe un serveur muet, un envoi au compte-gouttes et un fichier trop gros ; ne suit pas les redirections", async () => {
    let t = Date.now();
    expect(await code(fetchBytes(`${base}/mute`, { timeoutMs: 300, maxBytes: 1000 }))).toBe("TIMEOUT");
    expect(Date.now() - t).toBeLessThan(1500);
    t = Date.now();
    expect(await code(fetchBytes(`${base}/drip.mp4`, { timeoutMs: 500, maxBytes: 1_000_000 }))).toBe("TIMEOUT");
    expect(Date.now() - t).toBeLessThan(1800);
    expect(await code(fetchBytes(`${base}/huge.mp4`, { timeoutMs: 3000, maxBytes: 1_000_000 }))).toBe("TOO_LARGE");
    expect(await code(fetchBytes(`${base}/stream`, { timeoutMs: 5000, maxBytes: 2_000_000 }))).toBe("TOO_LARGE");
    const redirected = await fetchBytes(`${base}/redirect.mp4`, { maxBytes: 1000 });
    expect(redirected.status).toBe(302);
    expect(redirected.body).toHaveLength(0);
  });
});

describe("bannières : analyse, fichiers, archive", () => {
  it("carrousel entièrement animé : MP4 et JPG d'origine, noms et ordre corrects", async () => {
    stubTikTok(() => page(5));
    const set = await analyseBanners(POST, { clipSource: source([1, 2, 3, 4, 5].map((n) => `${base}/clip/${n}.mp4`)) });
    expect(set).toMatchObject({ postId: "7000000000000000001", author: "compte", title: "Titre du carrousel", count: 5, animatedCount: 5, clipStatus: "ok", notice: undefined });
    expect(set.items.map((i) => [i.n, i.animated])).toEqual([[1, true], [2, true], [3, true], [4, true], [5, true]]);
    expect(set.items[0]).toMatchObject({ width: 2524, height: 1420, clipBytes: MP4(1).length });
    for (const n of [1, 3, 5]) {
      const mp4 = await getBannerFile(set.id, n, "mp4");
      expect(mp4).toMatchObject({ name: `Banniere_0${n}.mp4`, type: "video/mp4" });
      expect(mp4.data.equals(MP4(n))).toBe(true); // octet pour octet, aucun retraitement
      const jpg = await getBannerFile(set.id, n, "jpg");
      expect(jpg).toMatchObject({ name: `Banniere_0${n}.jpg`, type: "image/jpeg" });
      expect(jpg.data.equals(JPG(n))).toBe(true);
    }
    expect(await code(getBannerFile(set.id, 6, "jpg"))).toBe("NOT_FOUND");
    expect(await code(getBannerFile(set.id, 0, "jpg"))).toBe("NOT_FOUND");
    expect(await code(getBannerFile(set.id, 1, "exe"))).toBe("BAD_FORMAT");
    expect(await code(getBannerFile("a".repeat(32), 1, "jpg"))).toBe("EXPIRED");
    expect(await code(getBannerFile("../../etc/passwd", 1, "jpg"))).toBe("EXPIRED");
  });

  it("archive : exactement la sélection, dans l'ordre, fichiers identiques aux téléchargements individuels", async () => {
    stubTikTok(() => page(6));
    const set = await analyseBanners(POST, { clipSource: source([`${base}/clip/1.mp4`, null, `${base}/clip/3.mp4`, null, `${base}/clip/5.mp4`, null]) });
    expect(set).toMatchObject({ count: 6, animatedCount: 3, clipStatus: "partial" });
    expect(set.notice).toContain("proposées en image");

    // Par défaut : MP4 si la bannière est animée, sinon l'image.
    const zip = await getBannerZip(set.id, [{ n: 5 }, { n: 2 }, { n: 3 }]);
    expect(zip.name).toBe("Bannieres_compte_7000000000000000001.zip");
    expect(zip.files).toEqual(["Banniere_02.jpg", "Banniere_03.mp4", "Banniere_05.mp4"]);
    expect(zipNames(zip.data)).toEqual(zip.files);
    expect(zip.data.includes(MP4(3))).toBe(true);
    expect(zip.data.includes(MP4(5))).toBe(true);
    expect(zip.data.includes(JPG(2))).toBe(true);
    expect(zip.data.includes(MP4(1))).toBe(false); // non sélectionnée
    expect(zip.data.includes(JPG(3))).toBe(false);

    // Deux formats demandés : jamais de MP4 inventé pour une image fixe ; doublons ignorés.
    const both = await getBannerZip(set.id, [{ n: 1, formats: ["mp4", "jpg"] }, { n: 2, formats: ["mp4", "jpg"] }, { n: 1, formats: ["mp4"] }]);
    expect(both.files).toEqual(["Banniere_01.jpg", "Banniere_01.mp4", "Banniere_02.jpg"]);

    expect(await code(getBannerZip(set.id, []))).toBe("EMPTY");
    expect(await code(getBannerZip(set.id, "tout"))).toBe("EMPTY");
    expect(await code(getBannerZip(set.id, [{ n: 2, formats: ["mp4"] }]))).toBe("EMPTY");
    expect(await code(getBannerZip(set.id, [{ n: 9 }]))).toBe("NOT_FOUND");
    expect(await code(getBannerZip(set.id, [{ n: "1" }]))).toBe("NOT_FOUND");
    expect(await code(getBannerZip(set.id, [{ n: 1, formats: ["exe"] }]))).toBe("BAD_FORMAT");
    expect(await code(getBannerZip(set.id, Array.from({ length: 41 }, () => ({ n: 1 }))))).toBe("TOO_MANY");
    expect(await code(getBannerFile(set.id, 2, "mp4"))).toBe("NO_ANIMATION");
  });

  it("le format ZIP produit est lisible (signatures, tailles, contrôle d'intégrité)", () => {
    const a = Buffer.from("bonjour");
    const zip = buildZip([{ name: "Banniere_01.jpg", data: a }, { name: "Banniere_02.mp4", data: Buffer.alloc(1000, 7) }]);
    expect(zip.readUInt32LE(0)).toBe(0x04034b50);
    expect(zip.readUInt16LE(8)).toBe(0); // sans compression : copie exacte
    expect(zip.readUInt32LE(18)).toBe(a.length);
    expect(zip.subarray(30 + 15, 30 + 15 + a.length).equals(a)).toBe(true);
    expect(zip.readUInt16LE(zip.length - 22 + 10)).toBe(2);
    expect(zipNames(zip)).toEqual(["Banniere_01.jpg", "Banniere_02.mp4"]);
    expect(() => inflateRawSync(Buffer.alloc(0))).toThrow(); // garde-fou : zlib est bien disponible
  });

  it("publication sans animation, source désactivée, source en panne : les images restent proposées", async () => {
    stubTikTok(() => page(3));
    let set = await analyseBanners(POST, { clipSource: source([null, null, null]) });
    expect(set).toMatchObject({ count: 3, animatedCount: 0, clipStatus: "none", notice: "Cette publication ne contient que des images fixes." });
    await resetBanners();

    set = await analyseBanners(POST, { clipSource: null });
    expect(set).toMatchObject({ count: 3, animatedCount: 0, clipStatus: "disabled" });
    await resetBanners();

    const logs: string[] = [];
    const broken: ClipSource = { name: "panne", fetchClips: () => Promise.reject(new Error("panne")) };
    set = await analyseBanners(POST, { clipSource: broken, log: (m) => logs.push(m) });
    expect(set).toMatchObject({ count: 3, animatedCount: 0, clipStatus: "unavailable" });
    expect(set.notice).toContain("Réessayez plus tard");
    expect(logs.join()).toContain("source de clips (panne)");
    expect((await getBannerFile(set.id, 2, "jpg")).data.equals(JPG(2))).toBe(true);
    expect(await code(getBannerFile(set.id, 2, "mp4"))).toBe("NO_ANIMATION");

    // Une analyse sans animations est retentée au lieu d'être resservie ; une analyse complète est réutilisée.
    const working = source([1, 2, 3].map((n) => `${base}/clip/${n}.mp4`));
    const again = await analyseBanners(POST, { clipSource: working });
    expect(again).toMatchObject({ animatedCount: 3, clipStatus: "ok" });
    expect(again.id).not.toBe(set.id);
    expect(await code(getBannerFile(set.id, 1, "jpg"))).toBe("EXPIRED");
    expect((await analyseBanners(POST, { clipSource: working })).id).toBe(again.id);
    expect(working.calls).toBe(1);
  });

  it("clips incohérents ou hostiles : jamais d'animation devinée, jamais d'adresse étrangère téléchargée", async () => {
    stubTikTok(() => page(8));
    // Nombre de clips différent du nombre d'images : aucun n'est associé.
    let set = await analyseBanners(POST, { clipSource: source([`${base}/clip/1.mp4`, `${base}/clip/2.mp4`]) });
    expect(set).toMatchObject({ count: 8, animatedCount: 0, clipStatus: "unavailable" });
    await resetBanners();

    hits.length = 0;
    const calls = stubTikTok(() => page(8));
    set = await analyseBanners(POST, {
      clipSource: source([`${base}/clip/1.mp4`, `${base}/redirect.mp4`, `${base}/page.mp4`, `${base}/drip.mp4`, `${base}/huge.mp4`, "https://example.com/clip.mp4", "http://169.254.169.254/latest/meta-data/", "file:///etc/passwd"]),
    });
    expect(set.items.filter((i) => i.animated).map((i) => i.n)).toEqual([1]);
    expect(set.clipStatus).toBe("partial");
    expect(hits.filter((h) => h === "/clip/1.mp4")).toHaveLength(1); // la cible de la redirection n'a pas été suivie
    expect(calls.every((u) => u.startsWith("https://www.tiktok.com/"))).toBe(true); // rien vers example.com ni vers une adresse interne
    expect(await code(getBannerFile(set.id, 2, "mp4"))).toBe("NO_ANIMATION");
    // L'adresse piégée placée en tête de la liste d'images est ignorée, la suivante sert.
    expect((await getBannerFile(set.id, 2, "jpg")).data.equals(JPG(2))).toBe(true);
    expect(calls.some((u) => u.includes("example.com"))).toBe(false);
  });

  it("vidéo classique : erreur claire, et le service tiers n'est jamais interrogé", async () => {
    stubTikTok(() => page(0));
    const clips = source([]);
    expect(await code(analyseBanners("https://www.tiktok.com/@compte/video/7000000000000000001", { clipSource: clips }))).toBe("NOT_A_CAROUSEL");
    expect(clips.calls).toBe(0);
  });

  it("publication introuvable ou privée, TikTok en erreur", async () => {
    stubTikTok(() => new Response(`<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${JSON.stringify({ __DEFAULT_SCOPE__: { "webapp.video-detail": { statusCode: 10204 } } })}</script>`));
    expect(await code(analyseBanners(POST, { clipSource: source([], [[`${base}/img/1.jpg`]]) }))).toBe("POST_UNAVAILABLE");
    stubTikTok(() => page(2, { privateItem: true }));
    expect(await code(analyseBanners(POST, { clipSource: null }))).toBe("POST_UNAVAILABLE");
    stubTikTok(() => new Response("erreur", { status: 503 }));
    expect(await code(analyseBanners(POST, { clipSource: null }))).toBe("TIKTOK_ERROR");
    stubTikTok(() => new Response("<html>page inattendue</html>"));
    expect(await code(analyseBanners(POST, { clipSource: null }))).toBe("TIKTOK_FORMAT");
  });

  it("page TikTok en panne : les images connues de la source de clips prennent le relais", async () => {
    stubTikTok(() => new Response("erreur", { status: 503 }));
    const set = await analyseBanners(POST, { clipSource: source([`${base}/clip/1.mp4`, null], [[`${base}/img/1.jpg`], [`${base}/img/2.jpg`]]) });
    expect(set).toMatchObject({ count: 2, animatedCount: 1, clipStatus: "partial", author: "compte" });
    expect((await getBannerFile(set.id, 2, "jpg")).data.equals(JPG(2))).toBe(true);
  });

  it("analyses simultanées : au-delà de la limite, refus immédiat ; la place est rendue ensuite", async () => {
    stubTikTok(() => page(1));
    const releases: (() => void)[] = [];
    const slow: ClipSource = { name: "lent", fetchClips: () => new Promise((r) => releases.push(() => r({ clips: [null], images: [] }))) };
    const first = analyseBanners(POST, { clipSource: slow });
    const second = analyseBanners(POST.replace("0001", "0002"), { clipSource: slow });
    await vi.waitFor(() => expect(releases).toHaveLength(2));
    expect(await code(analyseBanners(POST, { clipSource: null }))).toBe("BUSY");
    releases.forEach((release) => release());
    await Promise.all([first, second]);
    expect((await analyseBanners(POST, { clipSource: null })).count).toBe(1);
  });
});

describe("bannières : animations transmises par le navigateur (serveur refusé par le service de clips)", () => {
  const refused: ClipSource = { name: "refus", fetchClips: async () => Promise.reject(new Error("403")) };

  it("complète l'analyse, adresse par adresse, sans faire confiance au navigateur", async () => {
    stubTikTok(() => page(4));
    const set = await analyseBanners(POST, { clipSource: refused });
    expect(set).toMatchObject({ count: 4, animatedCount: 0, clipStatus: "unavailable" });
    expect(set.clipFallback).toEqual({ api: "https://www.tikwm.com/api/", url: POST });

    expect(await code(attachBannerClips(set.id, [`${base}/clip/1.mp4`]))).toBe("BAD_CLIPS"); // mauvaise longueur
    expect(await code(attachBannerClips(set.id, "x"))).toBe("BAD_CLIPS");
    expect(await code(attachBannerClips("a".repeat(32), []))).toBe("EXPIRED");

    hits.length = 0;
    const done = await attachBannerClips(set.id, [`${base}/clip/1.mp4`, "http://169.254.169.254/latest/meta-data", `${base}/page.mp4`, null]);
    expect(done).toMatchObject({ id: set.id, animatedCount: 1, clipStatus: "partial", clipFallback: undefined });
    expect(done.items.map((i) => i.animated)).toEqual([true, false, false, false]);
    expect(hits.some((h) => h.includes("meta-data"))).toBe(false); // adresse étrangère jamais appelée
    expect((await getBannerFile(set.id, 1, "mp4")).data.equals(MP4(1))).toBe(true);
    expect(await code(getBannerFile(set.id, 3, "mp4"))).toBe("NO_ANIMATION"); // faux MP4 rejeté
    expect((await getBannerZip(set.id, [{ n: 1 }, { n: 2 }])).files).toEqual(["Banniere_01.mp4", "Banniere_02.jpg"]);

    // Une analyse déjà complétée n'accepte plus de nouvelles adresses.
    hits.length = 0;
    await attachBannerClips(set.id, [null, `${base}/clip/2.mp4`, null, null]);
    expect(hits).toEqual([]);
    // Elle n'est plus partagée : un autre visiteur repart d'une analyse neuve.
    expect((await analyseBanners(POST, { clipSource: refused })).id).not.toBe(set.id);
  });

  it("publication sans aucune animation : images fixes, sans avertissement d'indisponibilité", async () => {
    stubTikTok(() => page(2));
    const set = await analyseBanners(POST, { clipSource: refused });
    const done = await attachBannerClips(set.id, [null, null]);
    expect(done).toMatchObject({ animatedCount: 0, clipStatus: "none", clipFallback: undefined });
  });

  it("n'est pas proposé quand la source est coupée ou qu'une analyse a réussi", async () => {
    stubTikTok(() => page(2));
    const ok = await analyseBanners(POST, { clipSource: source([`${base}/clip/1.mp4`, `${base}/clip/2.mp4`]) });
    expect(ok.clipFallback).toBeUndefined();
    hits.length = 0;
    await attachBannerClips(ok.id, [`${base}/clip/2.mp4`, `${base}/clip/1.mp4`]);
    expect(hits).toEqual([]);
  });
});

describe("bannières : service de clips TikWM (réponses simulées)", () => {
  const link = { id: "7000000000000000001", username: "compte", kind: "photo" as const, canonical: POST };
  const tikwm = () => createClipSource({ BANNER_CLIP_SOURCE: "tikwm", TIKWM_API_URL: "https://www.tikwm.com/api/", BANNER_CLIP_TIMEOUT_MS: "400" })!;
  const reply = (body: unknown, status = 200) => () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status });

  it("ne transmet que l'adresse canonique de la publication", async () => {
    let seen: { url: string; headers: Headers } | undefined;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      seen = { url: String(input), headers: new Headers(init?.headers) };
      return new Response(JSON.stringify({ code: 0, data: { id: link.id, images: ["https://p16.tiktokcdn.com/1.jpg", 5], live_images: ["https://v16.tiktokcdn.com/1.mp4", null, "http://sans-https/2.mp4"] } }));
    }) as typeof fetch;
    const result = await tikwm().fetchClips(link);
    expect(result).toEqual({ clips: ["https://v16.tiktokcdn.com/1.mp4", null, null], images: [["https://p16.tiktokcdn.com/1.jpg"], []] });
    const url = new URL(seen!.url);
    expect(url.origin + url.pathname).toBe("https://www.tikwm.com/api/");
    expect([...url.searchParams.entries()]).toEqual([["url", POST]]);
    expect([...seen!.headers.keys()].sort()).toEqual(["user-agent"]); // ni cookie, ni adresse du visiteur
  });

  it("traduit chaque panne en erreur précise", async () => {
    stubTikTok(reply("pas du json"));
    expect(await code(tikwm().fetchClips(link))).toBe("CLIPS_FORMAT");
    stubTikTok(reply({ code: -1, msg: "Url parsing is failed!" }));
    expect(await code(tikwm().fetchClips(link))).toBe("CLIPS_REFUSED");
    stubTikTok(reply({}, 500));
    expect(await code(tikwm().fetchClips(link))).toBe("CLIPS_ERROR");
    stubTikTok(reply({ code: 0, data: { id: "999", live_images: [] } }));
    expect(await code(tikwm().fetchClips(link))).toBe("CLIPS_FORMAT");
    stubTikTok(() => new Promise<Response>(() => undefined));
    globalThis.fetch = ((_: unknown, init?: RequestInit) => new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("abort"))))) as typeof fetch;
    expect(await code(tikwm().fetchClips(link))).toBe("CLIPS_TIMEOUT");
  });

  it("limite de débit : un second essai après une seconde, puis abandon", async () => {
    let n = 0;
    stubTikTok(() => (++n === 1 ? new Response(JSON.stringify({ code: -1, msg: "Free Api Limit: 1 request/second." })) : new Response(JSON.stringify({ code: 0, data: { id: link.id, live_images: [] } }))));
    expect(await tikwm().fetchClips(link)).toEqual({ clips: [], images: [] });
    expect(n).toBe(2);
    n = 0;
    stubTikTok(() => (n++, new Response(null, { status: 429 })));
    expect(await code(tikwm().fetchClips(link))).toBe("CLIPS_QUOTA");
    expect(n).toBe(2);
  });

  it("`none` désactive la source", () => {
    expect(createClipSource({ BANNER_CLIP_SOURCE: "none" })).toBeNull();
  });
});
