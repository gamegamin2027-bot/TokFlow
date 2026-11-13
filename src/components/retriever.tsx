"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowRight, Check, ClipboardPaste, FileVideo, Film, LayoutGrid, Link2, Loader2, Music, Play, RotateCcw, Sparkles, Upload, X } from "lucide-react";
import { useBannerJob, type BannerJobHandle } from "@/lib/client-banners";
import { requestFile } from "@/lib/client-download";
import { availableTargets, type Mp4Target } from "@/lib/media/formats";
import type { AnalyzeResult, ApiErrorBody } from "@/lib/types";
import { cn, formatBytes, formatDuration } from "@/lib/utils";
import { BannerPanel } from "./banner-panel";
import { AudioPanel, VideoPanel, type Option } from "./download-panel";
import { Button } from "./ui/button";
import { Notice } from "./ui/field";

/** Ce que l'utilisateur veut obtenir. « auto » : TokFlow regarde la vidéo et propose le mode adapté. */
export type Mode = "auto" | "video" | "audio" | "banners";
type Tab = Exclude<Mode, "auto">;

const modes: { id: Mode; label: string; hint: string; icon: React.ReactNode }[] = [
  { id: "auto", label: "Auto", hint: "TokFlow détecte s'il s'agit d'une vidéo classique ou d'une compilation de bannières.", icon: <Sparkles className="h-3.5 w-3.5" /> },
  { id: "video", label: "Vidéo", hint: "La vidéo complète, en MP4.", icon: <Film className="h-3.5 w-3.5" /> },
  { id: "audio", label: "Audio", hint: "Uniquement le son, en MP3 ou M4A.", icon: <Music className="h-3.5 w-3.5" /> },
  { id: "banners", label: "Bannières", hint: "Chaque séquence animée de la vidéo, en fichiers séparés.", icon: <LayoutGrid className="h-3.5 w-3.5" /> },
];

type Source = { kind: "link"; data: AnalyzeResult } | { kind: "file"; file: File; previewUrl: string; shortSide?: number; duration?: number };
type Failure = { title: string; message: string };

const MAX_UPLOAD_MB = 200;
const looksLikeTikTok = (v: string) => /(^|\/\/|\.)tiktok\.com\//i.test(v.trim());

const failureTitles: Record<string, string> = {
  VIDEO_DELETED: "Cette vidéo n'est plus disponible",
  VIDEO_PRIVATE: "Cette vidéo n'est pas publique",
  NOT_FOUND: "Vidéo introuvable",
  INVALID_URL: "Ce lien n'est pas valide",
  UNSUPPORTED_URL: "Ce lien n'est pas pris en charge",
  RATE_LIMITED: "Trop de demandes",
  UPSTREAM_ERROR: "TikTok est momentanément injoignable",
  TIMEOUT: "TikTok met trop de temps à répondre",
};

/** Champ principal : coller un lien lance aussitôt la récupération de la vidéo. */
export function Retriever() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [mode, setMode] = useState<Mode>("auto");
  const fileInput = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const request = useRef<AbortController | null>(null);

  useEffect(() => {
    if (source) resultRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
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
        setFailure({ title: "Aucun lien", message: "Collez le lien d'une vidéo TikTok dans le champ." });
        return;
      }
      const controller = new AbortController();
      request.current = controller;
      setLoading(true);
      try {
        const res = await fetch("/api/resolve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: value }), signal: controller.signal });
        const body = (await res.json().catch(() => null)) as AnalyzeResult | ApiErrorBody | null;
        if (!res.ok || !body || "error" in body) {
          const err = body && "error" in body ? body.error : null;
          setFailure({ title: (err && failureTitles[err.code]) || "La vidéo n'a pas pu être récupérée", message: err?.message ?? "Le serveur a répondu de façon inattendue. Réessayez dans un instant." });
        } else {
          setSource({ kind: "link", data: body });
        }
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setFailure({ title: "Connexion impossible", message: "Le serveur est injoignable. Vérifiez votre connexion Internet, puis réessayez." });
      }
      if (request.current === controller) setLoading(false);
    },
    [reset],
  );

  async function pasteFromClipboard() {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (!text) return;
      setUrl(text);
      void retrieve(text);
    } catch {
      setFailure({ title: "Presse-papiers inaccessible", message: "Votre navigateur n'autorise pas la lecture du presse-papiers. Collez le lien directement dans le champ." });
    }
  }

  function pickFile(file: File | undefined) {
    if (!file) return;
    request.current?.abort();
    setLoading(false);
    reset();
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      setFailure({ title: "Fichier trop volumineux", message: `La taille maximale est de ${MAX_UPLOAD_MB} Mo.` });
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
        className="rounded-2xl border border-line bg-white p-2 shadow-field transition-colors focus-within:border-brand/50"
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label htmlFor="tiktok-url" className="sr-only">
            Lien de la vidéo TikTok
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
              placeholder="Collez un lien TikTok…"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                if (failure) setFailure(null);
              }}
              onPaste={(e) => {
                // Coller un lien TikTok suffit : la récupération démarre sans autre action.
                const text = e.clipboardData.getData("text").trim();
                if (looksLikeTikTok(text)) {
                  e.preventDefault();
                  setUrl(text);
                  void retrieve(text);
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
                aria-label="Effacer le lien"
                className="mr-1 flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-canvas hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            ) : (
              <button type="button" onClick={pasteFromClipboard} className="mr-1 flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-line px-2.5 text-xs font-medium text-ink transition-colors hover:bg-canvas">
                <ClipboardPaste className="h-3.5 w-3.5" aria-hidden />
                <span className="max-[359px]:sr-only">Coller</span>
              </button>
            )}
          </div>
          <Button type="submit" size="lg" disabled={loading} className="w-full sm:w-auto sm:min-w-[9.5rem]">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {loading ? "Récupération…" : "Récupérer"}
            {!loading && <ArrowRight className="h-4 w-4" />}
          </Button>
        </div>
      </form>

      <div className="mt-3.5">
        <div role="radiogroup" aria-label="Mode de récupération" className="mx-auto grid w-full max-w-md grid-cols-4 gap-1 rounded-xl border border-line bg-white/70 p-1">
          {modes.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={mode === m.id}
              onClick={() => setMode(m.id)}
              className={cn(
                "flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-[13px] font-medium transition-colors",
                mode === m.id ? "bg-ink text-white" : "text-muted hover:bg-canvas hover:text-ink",
              )}
            >
              <span className="max-[380px]:hidden">{m.icon}</span>
              {m.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-center text-[13px] leading-5 text-muted" data-testid="mode-hint">
          {modes.find((m) => m.id === mode)?.hint}
        </p>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[13px] text-muted">
        <span>Vous avez déjà le fichier ?</span>
        <button type="button" onClick={() => fileInput.current?.click()} className="inline-flex min-h-8 cursor-pointer items-center gap-1.5 font-medium text-ink underline decoration-line underline-offset-4 transition-colors hover:decoration-ink">
          <Upload className="h-3.5 w-3.5" /> Utiliser un fichier vidéo
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
                  <RotateCcw className="h-3.5 w-3.5" /> Réessayer
                </button>
              )}
              <button type="button" onClick={() => fileInput.current?.click()} className="inline-flex cursor-pointer items-center gap-1.5 underline underline-offset-4">
                <Upload className="h-3.5 w-3.5" /> Convertir un fichier
              </button>
              <Link href="/assistance" className="underline underline-offset-4">
                Signaler le problème
              </Link>
            </span>
          </Notice>
        )}
        {loading && <ResultSkeleton />}
        {source && (
          <div ref={resultRef} className="tf-rise mt-6 scroll-mt-24">
            {source.kind === "link" ? (
              <LinkResult key={source.data.id} mode={mode} data={source.data} onReset={reset} onPickFile={() => fileInput.current?.click()} />
            ) : (
              <FileResult mode={mode} source={source} onReset={reset} onMeta={(shortSide, duration) => setSource((s) => (s?.kind === "file" && s.shortSide === undefined ? { ...s, shortSide, duration } : s))} />
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
    <section aria-label="Résultat" data-testid="result" className="rounded-2xl border border-line bg-white p-4 shadow-card sm:p-6">
      <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-x-4 gap-y-4 sm:grid-cols-[136px_minmax(0,1fr)] sm:gap-x-6">
        <div className={cn("relative aspect-[9/16] self-start overflow-hidden rounded-xl border border-line bg-ink", expanded && "col-span-2 mx-auto w-60 sm:col-span-1 sm:w-auto")}>{media}</div>
        <div className={cn("flex min-w-0 flex-col", expanded && "col-span-2 sm:col-span-1")}>
          <div className="flex items-start justify-between gap-2">
            <p className="inline-flex min-h-7 items-center gap-1.5 rounded-full bg-brand-soft px-2.5 py-1 text-xs font-medium leading-4 text-brand-dark">{badge}</p>
            <button type="button" onClick={onReset} aria-label="Fermer le résultat" className="-mr-1.5 -mt-1.5 flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-canvas hover:text-ink">
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

function LinkResult({ data, mode, onReset, onPickFile }: { data: AnalyzeResult; mode: Mode; onReset: () => void; onPickFile: () => void }) {
  const [playing, setPlaying] = useState(false);
  // L'analyse des bannières travaille sur la meilleure qualité disponible.
  const banners = useBannerJob((signal) => fetch("/api/banners", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: data.url, quality: data.qualities[0]?.id }), signal }));
  const download = (body: Record<string, unknown>): Parameters<typeof requestFile>[1] => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: data.url, ...body }) });
  // Pour le son, le flux le plus léger suffit : la piste audio est la même.
  const lightest = data.qualities[data.qualities.length - 1]?.id;
  const videoOptions: Option[] = data.qualities.map((q, i) => ({
    id: q.id,
    label: [i === 0 ? `${q.label} (meilleure)` : q.label, q.codec, q.sizeBytes ? formatBytes(q.sizeBytes) : null].filter(Boolean).join(" · "),
  }));

  const media = playing ? (
    <iframe src={data.playerUrl} title="Lecteur vidéo" allow="fullscreen; encrypted-media" className="h-full w-full" />
  ) : (
    <button type="button" onClick={() => setPlaying(true)} className="group absolute inset-0 cursor-pointer" aria-label="Lire la vidéo">
      {data.thumbnail ? (
        // eslint-disable-next-line @next/next/no-img-element -- miniature distante servie par notre proxy
        <img src={data.thumbnail} alt="Miniature de la vidéo" className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full bg-gradient-to-b from-[#2a3631] to-ink" />
      )}
      <span className="absolute inset-0 flex items-center justify-center bg-ink/10 transition-colors group-hover:bg-ink/25">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-ink shadow-card transition-transform group-hover:scale-105 sm:h-10 sm:w-10">
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
          <Check className="h-3.5 w-3.5 shrink-0" /> {data.linkDownload ? "Sans filigrane" : "Vidéo trouvée"}
        </>
      }
      title={data.title || `Vidéo de @${data.username}`}
      subtitle={`${data.authorName ? `${data.authorName} · ` : ""}@${data.username}`}
      meta={[
        { label: "Durée", value: data.durationSeconds ? formatDuration(data.durationSeconds) : undefined },
        { label: "Qualité max.", value: data.qualities[0]?.label },
        { label: "Filigrane", value: data.linkDownload ? "Aucun" : undefined },
      ]}
    >
      {data.linkDownload ? (
        <ModePanels
          mode={mode}
          autoAnalyse
          banners={banners}
          video={<VideoPanel cleanSource options={videoOptions} run={(quality, onPhase, signal) => requestFile("/api/download", download({ format: "mp4", quality }), onPhase, signal)} />}
          audio={<AudioPanel run={(format, bitrate, onPhase, signal) => requestFile("/api/download", download({ format, quality: lightest, bitrate: Number(bitrate) }), onPhase, signal)} />}
        />
      ) : (
        <div className="mt-5 border-t border-line pt-5">
          <Notice tone="warn" title="Cette vidéo ne peut pas être téléchargée pour le moment" icon={<AlertCircle className="h-4.5 w-4.5" />}>
            {data.linkUnavailableReason}
          </Notice>
          <div className="mt-4 flex flex-col gap-2.5 sm:flex-row">
            <Button variant="secondary" size="lg" className="sm:flex-1" onClick={onPickFile}>
              <Upload className="h-4 w-4" /> Convertir un fichier de mon appareil
            </Button>
            <Link href="/assistance" className="inline-flex h-12 items-center justify-center rounded-xl px-5 text-[15px] font-medium text-muted transition-colors hover:bg-ink/5 hover:text-ink">
              Signaler le problème
            </Link>
          </div>
        </div>
      )}
    </ResultLayout>
  );
}

/* ---------- Résultat : fichier local ---------- */

function FileResult({ source, mode, onReset, onMeta }: { source: Extract<Source, { kind: "file" }>; mode: Mode; onReset: () => void; onMeta: (shortSide: number | undefined, duration: number | undefined) => void }) {
  const { file } = source;
  const banners = useBannerJob((signal) => fetch(`/api/banners?${new URLSearchParams({ name: file.name })}`, { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: file, signal }));
  const convert = (q: Record<string, string>): [string, RequestInit] => [`/api/convert?${new URLSearchParams({ ...q, name: file.name })}`, { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: file }];
  const isAudio = file.type.startsWith("audio/");
  const videoOptions: Option[] = isAudio
    ? []
    : availableTargets(source.shortSide).map((t: Mp4Target) => (t === "source" ? { id: "source", label: source.shortSide ? `Originale · ${source.shortSide}p · sans ré-encodage` : "Originale · sans ré-encodage" } : { id: String(t), label: `${t}p · ré-encodage H.264` }));

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
          <FileVideo className="h-3.5 w-3.5 shrink-0" /> Fichier importé
        </>
      }
      title={file.name}
      subtitle="Converti à l'identique, image non retouchée"
      meta={[
        { label: "Taille", value: formatBytes(file.size) },
        { label: "Durée", value: source.duration ? formatDuration(source.duration) : undefined },
        { label: "Définition", value: source.shortSide ? `${source.shortSide}p` : undefined },
      ]}
    >
      <ModePanels
        mode={mode}
        banners={isAudio ? undefined : banners}
        bannerIntro="Le fichier est envoyé au serveur pour être analysé, puis supprimé après 20 minutes d'inactivité."
        video={isAudio ? undefined : <VideoPanel options={videoOptions} run={(quality, onPhase, signal) => requestFile(...convert({ format: "mp4", target: quality }), onPhase, signal)} />}
        audio={<AudioPanel run={(format, bitrate, onPhase, signal) => requestFile(...convert({ format, bitrate }), onPhase, signal)} />}
      />
    </ResultLayout>
  );
}

/* ---------- Les trois modes : vidéo, audio, bannières ---------- */

const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "video", label: "Vidéo", icon: <Film className="h-4 w-4" /> },
  { id: "audio", label: "Audio", icon: <Music className="h-4 w-4" /> },
  { id: "banners", label: "Bannières", icon: <LayoutGrid className="h-4 w-4" /> },
];

function ModePanels({ mode, video, audio, banners, bannerIntro, autoAnalyse = false }: {
  mode: Mode;
  video?: React.ReactNode;
  audio: React.ReactNode;
  /** Absent quand la source n'a pas d'image (fichier audio). */
  banners?: BannerJobHandle;
  bannerIntro?: string;
  /** En mode Auto, lancer l'analyse des bannières sans attendre (liens uniquement). */
  autoAnalyse?: boolean;
}) {
  const available = (t: Tab) => (t === "video" ? !!video : t === "banners" ? !!banners : true);
  const preferred = (m: Mode): Tab => (m !== "auto" && available(m) ? m : video ? "video" : "audio");
  const [tab, setTab] = useState<Tab>(() => preferred(mode));
  /** L'utilisateur a choisi lui-même un onglet : le mode Auto ne le déplace plus. */
  const chosen = useRef(false);
  const state = banners?.state;
  const start = banners?.start;

  // Changer de mode au-dessus du champ ouvre l'onglet correspondant.
  const firstMode = useRef(true);
  useEffect(() => {
    if (firstMode.current) {
      firstMode.current = false;
      return;
    }
    chosen.current = false;
    setTab(preferred(mode));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ne réagit qu'au changement de mode
  }, [mode]);

  // L'analyse démarre dès qu'elle est utile : onglet Bannières ouvert, ou mode Auto sur un lien.
  const wanted = !!banners && (tab === "banners" || (mode === "auto" && autoAnalyse));
  useEffect(() => {
    if (wanted && state?.phase === "idle") void start?.();
  }, [wanted, state?.phase, start]);

  // Mode Auto : si la vidéo est une compilation de bannières, on ouvre l'onglet Bannières.
  const verdict = state?.phase === "ready" ? state.job.verdict : undefined;
  useEffect(() => {
    if (mode === "auto" && verdict === "banners" && !chosen.current) setTab("banners");
  }, [mode, verdict]);

  const found = state?.phase === "ready" ? state.job.segments.length : 0;
  const analysing = state?.phase === "starting" || state?.phase === "running";

  return (
    <div className="mt-5 border-t border-line pt-5">
      <div role="tablist" aria-label="Que voulez-vous récupérer ?" className="grid grid-cols-3 gap-1 rounded-xl bg-canvas p-1">
        {tabs.map((t) => {
          const ok = available(t.id);
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`panel-${t.id}`}
              disabled={!ok}
              title={ok ? undefined : "Indisponible pour un fichier audio"}
              onClick={() => {
                chosen.current = true;
                setTab(t.id);
              }}
              className={cn(
                "flex h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45",
                tab === t.id ? "bg-white text-ink shadow-[0_1px_2px_rgb(32_42_38/0.12)]" : "text-muted hover:text-ink",
              )}
            >
              <span className="max-[359px]:hidden">{t.icon}</span>
              {t.label}
              {t.id === "banners" && analysing && tab !== "banners" && <Loader2 className="h-3.5 w-3.5 animate-spin text-brand" aria-label="Analyse en cours" />}
              {t.id === "banners" && found > 1 && (
                <span className="rounded-full bg-brand px-1.5 text-[11px] font-semibold leading-[18px] text-white" data-testid="banner-badge">
                  {found}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {mode === "auto" && verdict === "banners" && tab === "banners" && !chosen.current && (
        <p className="mt-3 text-[13px] leading-5 text-muted" data-testid="auto-note">
          Mode Auto : cette vidéo contient plusieurs séquences, l&apos;onglet Bannières a été ouvert. La vidéo complète et le son restent disponibles dans les autres onglets.
        </p>
      )}
      {video && (
        <div role="tabpanel" id="panel-video" aria-labelledby="tab-video" hidden={tab !== "video"} className="mt-4">
          {video}
        </div>
      )}
      <div role="tabpanel" id="panel-audio" aria-labelledby="tab-audio" hidden={tab !== "audio"} className="mt-4">
        {audio}
      </div>
      {banners && (
        <div role="tabpanel" id="panel-banners" aria-labelledby="tab-banners" hidden={tab !== "banners"} className="mt-4">
          <BannerPanel handle={banners} intro={bannerIntro} />
        </div>
      )}
    </div>
  );
}

function ResultSkeleton() {
  return (
    <div className="tf-rise mt-6 rounded-2xl border border-line bg-white p-4 sm:p-6" data-testid="skeleton">
      <p className="mb-4 flex items-center gap-2 text-sm font-medium text-ink">
        <Loader2 className="h-4 w-4 animate-spin text-brand" /> Récupération de la vidéo…
      </p>
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
