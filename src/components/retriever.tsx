"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { AlertCircle, ArrowRight, Check, ClipboardPaste, Download, FileVideo, Link2, Loader2, Music, Play, RotateCcw, Upload, X } from "lucide-react";
import { clipboardFromApp, insideApp } from "@/lib/app-bridge";
import { DownloadError, requestFile, type DownloadPhase } from "@/lib/client-download";
import { availableTargets, MP3_BITRATES, type Mp4Target, type OutputFormat } from "@/lib/media/formats";
import { extractTikTokLink } from "@/lib/tiktok/url";
import type { BannerSet } from "@/lib/banners/types";
import type { AnalyzeResult, ApiErrorBody } from "@/lib/types";
import { cn, formatDuration, shortFileName } from "@/lib/utils";
import { useI18n } from "./i18n-provider";
import { Button } from "./ui/button";
import { Notice, Select } from "./ui/field";

// Le mode Bannières n'est chargé que lorsqu'un carrousel est demandé : la page d'accueil
// et le téléchargement de vidéos n'embarquent pas ce code.
const BannerGrid = dynamic(() => import("./banner-grid").then((m) => m.BannerGrid), { ssr: false });

type Source = { kind: "link"; data: AnalyzeResult } | { kind: "banners"; data: BannerSet } | { kind: "file"; file: File; previewUrl: string; shortSide?: number; duration?: number };
type Option = { id: string; label: string };
type Failure = { title: string; message: string };

const MAX_UPLOAD_MB = 200;
/** Vrai si le texte collé contient un lien TikTok, éventuellement entouré de texte. */
const looksLikeTikTok = (v: string) => /(^|\/\/|\.)tiktokv?\.com(\/|$)/i.test(v.trim());
/** Lien de publication photo : il ne peut contenir que des bannières, jamais une vidéo. */
const looksLikePhotoPost = (v: string) => /tiktok\.com\/(?:[a-z-]+\/)?(?:@[^/?#]*\/|share\/)?photo\/\d+/i.test(v);

/** Réponses du mode Bannières qui signifient seulement « ce lien n'est pas un carrousel ». */
const notBanners = new Set(["NOT_A_CAROUSEL", "NOT_A_POST", "NOT_TIKTOK", "INVALID_URL"]);

type ApiReply<T> = { ok: true; data: T } | { ok: false; error: ApiErrorBody["error"] | null };
async function postJson<T>(path: string, body: unknown, signal: AbortSignal): Promise<ApiReply<T>> {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  const json = (await res.json().catch(() => null)) as T | ApiErrorBody | null;
  if (!res.ok || !json || (typeof json === "object" && "error" in json)) return { ok: false, error: json && typeof json === "object" && "error" in json ? json.error : null };
  return { ok: true, data: json as T };
}

/** Champ principal : coller un lien lance aussitôt la récupération de la vidéo. */
export function Retriever() {
  const { t, apiMessage } = useI18n();
  const f = t.failures;
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState<false | "video" | "banners">(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [source, setSource] = useState<Source | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const request = useRef<AbortController | null>(null);

  useEffect(() => {
    // La fiche se place juste sous l'en-tête collant, jamais à cheval dessus.
    if (source) resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [source]);
  useEffect(() => () => request.current?.abort(), []);

  const reset = useCallback(() => {
    setSource((s) => {
      if (s?.kind === "file") URL.revokeObjectURL(s.previewUrl);
      return null;
    });
    setFailure(null);
  }, []);

  const retrieve = useCallback(
    async (raw: string) => {
      const value = raw.trim();
      request.current?.abort();
      reset();
      if (!value) {
        setFailure({ title: f.emptyTitle, message: f.empty });
        return;
      }
      const controller = new AbortController();
      request.current = controller;
      setLoading(looksLikePhotoPost(value) ? "banners" : "video");
      const fail = (err: ApiErrorBody["error"] | null, fallbackTitle: string) => setFailure({ title: (err && f.titles[err.code]) || fallbackTitle, message: apiMessage(err?.code, err?.message) ?? f.unexpected });
      try {
        // 1. Vidéo. Un lien « /photo/ » ne peut être qu'un carrousel : l'étape est sautée.
        const video = looksLikePhotoPost(value) ? null : await postJson<AnalyzeResult>("/api/resolve", { url: value }, controller.signal);
        if (video?.ok && video.data.linkDownload) {
          setSource({ kind: "link", data: video.data });
        } else if (video && !video.ok && video.error?.code !== "UNSUPPORTED_URL") {
          fail(video.error, f.videoFallback);
        } else {
          // 2. Bannières : carrousel de photos, ou publication sans flux vidéo.
          setLoading("banners");
          const banners = await postJson<BannerSet>("/api/banners", { url: video?.ok ? video.data.url : value }, controller.signal);
          if (banners.ok) {
            const { completeInBrowser } = await import("@/lib/banners/browser-clips");
            setSource({ kind: "banners", data: await completeInBrowser(banners.data, controller.signal) });
          }
          else if (video?.ok) setSource({ kind: "link", data: video.data });
          else if (video && (!banners.error || notBanners.has(banners.error.code))) fail(video.error, f.videoFallback);
          else fail(banners.error, f.bannersFallback);
        }
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setFailure({ title: f.offlineTitle, message: f.offline });
      }
      if (request.current === controller) setLoading(false);
    },
    [reset, f, apiMessage],
  );

  // Lien reçu à l'ouverture (« Partager → TokFlow » depuis l'application, ou adresse « /?lien=… ») : il est traité aussitôt.
  const sharedHandled = useRef(false);
  useEffect(() => {
    if (sharedHandled.current) return;
    sharedHandled.current = true;
    const params = new URLSearchParams(window.location.search);
    // « lien » est notre paramètre ; « url » couvre un envoi de formulaire avant que la page soit prête.
    const shared = (params.get("lien") ?? params.get("url"))?.trim();
    if (!shared) return;
    window.history.replaceState(null, "", window.location.pathname + window.location.hash);
    setUrl(shared);
    void retrieve(shared);
  }, [retrieve]);

  async function pasteFromClipboard() {
    try {
      const text = (insideApp() ? await clipboardFromApp() : await navigator.clipboard.readText()).trim();
      if (!text) return;
      setUrl(text);
      void retrieve(text);
    } catch {
      setFailure({ title: f.clipboardTitle, message: f.clipboard });
    }
  }

  /** Retour au champ : le visiteur enchaîne sur un autre lien sans chercher le formulaire. */
  const startOver = useCallback(() => {
    request.current?.abort();
    setLoading(false);
    setUrl("");
    reset();
    window.scrollTo({ top: 0, behavior: "smooth" });
    window.setTimeout(() => document.getElementById("tiktok-url")?.focus({ preventScroll: true }), 400);
  }, [reset]);

  function pickFile(file: File | undefined) {
    if (!file) return;
    request.current?.abort();
    setLoading(false);
    reset();
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      setFailure({ title: f.tooBigTitle, message: f.tooBig(MAX_UPLOAD_MB) });
      return;
    }
    setSource({ kind: "file", file, previewUrl: URL.createObjectURL(file) });
  }

  return (
    <div id="telecharger" className="mx-auto w-full max-w-2xl">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void retrieve(url);
        }}
        noValidate
        className="rounded-2xl border border-line bg-surface p-2 shadow-field transition-colors focus-within:border-brand/50"
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label htmlFor="tiktok-url" className="sr-only">
            {t.tool.label}
          </label>
          <div className="flex min-w-0 flex-1 items-center gap-2.5 pl-3.5">
            <Link2 className="h-4.5 w-4.5 shrink-0 text-muted" aria-hidden />
            <input
              id="tiktok-url"
              name="url"
              type="url"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              placeholder={t.tool.placeholder}
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                if (failure) setFailure(null);
              }}
              onPaste={(e) => {
                // Coller un lien TikTok suffit : la récupération démarre sans autre action.
                const text = e.clipboardData.getData("text").trim();
                if (looksLikeTikTok(text)) {
                  const link = extractTikTokLink(text);
                  e.preventDefault();
                  setUrl(link);
                  void retrieve(link);
                }
              }}
              aria-invalid={!!failure}
              aria-describedby={failure ? "retrieve-error" : undefined}
              className="h-12 min-w-0 flex-1 bg-transparent text-[15px] text-ink placeholder:text-muted/70 outline-none focus:outline-none focus-visible:outline-none"
            />
            {url ? (
              <button
                type="button"
                onClick={() => {
                  request.current?.abort();
                  setLoading(false);
                  setUrl("");
                  reset();
                }}
                aria-label={t.tool.clear}
                className="mr-1 flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-canvas hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            ) : (
              <button type="button" onClick={pasteFromClipboard} className="mr-1 flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-line px-2.5 text-xs font-medium text-ink transition-colors hover:bg-canvas">
                <ClipboardPaste className="h-3.5 w-3.5" aria-hidden />
                <span className="max-[359px]:sr-only">{t.tool.paste}</span>
              </button>
            )}
          </div>
          <Button type="submit" size="lg" disabled={!!loading} className="w-full sm:w-auto sm:min-w-[9.5rem]">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {loading ? t.tool.submitting : t.tool.submit}
            {!loading && <ArrowRight className="h-4 w-4" />}
          </Button>
        </div>
      </form>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[13px] text-muted">
        <span>{t.tool.haveFile}</span>
        <button type="button" onClick={() => fileInput.current?.click()} className="inline-flex min-h-8 cursor-pointer items-center gap-1.5 font-medium text-ink underline decoration-line underline-offset-4 transition-colors hover:decoration-ink">
          <Upload className="h-3.5 w-3.5" /> {t.tool.convertVideo}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="video/*,audio/*"
          className="hidden"
          data-testid="file-input"
          onChange={(e) => {
            pickFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>

      <div aria-live="polite" className="text-left">
        {failure && (
          <Notice id="retrieve-error" tone="danger" className="tf-rise mt-5" title={failure.title} icon={<AlertCircle className="h-4.5 w-4.5" />}>
            {failure.message}
            <span className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1.5 font-medium">
              {url.trim() && (
                <button type="button" onClick={() => void retrieve(url)} className="inline-flex cursor-pointer items-center gap-1.5 underline underline-offset-4">
                  <RotateCcw className="h-3.5 w-3.5" /> {t.common.retry}
                </button>
              )}
              <button type="button" onClick={() => fileInput.current?.click()} className="inline-flex cursor-pointer items-center gap-1.5 underline underline-offset-4">
                <Upload className="h-3.5 w-3.5" /> {t.tool.convertFile}
              </button>
              <Link href="/assistance" className="underline underline-offset-4">
                {t.common.report}
              </Link>
            </span>
          </Notice>
        )}
        {loading && <ResultSkeleton banners={loading === "banners"} />}
        {source && (
          <div ref={resultRef} className="tf-rise mt-6 scroll-mt-24">
            {source.kind === "banners" ? (
              <BannerGrid data={source.data} onReset={reset} onRetry={() => void retrieve(url)} />
            ) : source.kind === "link" ? (
              <LinkResult data={source.data} onReset={reset} onPickFile={() => fileInput.current?.click()} onNewVideo={startOver} />
            ) : (
              <FileResult source={source} onReset={reset} onMeta={(shortSide, duration) => setSource((s) => (s?.kind === "file" && s.shortSide === undefined ? { ...s, shortSide, duration } : s))} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Gabarit de résultat ---------- */

function ResultLayout({ media, expanded, badge, title, subtitle, meta, onReset, children }: {
  media: React.ReactNode;
  expanded?: boolean;
  badge: React.ReactNode;
  title: string;
  subtitle?: React.ReactNode;
  meta: { label: string; value?: string }[];
  onReset: () => void;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  const shown = meta.filter((m) => m.value);
  const metaRow = shown.length > 0 && (
    <dl className="flex gap-x-7 border-t border-line pt-4 text-xs">
      {shown.map((m) => (
        <div key={m.label}>
          <dt className="text-muted">{m.label}</dt>
          <dd className="mt-0.5 text-sm font-medium text-ink">{m.value}</dd>
        </div>
      ))}
    </dl>
  );
  return (
    <section aria-label={t.tool.result} data-testid="result" className="scroll-mt-24 rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-6">
      <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-x-4 gap-y-4 sm:grid-cols-[136px_minmax(0,1fr)] sm:gap-x-6">
        <div className={cn("relative aspect-[9/16] self-start overflow-hidden rounded-xl border border-line bg-panel", expanded && "col-span-2 mx-auto w-full max-w-[280px] sm:max-w-[300px]")}>{media}</div>
        <div className={cn("flex min-w-0 flex-col", expanded && "col-span-2 sm:col-span-1")}>
          <div className="flex items-start justify-between gap-2">
            <p className="inline-flex min-h-7 items-center gap-1.5 rounded-full bg-brand-soft px-2.5 py-1 text-xs font-medium leading-4 text-brand-dark">{badge}</p>
            <button type="button" onClick={onReset} aria-label={t.common.closeResult} className="-mr-1.5 -mt-1.5 flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-canvas hover:text-ink">
              <X className="h-4 w-4" />
            </button>
          </div>
          <h3 className="mt-2 line-clamp-2 text-[15px] font-semibold leading-6 text-ink sm:text-base" data-testid="result-title">
            {title}
          </h3>
          {subtitle && <p className="mt-0.5 truncate text-sm text-muted">{subtitle}</p>}
          {metaRow && <div className="mt-auto hidden pt-4 sm:block">{metaRow}</div>}
        </div>
        {metaRow && <div className="col-span-2 sm:hidden">{metaRow}</div>}
      </div>
      {children}
    </section>
  );
}

/* ---------- Résultat : lien ---------- */

function LinkResult({ data, onReset, onPickFile, onNewVideo }: { data: AnalyzeResult; onReset: () => void; onPickFile: () => void; onNewVideo: () => void }) {
  const { t, bytes } = useI18n();
  const [playing, setPlaying] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const [playerFailed, setPlayerFailed] = useState(false);
  const [thumbFailed, setThumbFailed] = useState(false);
  const videoOptions: Option[] = data.qualities.map((q, i) => ({
    id: q.id,
    // Taille annoncée par TikTok : elle peut différer de quelques pour cent du fichier final, d'où le « ≈ ».
    label: [i === 0 ? t.tool.best(q.label) : q.label, q.codec, q.sizeBytes ? t.tool.approx(bytes(q.sizeBytes)) : null].filter(Boolean).join(" · "),
  }));

  // La qualité la plus légère suffit pour un aperçu : l'image arrive tout de suite.
  const previewQuality = data.qualities[data.qualities.length - 1]?.id;
  const media = playing && previewQuality ? (
    // L'affiche reste visible pendant le démarrage du flux : plus de rectangle noir.
    <span className="relative block h-full w-full bg-black">
      <video
        src={`/api/preview?u=${encodeURIComponent(data.url)}&q=${encodeURIComponent(previewQuality)}`}
        poster={data.thumbnail}
        controls
        autoPlay
        loop
        playsInline
        preload="metadata"
        aria-label={t.tool.player}
        data-testid="player"
        className={cn("h-full w-full object-contain transition-opacity duration-300", playerReady ? "opacity-100" : "opacity-90")}
        onCanPlay={() => setPlayerReady(true)}
        onError={() => {
          setPlaying(false);
          setPlayerFailed(true);
        }}
      />
      {!playerReady && (
        <span className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/45 text-xs font-medium text-white">
          <Loader2 className="h-5 w-5 animate-spin" />
          {t.tool.playerLoading}
        </span>
      )}
    </span>
  ) : (
    <button type="button" onClick={() => setPlaying(true)} className="group absolute inset-0 cursor-pointer" aria-label={t.tool.play}>
      {data.thumbnail && !thumbFailed ? (
        // eslint-disable-next-line @next/next/no-img-element -- miniature distante servie par notre proxy
        <img src={data.thumbnail} alt={t.tool.thumbnail} decoding="async" className="h-full w-full object-cover" onError={() => setThumbFailed(true)} />
      ) : (
        <span className="flex h-full w-full bg-gradient-to-b from-panel-hover to-panel" />
      )}
      <span className="absolute inset-0 flex items-center justify-center bg-black/10 transition-colors group-hover:bg-black/25">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-[#202a26] shadow-card transition-transform group-hover:scale-105 sm:h-10 sm:w-10">
          <Play className="ml-0.5 h-4 w-4 fill-current" />
        </span>
      </span>
    </button>
  );

  return (
    <ResultLayout
      media={media}
      expanded={playing}
      onReset={onReset}
      badge={
        <>
          <Check className="h-3.5 w-3.5 shrink-0" /> {data.linkDownload ? t.tool.noWatermark : t.tool.found}
        </>
      }
      title={data.title || (data.username ? t.tool.videoOf(data.username) : t.tool.found)}
      subtitle={[data.authorName, data.username && `@${data.username}`].filter(Boolean).join(" · ")}
      meta={[
        { label: t.tool.duration, value: data.durationSeconds ? formatDuration(data.durationSeconds) : undefined },
        { label: t.tool.maxQuality, value: data.qualities[0]?.label },
        { label: t.tool.watermark, value: data.linkDownload ? t.tool.none : undefined },
      ]}
    >
      {playerFailed && (
        <Notice tone="warn" className="tf-rise mt-5" icon={<AlertCircle className="h-4.5 w-4.5" />}>
          {t.tool.playerUnavailable}{" "}
          <a href={data.url} target="_blank" rel="noreferrer noopener" className="font-medium underline underline-offset-4">
            {t.tool.watchOnTikTok}
          </a>
        </Notice>
      )}
      {data.linkDownload ? (
        <Exporter
          onNewVideo={onNewVideo}
          cleanSource
          videoOptions={videoOptions}
          run={(format, video, audio, onPhase, signal) =>
            requestFile(
              "/api/download",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                // Pour le son, le flux le plus léger suffit : la piste audio est la même.
                body: JSON.stringify(format === "mp4" ? { url: data.url, format, quality: video } : { url: data.url, format, quality: data.qualities[data.qualities.length - 1].id, bitrate: Number(audio) }),
              },
              onPhase,
              signal,
            )
          }
        />
      ) : (
        <div className="mt-5 border-t border-line pt-5">
          <Notice tone="warn" title={t.tool.cannotDownload} icon={<AlertCircle className="h-4.5 w-4.5" />}>
            {data.linkUnavailableReason}
          </Notice>
          <div className="mt-4 flex flex-col gap-2.5 sm:flex-row">
            <Button variant="secondary" size="lg" className="sm:flex-1" onClick={onPickFile}>
              <Upload className="h-4 w-4" /> {t.tool.convertMine}
            </Button>
            <Link href="/assistance" className="inline-flex h-12 items-center justify-center rounded-xl px-5 text-[15px] font-medium text-muted transition-colors hover:bg-ink/5 hover:text-ink">
              {t.common.report}
            </Link>
          </div>
        </div>
      )}
    </ResultLayout>
  );
}

/* ---------- Résultat : fichier local ---------- */

function FileResult({ source, onReset, onMeta }: { source: Extract<Source, { kind: "file" }>; onReset: () => void; onMeta: (shortSide: number | undefined, duration: number | undefined) => void }) {
  const { t, bytes } = useI18n();
  const { file } = source;
  const isAudio = file.type.startsWith("audio/");
  const videoOptions: Option[] = isAudio
    ? []
    : availableTargets(source.shortSide).map((target: Mp4Target) => (target === "source" ? { id: "source", label: t.tool.original(source.shortSide) } : { id: String(target), label: t.tool.reencode(String(target)) }));

  return (
    <ResultLayout
      onReset={onReset}
      media={
        isAudio ? (
          <span className="flex h-full w-full items-center justify-center">
            <Music className="h-6 w-6 text-white/40" />
          </span>
        ) : (
          <video
            src={source.previewUrl}
            muted
            playsInline
            disableRemotePlayback
            preload="metadata"
            className="h-full w-full object-contain"
            onLoadedMetadata={(e) => {
              const v = e.currentTarget;
              onMeta(v.videoWidth && v.videoHeight ? Math.min(v.videoWidth, v.videoHeight) : undefined, Number.isFinite(v.duration) ? v.duration : undefined);
            }}
          />
        )
      }
      badge={
        <>
          <FileVideo className="h-3.5 w-3.5 shrink-0" /> {t.tool.imported}
        </>
      }
      title={file.name}
      subtitle={t.tool.importedSub}
      meta={[
        { label: t.tool.size, value: bytes(file.size) },
        { label: t.tool.duration, value: source.duration ? formatDuration(source.duration) : undefined },
        { label: t.tool.definition, value: source.shortSide ? `${source.shortSide}p` : undefined },
      ]}
    >
      <Exporter
        videoOptions={videoOptions}
        run={(format, video, audio, onPhase, signal) => {
          const q = new URLSearchParams({ format, name: file.name });
          q.set(format === "mp4" ? "target" : "bitrate", format === "mp4" ? video : audio);
          return requestFile(`/api/convert?${q}`, { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: file }, onPhase, signal);
        }}
      />
    </ResultLayout>
  );
}

/* ---------- Les deux actions : vidéo et son ---------- */


function Exporter({ videoOptions, cleanSource = false, run, onNewVideo }: {
  videoOptions: Option[];
  /** Vrai lorsque la source est le flux d'origine TikTok, sans filigrane. */
  cleanSource?: boolean;
  run: (format: OutputFormat, video: string, audio: string, onPhase: (p: DownloadPhase) => void, signal: AbortSignal) => Promise<void>;
  /** Propose de repartir d'un nouveau lien une fois le fichier enregistré. */
  onNewVideo?: () => void;
}) {
  const { t, bytes, apiMessage } = useI18n();
  const audioOptions: Option[] = MP3_BITRATES.map((b) => ({ id: String(b), label: t.tool.bitrate(b) }));
  const [video, setVideo] = useState(videoOptions[0]?.id ?? "");
  const [audio, setAudio] = useState("192");
  const [active, setActive] = useState<OutputFormat | null>(null);
  const [phase, setPhase] = useState<DownloadPhase | null>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<{ format: OutputFormat; message: string; code?: string } | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => abort.current?.abort(), []);
  // Les qualités d'un fichier local ne sont connues qu'après lecture de ses métadonnées.
  const ids = videoOptions.map((o) => o.id).join(",");
  useEffect(() => {
    setVideo((c) => (ids.split(",").includes(c) ? c : (ids.split(",")[0] ?? "")));
  }, [ids]);

  const busy = phase?.state === "preparing" || phase?.state === "downloading";
  const hasVideo = videoOptions.length > 0;

  // Un échec doit être vu même si le visiteur a fait défiler la page.
  useEffect(() => {
    if (error || cancelled) statusRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [error, cancelled]);

  // Temps écoulé affiché pendant la préparation : le visiteur voit que le serveur travaille.
  useEffect(() => {
    if (!busy) return;
    const from = Date.now();
    setElapsed(0);
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - from) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [busy]);

  /** Annulation volontaire : l'utilisateur doit avoir un retour, pas un écran figé. */
  function cancel() {
    setCancelled(true);
    abort.current?.abort();
  }

  async function start(format: OutputFormat) {
    setError(null);
    setCancelled(false);
    setActive(format);
    abort.current = new AbortController();
    try {
      await run(format, video, audio, setPhase, abort.current.signal);
    } catch (e) {
      setPhase(null);
      if ((e as Error).name === "AbortError") return;
      setError({ format, message: (e instanceof DownloadError && apiMessage(e.code, e.message)) || t.common.downloadFailed, code: e instanceof DownloadError ? e.code : undefined });
    }
  }

  const pct = phase?.state === "downloading" && phase.total ? Math.min(100, Math.round((phase.received / phase.total) * 100)) : null;

  return (
    <div className="mt-5 border-t border-line pt-5">
      <div className={cn("grid gap-3", hasVideo && "sm:grid-cols-2")}>
        {hasVideo && (
          <div>
            <Button size="lg" className="h-14 w-full" onClick={() => start("mp4")} disabled={busy || !video} data-testid="download-video">
              <Download className="h-4.5 w-4.5" /> {t.tool.downloadVideo}
            </Button>
            <p className="mt-1.5 text-center text-xs text-muted">{cleanSource ? t.tool.videoHintClean : t.tool.videoHint}</p>
          </div>
        )}
        <div>
          <Button variant="dark" size="lg" className="h-14 w-full" onClick={() => start("mp3")} disabled={busy} data-testid="download-audio">
            <Music className="h-4.5 w-4.5" /> {t.tool.downloadAudio}
          </Button>
          <p className="mt-1.5 text-center text-xs text-muted">{t.tool.audioHint}</p>
        </div>
      </div>

      {/*
        Zone de statut : sa hauteur s'ouvre en douceur (classe tf-slot), donc les
        boutons et les sélecteurs ne sautent plus quand la progression apparaît.
      */}
      <div className="tf-slot" data-open={busy || !!phase || !!error || cancelled ? "true" : "false"}>
        <div>
          <div ref={statusRef} aria-live="polite" className="pt-4">
            {busy && (
              <div className="rounded-xl border border-line bg-canvas/60 p-4" data-testid="progress">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-medium text-ink">
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brand" />
                      {phase?.state === "preparing" ? (active === "mp3" ? t.tool.extracting : t.tool.preparing) : t.tool.downloading(pct !== null ? t.tool.percent(pct) : "")}
                    </p>
                    <p className="mt-1 pl-6 text-xs text-muted">
                      {phase?.state === "downloading" && phase.total ? t.tool.progressOf(bytes(phase.received), bytes(phase.total)) : t.tool.elapsed(elapsed)}
                    </p>
                  </div>
                  <button type="button" onClick={cancel} className="-my-2 -mr-1 flex min-h-11 shrink-0 cursor-pointer items-center rounded-lg px-2 text-xs font-medium text-muted transition-colors hover:bg-ink/5 hover:text-ink">
                    {t.tool.cancel}
                  </button>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ?? undefined} aria-label={t.tool.downloadVideo}>
                  {pct === null ? (
                    <div className="tf-indeterminate h-full w-1/3 rounded-full bg-brand" />
                  ) : (
                    <div className="h-full rounded-full bg-brand transition-[width] duration-200 ease-out" style={{ width: `${pct}%` }} />
                  )}
                </div>
              </div>
            )}
            {phase?.state === "saved" && (
              <Notice tone="success" className="tf-fade" icon={<Check className="tf-check h-4.5 w-4.5" />}>
                <span data-testid="saved" className="block">
                  <span className="break-words font-medium" title={phase.fileName}>
                    {shortFileName(phase.fileName)}
                  </span>
                  {t.tool.saved(bytes(phase.size))}
                </span>
                {onNewVideo && (
                  <button type="button" onClick={onNewVideo} className="mt-2 flex min-h-11 cursor-pointer items-center gap-1.5 font-medium underline underline-offset-4">
                    <RotateCcw className="h-3.5 w-3.5" /> {t.tool.newVideo}
                  </button>
                )}
              </Notice>
            )}
            {cancelled && !busy && (
              <Notice tone="info" className="tf-fade" icon={<AlertCircle className="h-4.5 w-4.5" />}>
                {t.tool.cancelled}
              </Notice>
            )}
            {error && (
              <Notice tone="danger" className="tf-fade" title={t.tool.failedTitle} icon={<AlertCircle className="h-4.5 w-4.5" />}>
                {error.message}
                <span className="mt-2 flex flex-wrap items-center gap-x-5">
                  <button type="button" onClick={() => start(error.format)} className="flex min-h-11 cursor-pointer items-center gap-1.5 font-medium underline underline-offset-4">
                    <RotateCcw className="h-3.5 w-3.5" /> {t.common.retry}
                  </button>
                  {/* Le son est inclus dans la vidéo : c'est la solution de repli quand la piste audio est particulière. */}
                  {error.code === "AUDIO_EXTRACTION_FAILED" && hasVideo && (
                    <button type="button" onClick={() => start("mp4")} className="flex min-h-11 cursor-pointer items-center gap-1.5 font-medium underline underline-offset-4">
                      <Download className="h-3.5 w-3.5" /> {t.tool.downloadVideo}
                    </button>
                  )}
                </span>
              </Notice>
            )}
          </div>
        </div>
      </div>

      <div className={cn("mt-5 grid gap-3", hasVideo && "sm:grid-cols-2")}>
        {hasVideo && (
          <div>
            <label htmlFor="video-quality" className="block text-xs font-medium text-muted">
              {t.tool.videoQuality}
            </label>
            <Select id="video-quality" value={video} onValueChange={setVideo} disabled={busy} className="mt-1.5 h-10 text-sm" options={videoOptions.map((o) => ({ value: o.id, label: o.label }))} />
          </div>
        )}
        <div>
          <label htmlFor="audio-quality" className="block text-xs font-medium text-muted">
            {t.tool.audioQuality}
          </label>
          <Select id="audio-quality" value={audio} onValueChange={setAudio} disabled={busy} className="mt-1.5 h-10 text-sm" options={audioOptions.map((o) => ({ value: o.id, label: o.label }))} />
        </div>
      </div>
      <p className="mt-4 text-center text-xs leading-5 text-muted">{t.common.rights}</p>
    </div>
  );
}

function ResultSkeleton({ banners }: { banners?: boolean }) {
  const { t } = useI18n();
  // Au-delà de quelques secondes, le visiteur sait que le site travaille encore.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div className="tf-rise mt-6 rounded-2xl border border-line bg-surface p-4 sm:p-6" data-testid="skeleton" aria-busy="true">
      <p className="mb-4 flex items-center gap-2 text-sm font-medium text-ink">
        <Loader2 className="h-4 w-4 animate-spin text-brand" /> {banners ? t.tool.loadingBanners : t.tool.loadingVideo}
      </p>
      {slow && <p className="mb-4 text-xs leading-5 text-muted">{t.tool.stillWorking}</p>}
      <div className="flex animate-pulse gap-4 sm:gap-6">
        <div className="aspect-[9/16] w-[88px] shrink-0 rounded-xl bg-canvas sm:w-[136px]" />
        <div className="flex-1 space-y-3 pt-1">
          <div className="h-6 w-28 rounded-full bg-canvas" />
          <div className="h-5 w-4/5 rounded bg-canvas" />
          <div className="h-4 w-2/5 rounded bg-canvas" />
        </div>
      </div>
      <div className="mt-5 grid animate-pulse gap-3 border-t border-line pt-5 sm:grid-cols-2">
        <div className="h-14 rounded-xl bg-canvas" />
        <div className="h-14 rounded-xl bg-canvas" />
      </div>
    </div>
  );
}
