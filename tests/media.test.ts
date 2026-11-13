import { beforeEach, describe, expect, it } from "vitest";
import { canCopyToM4a, m4aArgs, mp3Args } from "@/lib/media/audio";
import { parseProbe } from "@/lib/media/ffmpeg";
import { mp4Args } from "@/lib/media/video";
import { availableTargets, contentDisposition, isOutputFormat, parseMp4Target, safeFileName } from "@/lib/media/formats";
import { buildQualities, isWatermarked } from "@/lib/media/link-engine";
import { checkRateLimit, resetRateLimits } from "@/lib/rate-limit";

describe("buildQualities", () => {
  const formats = [
    { format_id: "audio", vcodec: "none" },
    { format_id: "download", width: 576, height: 1024, vcodec: "h264", format_note: "watermarked", tbr: 9999 },
    { format_id: "h264_540p_1-0", width: 576, height: 1024, vcodec: "h264", tbr: 900, filesize: 100 },
    { format_id: "h264_540p_2-0", width: 576, height: 1024, vcodec: "h264", tbr: 2200, filesize: 300 },
    { format_id: "bytevc1_540p_3-0", width: 576, height: 1024, vcodec: "h265", tbr: 5000 },
    { format_id: "bytevc1_720p_4-0", width: 720, height: 1280, vcodec: "h265", tbr: 1500 },
    { format_id: "bad id;rm", width: 720, height: 1280, vcodec: "h264", tbr: 1 },
  ];
  it("trie par définition, privilégie le H.264 et exclut le filigrane", () => {
    expect(buildQualities(formats)).toEqual([
      { id: "bytevc1_720p_4-0", label: "720p", codec: "HEVC", sizeBytes: undefined },
      { id: "h264_540p_2-0", label: "540p", codec: "H.264", sizeBytes: 300 },
    ]);
  });
  it("ne propose rien si seule la version avec filigrane existe", () => {
    expect(buildQualities([formats[1]])).toEqual([]);
    expect(isWatermarked(formats[1])).toBe(true);
    expect(isWatermarked(formats[2])).toBe(false);
  });
});

describe("ffmpeg", () => {
  it("analyse la sortie de ffmpeg -i", () => {
    const out = `Input #0, mov,mp4, from 'x':\n  Duration: 00:01:02.50, start: 0.0, bitrate: 1 kb/s\n  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(tv, bt709), 576x1024 [SAR 1:1], 900 kb/s, 30 fps, 30 tbr\n  Stream #0:1[0x2](und): Audio: aac (LC), 44100 Hz, stereo`;
    expect(parseProbe(out)).toEqual({ durationSeconds: 62.5, hasVideo: true, hasAudio: true, width: 576, height: 1024, fps: 30, videoCodec: "h264", audioCodec: "aac" });
    expect(parseProbe("Input #0, mp3\n Duration: 00:00:03.00\n Stream #0:0: Audio: mp3")).toMatchObject({ hasVideo: false, hasAudio: true });
  });
  it("construit des arguments sûrs", () => {
    expect(mp3Args("in", "out", 320)).toContain("320k");
    expect(mp4Args("in", "out", "source")).toEqual(expect.arrayContaining(["-c", "copy", "+faststart"]));
    expect(mp4Args("in", "out", 720).join(" ")).toContain("libx264");
  });
  it("M4A : copie le son d'origine s'il est déjà en AAC, sinon l'encode", () => {
    expect(canCopyToM4a({ audioCodec: "aac" })).toBe(true);
    expect(canCopyToM4a({ audioCodec: "mp3" })).toBe(false);
    expect(m4aArgs("in", "out", true)).toEqual(expect.arrayContaining(["-vn", "-c:a", "copy", "-f", "ipod"]));
    expect(m4aArgs("in", "out", false).join(" ")).toContain("-c:a aac -b:a 192k");
  });
  it("noms de fichiers accentués dans l'en-tête de téléchargement", () => {
    expect(contentDisposition("Bannière 01.mp4")).toBe(`attachment; filename="Banniere 01.mp4"; filename*=UTF-8''Banni%C3%A8re%2001.mp4`);
    expect(isOutputFormat("m4a")).toBe(true);
    expect(isOutputFormat("exe")).toBe(false);
  });
});

describe("formats", () => {
  it("ne propose jamais de suréchantillonnage", () => {
    expect(availableTargets(720)).toEqual(["source", 480]);
    expect(availableTargets(1080)).toEqual(["source", 720, 480]);
    expect(availableTargets(360)).toEqual(["source"]);
  });
  it("valide les cibles", () => {
    expect(parseMp4Target("720")).toBe(720);
    expect(parseMp4Target(null)).toBe("source");
    expect(parseMp4Target("999")).toBeNull();
  });
  it("assainit les noms de fichiers", () => {
    expect(safeFileName('../../é"vil\r\nname', "mp3")).toBe("e-vil-name.mp3");
    expect(safeFileName("", "mp4")).toBe("tokflow.mp4");
  });
});

describe("checkRateLimit", () => {
  beforeEach(resetRateLimits);
  it("bloque au-delà de la limite puis se réinitialise", () => {
    checkRateLimit("k", 2, 1000, 0);
    checkRateLimit("k", 2, 1000, 1);
    expect(() => checkRateLimit("k", 2, 1000, 2)).toThrowError(expect.objectContaining({ code: "RATE_LIMITED" }));
    expect(() => checkRateLimit("k", 2, 1000, 1001)).not.toThrow();
  });
});
