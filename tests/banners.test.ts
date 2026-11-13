import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { classify, detectSegments } from "@/lib/media/banners/detect";
import { canCopy, countFrames, frameRange } from "@/lib/media/banners/extract";
import { scanFrames } from "@/lib/media/banners/frames";
import { bannerFileName, checkRange, clipFile, exportFile, getJob, parseItems, resetBannerJobs, setSensitivity, startExport, startFromUpload, view } from "@/lib/media/banners/service";
import { probe } from "@/lib/media/ffmpeg";
import { writeZip } from "@/lib/media/zip";

/**
 * Tests réels : des vidéos « compilation de bannières » sont fabriquées avec FFmpeg
 * (frontières connues), puis analysées, découpées et archivées comme en production.
 */
const ffmpeg = process.env.FFMPEG_PATH!;
const dir = mkdtempSync(join(tmpdir(), "tokflow-test-"));
const truth = (name: string) => JSON.parse(readFileSync(join(dir, `${name}.json`), "utf8")) as { boundaries: number[]; duration: number; segments: number };
const video = (name: string) => join(dir, `${name}.mp4`);

beforeAll(() => {
  execFileSync("python3", ["scripts/make-banner-fixture.py", ffmpeg, dir], { stdio: "pipe" });
});
afterAll(async () => {
  await resetBannerJobs();
  rmSync(dir, { recursive: true, force: true });
});

async function analyse(name: string, sensitivity: "low" | "normal" | "high" = "normal") {
  const t = truth(name);
  const scan = await scanFrames(video(name), t.duration);
  return { t, scan, result: detectSegments(scan.signatures, { times: scan.times, duration: t.duration, sensitivity }) };
}

/** Chaque frontière attendue est trouvée à `tolerance` près, et aucune n'est inventée. */
function expectBoundaries(found: number[], expected: number[], tolerance: number) {
  expect(found).toHaveLength(expected.length);
  expected.forEach((e, i) => expect(Math.abs(found[i] - e)).toBeLessThanOrEqual(tolerance));
}

describe("détection des bannières", () => {
  it("coupes franches : 6 bannières, frontières à l'image près", async () => {
    const { t, result } = await analyse("coupes");
    expect(result.segments).toHaveLength(6);
    expectBoundaries(result.boundaries.map((b) => b.time), t.boundaries, 0.02);
    expect(result.boundaries.every((b) => b.kind === "cut")).toBe(true);
    expect(result.verdict).toBe("banners");
  });

  it("fondus enchaînés, au noir et au blanc : ne fusionne pas les bannières", async () => {
    const { t, result } = await analyse("fondus");
    expect(result.segments).toHaveLength(5);
    expectBoundaries(result.boundaries.map((b) => b.time), t.boundaries, 0.3);
  });

  it("flashs, pulsations lumineuses, zoom et mouvement rapide : ne découpe pas à l'intérieur d'une bannière", async () => {
    for (const sensitivity of ["normal", "high"] as const) {
      const { t, result } = await analyse("effets", sensitivity);
      expect(result.segments).toHaveLength(6);
      expectBoundaries(result.boundaries.map((b) => b.time), t.boundaries, 0.3);
    }
  });

  it("séquences visuellement proches : les sépare quand même", async () => {
    const { t, result } = await analyse("proches");
    expectBoundaries(result.boundaries.map((b) => b.time), t.boundaries, 0.02);
  });

  it("14 bannières courtes avec transitions mélangées", async () => {
    const { t, result } = await analyse("quatorze");
    expect(result.segments).toHaveLength(14);
    expectBoundaries(result.boundaries.map((b) => b.time), t.boundaries, 0.3);
    expect(result.segments.map((s) => s.index)).toEqual(Array.from({ length: 14 }, (_, i) => i + 1));
  });

  it("vidéo classique en un seul plan : une seule séquence, à toutes les sensibilités", async () => {
    for (const sensitivity of ["low", "normal", "high"] as const) {
      const { result } = await analyse("classique", sensitivity);
      expect(result.segments).toHaveLength(1);
      expect(result.verdict).toBe("single");
    }
  });

  it("les séquences couvrent toute la vidéo, sans trou ni chevauchement", async () => {
    const { t, result } = await analyse("quatorze");
    expect(result.segments[0].start).toBe(0);
    result.segments.slice(1).forEach((s, i) => expect(s.start).toBe(result.segments[i].end));
    expect(result.segments[result.segments.length - 1].end).toBeCloseTo(t.duration, 1);
  });

  it("verdict prudent : pas de classement inventé quand les durées sont irrégulières", () => {
    expect(classify([{ index: 1, start: 0, end: 30 }, { index: 2, start: 30, end: 31 }]).verdict).toBe("uncertain");
    expect(classify([{ index: 1, start: 0, end: 12 }]).verdict).toBe("single");
    expect(classify([0, 3, 6, 9].map((s, i) => ({ index: i + 1, start: s, end: s + 3 }))).verdict).toBe("banners");
  });
});

const decodedFrames = countFrames;

describe("extraction et archive", () => {
  let id = "";

  async function waitReady() {
    for (let i = 0; i < 600; i++) {
      const v = view(getJob(id));
      if (v.status === "ready" || v.status === "error") return v;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error("analyse trop longue");
  }

  beforeAll(async () => {
    const job = await startFromUpload("test", "Compilation", async (path) => copyFileSync(video("coupes"), path));
    id = job.id;
    expect(job.status).toMatch(/downloading|analysing/);
  });

  it("analyse un fichier envoyé et expose les séquences", async () => {
    const v = await waitReady();
    expect(v.status).toBe("ready");
    expect(v.segments).toHaveLength(6);
    expect(v.verdict).toBe("banners");
    expect(v.duration).toBeCloseTo(15, 1);
  });

  it("chaque bannière est un fichier vidéo complet et indépendant, à l'image près", async () => {
    const job = getJob(id);
    const modes: string[] = [];
    for (const s of view(job).segments) {
      const [a, b] = frameRange(job.scan!.times, s.start, s.end);
      const { path, mode } = await clipFile(job, s.start, s.end);
      modes.push(mode);
      const info = await probe(path);
      expect(info.hasVideo).toBe(true);
      expect(info.hasAudio).toBe(true);
      expect(info.videoCodec).toBe("h264");
      expect([s.index, mode, await decodedFrames(path)]).toEqual([s.index, mode, b - a]); // toute la séquence, rien de la voisine
      expect(info.durationSeconds).toBeGreaterThan(2.3);
      expect(info.durationSeconds).toBeLessThan(2.7);
    }
    expect(modes).toContain("copy"); // la copie directe est utilisée quand elle est exacte
  });

  it("une découpe corrigée à la main est ré-encodée proprement", async () => {
    const job = getJob(id);
    const { start, end } = checkRange(job, 3.1, 4.4); // au milieu d'une séquence : pas d'image clé
    expect(canCopy(job.scan!, job.info!, start, end)).toBe(false);
    const { path, mode } = await clipFile(job, start, end);
    expect(mode).toBe("encode");
    const [a, b] = frameRange(job.scan!.times, start, end);
    expect(await decodedFrames(path)).toBe(b - a);
  });

  it("refuse les intervalles et sélections invalides", () => {
    const job = getJob(id);
    for (const [s, e] of [[-1, 2], [2, 2.01], [5, 4], [0, 999], ["x", 3]] as const) expect(() => checkRange(job, s, e)).toThrow();
    expect(() => parseItems(job, [])).toThrow();
    expect(() => parseItems(job, [{ index: 1, start: 0, end: 2 }, { index: 1, start: 2, end: 4 }])).toThrow();
    expect(() => parseItems(job, [{ index: 0, start: 0, end: 2 }])).toThrow();
    expect(() => getJob("../../etc/passwd")).toThrow();
    expect(() => getJob("0".repeat(32))).toThrow();
  });

  it("l'archive ZIP contient uniquement la sélection, avec des fichiers lisibles", async () => {
    const segments = view(getJob(id)).segments;
    const picked = [segments[0], segments[2], segments[5]];
    startExport(id, picked);
    let exp = view(getJob(id)).export!;
    expect(exp.total).toBe(3);
    for (let i = 0; i < 600 && exp.status === "running"; i++) {
      await new Promise((r) => setTimeout(r, 100));
      exp = view(getJob(id)).export!;
    }
    expect(exp.status).toBe("ready");
    expect(exp.done).toBe(3);
    expect(exp.errors).toEqual([]);

    const { path, fileName } = exportFile(id, exp.id);
    expect(fileName).toBe("Compilation-bannieres.zip");
    const entries = readZip(readFileSync(path));
    expect(entries.map((e) => e.name)).toEqual(["Bannière 01.mp4", "Bannière 03.mp4", "Bannière 06.mp4"]);
    for (const [i, entry] of entries.entries()) {
      const out = join(dir, `zip-${i}.mp4`);
      writeFileSync(out, entry.data);
      const job = getJob(id);
      const [a, b] = frameRange(job.scan!.times, picked[i].start, picked[i].end);
      expect(await decodedFrames(out)).toBe(b - a);
    }
    expect(statSync(path).size).toBe(exp.size);
  });

  it("changer la sensibilité relance la détection sans relire la vidéo", () => {
    expect(setSensitivity(id, "high").sensitivity).toBe("high");
    expect(setSensitivity(id, "normal").segments).toHaveLength(6);
  });

  it("nomme les fichiers Bannière 01.mp4, Bannière 02.mp4…", () => {
    expect(bannerFileName(1)).toBe("Bannière 01.mp4");
    expect(bannerFileName(14)).toBe("Bannière 14.mp4");
  });
});

/** Lecteur ZIP minimal (répertoire central), indépendant du code testé. */
function readZip(buf: Buffer): { name: string; data: Buffer }[] {
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16);
  const out: { name: string; data: Buffer }[] = [];
  for (let i = 0; i < count; i++) {
    expect(buf.readUInt32LE(p)).toBe(0x02014b50);
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    const dataStart = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(dataStart, dataStart + size);
    out.push({ name, data: method === 0 ? raw : inflateRawSync(raw) });
    p += 46 + nameLen + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  return out;
}

describe("archive ZIP", () => {
  it("est lisible par un outil standard", async () => {
    const out = join(dir, "t.zip");
    await writeZip(out, [{ name: "Bannière 01.mp4", path: video("classique") }, { name: "a/b.json", path: join(dir, "classique.json") }]);
    const listing = execFileSync("python3", ["-c", "import sys,zipfile;z=zipfile.ZipFile(sys.argv[1]);print(z.testzip(), '|'.join(z.namelist()))", out]).toString().trim();
    expect(listing).toBe("None Bannière 01.mp4|a_b.json");
  });
});
