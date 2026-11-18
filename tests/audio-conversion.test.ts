import { afterAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Vérifie la conversion MP3 réelle (pas les arguments) quand un ffmpeg est disponible.
 * Le bug de production venait d'une piste dont le format changeait en cours de lecture :
 * on reproduit une piste 5.1 puis une piste volontairement corrompue.
 */
const require = createRequire(import.meta.url);
function findFfmpeg(): string | null {
  const env = process.env.FFMPEG_PATH;
  if (env && env !== "ffmpeg") return env;
  try {
    const mod = require("ffmpeg-static") as string | { default?: string } | null;
    return typeof mod === "string" ? mod : (mod?.default ?? null);
  } catch {
    return null;
  }
}

const ffmpeg = findFfmpeg();
const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

function makeSource(args: string[], name: string): string {
  const dir = mkdtempSync(join(tmpdir(), "tf-mp3-"));
  dirs.push(dir);
  const file = join(dir, name);
  execFileSync(ffmpeg!, ["-hide_banner", "-loglevel", "error", "-y", ...args, file]);
  return file;
}

describe.skipIf(!ffmpeg)("conversion MP3 réelle", () => {
  it("convertit une piste 5.1 en MP3 valide", async () => {
    process.env.FFMPEG_PATH = ffmpeg!;
    const { convertToMp3 } = await import("@/lib/media/ffmpeg");
    const dir = mkdtempSync(join(tmpdir(), "tf-out-"));
    dirs.push(dir);
    const src = makeSource(
      ["-f", "lavfi", "-i", "sine=frequency=440:duration=3", "-af", "pan=5.1|FL=c0|FR=c0|FC=c0|LFE=c0|BL=c0|BR=c0", "-c:a", "aac", "-b:a", "192k"],
      "surround.m4a",
    );
    const out = join(dir, "out.mp3");
    await convertToMp3(src, out, 192, dir);
    const buf = readFileSync(out);
    expect(buf.subarray(0, 3).toString("latin1")).toBe("ID3");
    expect(buf.length).toBeGreaterThan(20_000);
  }, 60_000);

  it("ignore une image audio corrompue au lieu d'échouer", async () => {
    process.env.FFMPEG_PATH = ffmpeg!;
    const { convertToMp3 } = await import("@/lib/media/ffmpeg");
    const clean = makeSource(["-f", "lavfi", "-i", "sine=frequency=440:duration=10", "-ac", "2", "-ar", "44100", "-c:a", "aac", "-f", "adts"], "clean.aac");
    const data = readFileSync(clean);
    const mid = Math.floor(data.length / 2);
    const dir = mkdtempSync(join(tmpdir(), "tf-brk-"));
    dirs.push(dir);
    const src = join(dir, "broken.aac");
    const broken = Buffer.from(data);
    broken.fill(0xff, mid, mid + 2000);
    require("node:fs").writeFileSync(src, broken);
    const out = join(dir, "out.mp3");
    await convertToMp3(src, out, 192, dir);
    const buf = readFileSync(out);
    expect(buf.subarray(0, 3).toString("latin1")).toBe("ID3");
    expect(buf.length).toBeGreaterThan(50_000);
  }, 60_000);
});
