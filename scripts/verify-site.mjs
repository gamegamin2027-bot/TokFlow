// Vérification réelle d'une instance de TokFlow (locale ou en production), par son API publique.
// Usage : node scripts/verify-site.mjs https://tokflow-2kvd.onrender.com
// Bannières (4 publications réelles), erreurs, vidéo MP4, audio MP3, conversion d'un fichier importé.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = (process.argv[2] ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const OUT = process.env.OUT ?? "/tmp/verify-site";
const FFMPEG = process.env.FFMPEG_PATH; // facultatif : inspection des fichiers (codec, dimensions)
const ONLY = process.env.ONLY?.split(","); // facultatif : bannieres,erreurs,video,conversion
mkdirSync(OUT, { recursive: true });

let failed = 0;
const check = (ok, label, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "OK   " : "ÉCHEC"} ${label}${detail ? ` — ${detail}` : ""}`);
  return ok;
};
const sha = (b) => createHash("sha256").update(b).digest("hex");
const post = (path, body) => fetch(BASE + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const bytes = async (res) => Buffer.from(await res.arrayBuffer());
const isMp4 = (b) => b.toString("latin1", 4, 8) === "ftyp";
const isJpg = (b) => b[0] === 0xff && b[1] === 0xd8;
const errorCode = async (res) => (await res.json().catch(() => null))?.error?.code;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function probe(file) {
  if (!FFMPEG) return null;
  const text = execFileSync("sh", ["-c", `"${FFMPEG}" -hide_banner -i "${file}" -map 0:v:0 -f null - 2>&1 || true`]).toString();
  const size = /, (\d{2,5})x(\d{2,5})/.exec(text);
  return { video: /Video: (\w+)/.exec(text)?.[1], audio: /Audio: (\w+)/.exec(text)?.[1] ?? "aucun", w: Number(size?.[1]), h: Number(size?.[2]), frames: Number([...text.matchAll(/frame=\s*(\d+)/g)].pop()?.[1]) };
}
/** Entrées d'une archive ZIP sans compression : nom → contenu. */
function unzip(zip) {
  const entries = new Map();
  let at = 0;
  while (zip.readUInt32LE(at) === 0x04034b50) {
    const size = zip.readUInt32LE(at + 18);
    const nameLen = zip.readUInt16LE(at + 26);
    const name = zip.toString("utf8", at + 30, at + 30 + nameLen);
    entries.set(name, zip.subarray(at + 30 + nameLen, at + 30 + nameLen + size));
    at += 30 + nameLen + size;
  }
  return entries;
}
const pad = (n) => String(n).padStart(2, "0");

const CASES = [
  { label: "référence (lien court, 14 animations)", url: "https://vm.tiktok.com/ZGdXHfBPR/", count: 14, animated: 14, pick: [2, 4, 7, 9, 12] },
  { label: "images fixes seules", url: "https://www.tiktok.com/@hrumizou/photo/7701976308133137682", count: 22, animated: 0, pick: [1, 5, 22] },
  { label: "mixte (6 animations sur 25)", url: "https://www.tiktok.com/@hrumizou/photo/7706538157596052743", count: 25, animated: 6, pick: [1, 2, 5, 25] },
  { label: "24 animations", url: "https://www.tiktok.com/@hrumizou/photo/7705779963105922311", count: 24, animated: 24, pick: [1, 13, 24] },
];

async function banners() {
  for (const c of CASES) {
    console.log(`\n— Bannières : ${c.label}`);
    const t = Date.now();
    let res = await post("/api/banners", { url: c.url });
    let set = await res.json();
    // Animations momentanément indisponibles (limite de débit du service tiers) : un second essai.
    if (res.ok && set.clipStatus === "unavailable") {
      console.log("      animations indisponibles au premier essai, nouvel essai dans 3 s");
      await sleep(3000);
      res = await post("/api/banners", { url: c.url });
      set = await res.json();
    }
    if (!check(res.ok, "analyse", res.ok ? `${((Date.now() - t) / 1000).toFixed(1)} s · « ${set.title} » · @${set.author} · statut ${set.clipStatus}` : `${res.status} ${JSON.stringify(set)}`)) continue;
    check(set.count === c.count, "nombre de bannières détectées", `${set.count} (attendu ${c.count})`);
    check(set.animatedCount === c.animated, "nombre d'animations récupérées", `${set.animatedCount} (attendu ${c.animated})`);
    check(set.items.every((item, i) => item.n === i + 1), "ordre et numérotation");
    const dir = join(OUT, set.postId);
    mkdirSync(dir, { recursive: true });
    const base = `/api/banners/${set.id}`;

    // Chaque fichier, tel que le visiteur le télécharge.
    const hashes = new Map();
    const info = { mp4: [], jpg: [] };
    let good = true;
    for (const item of set.items) {
      for (const format of item.animated ? ["mp4", "jpg"] : ["jpg"]) {
        const r = await fetch(`${BASE}${base}/${item.n}.${format}`);
        const data = r.ok ? await bytes(r) : Buffer.alloc(0);
        const name = /filename="([^"]+)"/.exec(r.headers.get("content-disposition") ?? "")?.[1];
        const valid = r.ok && (format === "mp4" ? isMp4(data) : isJpg(data)) && name === `Banniere_${pad(item.n)}.${format}`;
        if (!valid) {
          good = false;
          console.log(`      ${item.n}.${format} : ${r.status} ${name} ${data.length} octets`);
          continue;
        }
        hashes.set(name, sha(data));
        writeFileSync(join(dir, name), data);
        info[format].push({ bytes: data.length, ...probe(join(dir, name)) });
      }
    }
    check(good, "téléchargements individuels", `${info.mp4.length} MP4 + ${info.jpg.length} JPG, noms Banniere_NN.ext`);
    // Un créateur peut publier deux fois la même image : signalé, sans être une erreur.
    const twins = hashes.size - new Set(hashes.values()).size;
    console.log(`      fichiers distincts : ${hashes.size - twins} sur ${hashes.size}${twins ? " (image publiée en double par le créateur)" : ""}`);
    const kb = (list) => `${Math.round(Math.min(...list.map((f) => f.bytes)) / 1024)}–${Math.round(Math.max(...list.map((f) => f.bytes)) / 1024)} Ko`;
    const uniq = (list, f) => [...new Set(list.map(f))].join(", ");
    if (info.mp4.length) console.log(`      MP4 : ${kb(info.mp4)}${FFMPEG ? ` · vidéo ${uniq(info.mp4, (f) => f.video)} · audio ${uniq(info.mp4, (f) => f.audio)} · hauteurs ${uniq(info.mp4, (f) => f.h)} px · ${Math.min(...info.mp4.map((f) => f.frames))}–${Math.max(...info.mp4.map((f) => f.frames))} images` : ""}`);
    console.log(`      JPG : ${kb(info.jpg)}${FFMPEG ? ` · hauteurs ${uniq(info.jpg, (f) => f.h)} px` : ""}`);
    if (FFMPEG && info.mp4.length) check(info.mp4.every((f) => f.video === "h264" && f.frames > 5), "chaque MP4 est une vraie vidéo de plusieurs images");

    // Aperçu : lecture partielle, affichage en ligne.
    const first = set.items.find((i) => i.animated) ?? set.items[0];
    const ext = first.animated ? "mp4" : "jpg";
    const part = await fetch(`${BASE}${base}/${first.n}.${ext}?inline=1`, { headers: { range: "bytes=0-99" } });
    check(part.status === 206 && (await bytes(part)).length === 100 && (part.headers.get("content-disposition") ?? "").startsWith("inline"), "aperçu (lecture partielle, affichage en ligne)");
    const still = set.items.find((i) => !i.animated);
    if (still) {
      const r = await fetch(`${BASE}${base}/${still.n}.mp4`);
      check(r.status === 404 && (await errorCode(r)) === "NO_ANIMATION", `image fixe n° ${still.n} : aucun MP4 inventé`);
    }

    // Archive de la sélection : exactement les fichiers choisis, identiques aux téléchargements individuels.
    const expected = c.pick.map((n) => `Banniere_${pad(n)}.${set.items[n - 1].animated ? "mp4" : "jpg"}`);
    let z = await post(`${base}/zip`, { items: c.pick.map((n) => ({ n })) });
    let entries = z.ok ? unzip(await bytes(z)) : new Map();
    check(z.ok && JSON.stringify([...entries.keys()]) === JSON.stringify(expected), `ZIP de la sélection ${c.pick.join(", ")}`, [...entries.keys()].join(", ") || String(z.status));
    check([...entries].every(([name, data]) => sha(data) === hashes.get(name)), "contenu du ZIP identique aux fichiers individuels");
    check(/filename="Bannieres_[A-Za-z0-9._-]+_\d+\.zip"/.test(z.headers.get("content-disposition") ?? ""), "nom de l'archive", z.headers.get("content-disposition") ?? "");
    // Tout, dans les deux formats.
    z = await post(`${base}/zip`, { items: set.items.map((i) => ({ n: i.n, formats: ["mp4", "jpg"] })) });
    const all = z.ok ? await bytes(z) : Buffer.alloc(0);
    entries = z.ok ? unzip(all) : new Map();
    check(z.ok && entries.size === hashes.size && [...entries].every(([name, data]) => sha(data) === hashes.get(name)), "ZIP complet, deux formats", `${entries.size} fichiers, ${(all.length / 1e6).toFixed(1)} Mo`);
    writeFileSync(join(dir, "tout.zip"), all);
    await sleep(1200);
  }
}

async function errors() {
  console.log("\n— Erreurs");
  const expectError = async (label, res, status, code) => {
    const got = await errorCode(res);
    check(res.status === status && got === code, label, `${res.status} ${got}`);
  };
  await expectError("lien étranger refusé", await post("/api/banners", { url: "https://example.com/@a/photo/12345678901" }), 400, "NOT_TIKTOK");
  await expectError("adresse interne refusée", await post("/api/banners", { url: "http://169.254.169.254/latest/meta-data/" }), 400, "NOT_TIKTOK");
  await expectError("lien TikTok qui n'est pas une publication", await post("/api/banners", { url: "https://www.tiktok.com/@hrumizou" }), 400, "NOT_A_POST");
  await expectError("publication inexistante", await post("/api/banners", { url: "https://www.tiktok.com/@hrumizou/photo/7000000000000000001" }), 404, "POST_UNAVAILABLE");
  await expectError("vidéo classique", await post("/api/banners", { url: "https://www.tiktok.com/@scout2015/video/6718335390845095173" }), 400, "NOT_A_CAROUSEL");
  await expectError("analyse inconnue ou expirée", await fetch(`${BASE}/api/banners/${"a".repeat(32)}/1.jpg`), 410, "EXPIRED");
  await expectError("archive d'une analyse inconnue", await post(`/api/banners/${"a".repeat(32)}/zip`, { items: [{ n: 1 }] }), 410, "EXPIRED");
  await expectError("nom de fichier piégé", await fetch(`${BASE}/api/banners/${"a".repeat(32)}/..%2F..%2Fetc%2Fpasswd`), 404, "NOT_FOUND");
  await expectError("requête illisible", await fetch(`${BASE}/api/banners`, { method: "POST", body: "{" }), 400, "BAD_JSON");
  await expectError("requête trop volumineuse", await post("/api/banners", { url: "x".repeat(30_000) }), 413, "TOO_LARGE");
}

async function video() {
  console.log("\n— Vidéo et audio (fonctions existantes)");
  const url = "https://www.tiktok.com/@scout2015/video/6718335390845095173";
  const res = await post("/api/resolve", { url });
  const data = await res.json();
  if (!check(res.ok && data.linkDownload && data.qualities?.length > 0, "récupération de la vidéo", res.ok ? `« ${data.title} » · ${data.qualities?.map((q) => q.label).join(", ")} ${data.linkUnavailableReason ?? ""}` : `${res.status} ${JSON.stringify(data)}`)) return;
  const quality = data.qualities[0].id;
  let r = await post("/api/download", { url, format: "mp4", quality });
  let file = r.ok ? await bytes(r) : Buffer.alloc(0);
  writeFileSync(join(OUT, "video.mp4"), file);
  let p = probe(join(OUT, "video.mp4"));
  check(r.ok && isMp4(file) && file.length > 100_000, "téléchargement vidéo MP4", `${r.status} · ${(file.length / 1e6).toFixed(2)} Mo${p ? ` · ${p.video} ${p.w}x${p.h} · audio ${p.audio}` : ""}`);
  r = await post("/api/download", { url, format: "mp3", quality, bitrate: 192 });
  file = r.ok ? await bytes(r) : Buffer.alloc(0);
  writeFileSync(join(OUT, "audio.mp3"), file);
  check(r.ok && r.headers.get("content-type") === "audio/mpeg" && (file.toString("latin1", 0, 3) === "ID3" || file[0] === 0xff) && file.length > 20_000, "téléchargement audio MP3", `${r.status} · ${(file.length / 1024).toFixed(0)} Ko`);
  const thumb = data.thumbnail ? await fetch(BASE + data.thumbnail) : null;
  check(!!thumb?.ok && (thumb.headers.get("content-type") ?? "").startsWith("image/"), "miniature");
  const short = await post("/api/resolve", { url: "https://www.tiktok.com/@scout2015/video/1" });
  check(short.status === 400, "lien vidéo invalide refusé", String(short.status));
}

async function conversion() {
  console.log("\n— Conversion d'un fichier importé (fonction existante)");
  const sample = process.env.SAMPLE ?? join(OUT, "video.mp4");
  let input;
  try {
    input = (await import("node:fs")).readFileSync(sample);
  } catch {
    return check(false, "fichier d'essai introuvable", sample);
  }
  let r = await fetch(`${BASE}/api/convert?format=mp3&bitrate=128&name=essai.mp4`, { method: "POST", headers: { "content-type": "video/mp4" }, body: input });
  let file = r.ok ? await bytes(r) : Buffer.alloc(0);
  check(r.ok && r.headers.get("content-type") === "audio/mpeg" && file.length > 10_000, "fichier importé → MP3", `${r.status} · ${(file.length / 1024).toFixed(0)} Ko${r.ok ? "" : ` ${file.toString().slice(0, 200)}`}`);
  r = await fetch(`${BASE}/api/convert?format=mp4&target=480&name=essai.mp4`, { method: "POST", headers: { "content-type": "video/mp4" }, body: input });
  file = r.ok ? await bytes(r) : Buffer.alloc(0);
  writeFileSync(join(OUT, "converti.mp4"), file);
  const p = r.ok ? probe(join(OUT, "converti.mp4")) : null;
  check(r.ok && isMp4(file), "fichier importé → MP4 réduit", `${r.status} · ${(file.length / 1e6).toFixed(2)} Mo${p ? ` · ${p.video} ${p.w}x${p.h}` : ""}${r.ok ? "" : ` ${file.toString().slice(0, 200)}`}`);
}

console.log(`Instance vérifiée : ${BASE}`);
const health = await fetch(`${BASE}/api/health`);
check(health.ok, "état du service", JSON.stringify(await health.json().catch(() => null)));
const steps = { bannieres: banners, erreurs: errors, video, conversion };
for (const [name, step] of Object.entries(steps)) if (!ONLY || ONLY.includes(name)) await step();
console.log(failed ? `\n${failed} ÉCHEC(S)` : "\nTout est conforme.");
process.exit(failed ? 1 : 0);
