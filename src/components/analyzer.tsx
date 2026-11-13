"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowRight, Check, ClipboardPaste, Download, ExternalLink, FileVideo, Film, Link2, Loader2, Music, Play, RotateCcw, Upload, X } from "lucide-react";
import { DownloadError, requestFile, type DownloadPhase } from "@/lib/client-download";
import { availableTargets, MP3_BITRATES, type Mp4Target, type OutputFormat } from "@/lib/media/formats";
import type { AnalyzeResult, ApiErrorBody } from "@/lib/types";
import { cn, formatBytes, formatDuration } from "@/lib/utils";
import { Button, buttonClass } from "./ui/button";

type Source = { kind: "link"; data: AnalyzeResult } | { kind: "file"; file: File; previewUrl: string; shortSide?: number; duration?: number };
type Option = { id: string; label: string; hint?: string };

const MAX_UPLOAD_MB = 200;

export function Analyzer() {
  const [url, setUrl] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<Source | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (source) resultRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [source]);

  const reset = useCallback(() => {
    setSource((s) => {
      if (s?.kind === "file") URL.revokeObjectURL(s.previewUrl);
      return null;
    });
    setError(null);
  }, []);

  async function analyze(e: React.FormEvent) {
    e.preventDefault();
    const value = url.trim();
    if (!value) {
      setError("Collez d'abord le lien d'une vidéo TikTok.");
      return;
    }
    reset();
    setAnalyzing(true);
    try {
      const res = await fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: value }) });
      const body = (await res.json().catch(() => null)) as AnalyzeResult | ApiErrorBody | null;
      if (!res.ok || !body || "error" in body) {
        setError((body && "error" in body && body.error.message) || "L'analyse a échoué. Réessayez dans un instant.");
        return;
      }
      setSource({ kind: "link", data: body });
    } catch {
      setError("Connexion au serveur impossible. Vérifiez votre réseau et réessayez.");
    } finally {
      setAnalyzing(false);
    }
  }

  async function paste() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setUrl(text.trim());
        setError(null);
      }
    } catch {
      setError("Votre navigateur n'autorise pas la lecture du presse-papiers. Collez le lien manuellement.");
    }
  }

  function pickFile(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      setError(`Ce fichier dépasse la taille maximale de ${MAX_UPLOAD_MB} Mo.`);
      return;
    }
    reset();
    setSource({ kind: "file", file, previewUrl: URL.createObjectURL(file) });
  }

  return (
    <div id="analyser" className="mx-auto w-full max-w-2xl">
      <form onSubmit={analyze} noValidate className="rounded-2xl border border-line bg-white p-2 shadow-field transition-shadow focus-within:border-brand/50">
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
              placeholder="https://www.tiktok.com/@compte/video/…"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                if (error) setError(null);
              }}
              aria-invalid={!!error}
              aria-describedby={error ? "analyze-error" : undefined}
              className="h-12 min-w-0 flex-1 bg-transparent text-[15px] text-ink placeholder:text-muted/70 focus:outline-none"
            />
            {url ? (
              <button type="button" onClick={() => setUrl("")} aria-label="Effacer le lien" className="mr-1 flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted hover:bg-canvas hover:text-ink">
                <X className="h-4 w-4" />
              </button>
            ) : (
              <button type="button" onClick={paste} className="mr-1 hidden h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-muted hover:bg-canvas hover:text-ink sm:flex">
                <ClipboardPaste className="h-3.5 w-3.5" /> Coller
              </button>
            )}
          </div>
          <Button type="submit" size="lg" disabled={analyzing} className="w-full sm:w-auto">
            {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {analyzing ? "Analyse en cours…" : "Analyser le lien"}
            {!analyzing && <ArrowRight className="h-4 w-4" />}
          </Button>
        </div>
      </form>

      <div className="mt-3 flex flex-col items-center justify-between gap-1.5 px-1 text-xs text-muted sm:flex-row">
        <span>Vidéos publiques · sans filigrane · MP4 ou MP3</span>
        <button type="button" onClick={() => fileInput.current?.click()} className="inline-flex cursor-pointer items-center gap-1.5 font-medium text-ink underline-offset-4 hover:underline">
          <Upload className="h-3.5 w-3.5" /> Convertir un fichier vidéo
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
        {error && (
          <Alert id="analyze-error" tone="danger" className="mt-5" title="Impossible de traiter ce lien">
            {error}
            <button type="button" onClick={() => fileInput.current?.click()} className="mt-2 flex cursor-pointer items-center gap-1.5 font-medium underline underline-offset-4">
              <Upload className="h-3.5 w-3.5" /> Alternative : convertir un fichier de mon appareil
            </button>
          </Alert>
        )}
        {analyzing && <ResultSkeleton />}
        {source && (
          <div ref={resultRef} className="tf-rise mt-6 scroll-mt-24">
            {source.kind === "link" ? (
              <LinkResult data={source.data} onReset={reset} onPickFile={() => fileInput.current?.click()} />
            ) : (
              <FileResult
                source={source}
                onReset={reset}
                onMeta={(shortSide, duration) => setSource((s) => (s?.kind === "file" && s.shortSide === undefined ? { ...s, shortSide, duration } : s))}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Résultat : lien ---------- */

function LinkResult({ data, onReset, onPickFile }: { data: AnalyzeResult; onReset: () => void; onPickFile: () => void }) {
  const [playing, setPlaying] = useState(false);
  const videoOptions: Option[] = data.qualities.map((q, i) => ({
    id: q.id,
    label: i === 0 ? `${q.label} · Meilleure` : q.label,
    hint: [q.codec, q.sizeBytes ? formatBytes(q.sizeBytes) : null].filter(Boolean).join(" · "),
  }));

  return (
    <Card>
      <div className="flex flex-col gap-5 sm:flex-row sm:gap-6">
        <div className="relative mx-auto aspect-[9/16] w-40 shrink-0 overflow-hidden rounded-xl border border-line bg-ink sm:mx-0 sm:w-44">
          {playing ? (
            <iframe src={data.playerUrl} title="Lecteur TikTok officiel" allow="fullscreen; encrypted-media" className="h-full w-full" />
          ) : (
            <button type="button" onClick={() => setPlaying(true)} className="group absolute inset-0 cursor-pointer" aria-label="Lire l'aperçu dans le lecteur TikTok officiel">
              {data.thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element -- miniature distante servie par notre proxy
                <img src={data.thumbnail} alt="Miniature de la vidéo" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center bg-gradient-to-b from-[#2a3631] to-ink">
                  <Film className="h-7 w-7 text-white/30" />
                </span>
              )}
              <span className="absolute inset-0 flex items-center justify-center bg-ink/10 transition-colors group-hover:bg-ink/25">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/95 text-ink shadow-card">
                  <Play className="ml-0.5 h-4.5 w-4.5 fill-current" />
                </span>
              </span>
              {data.durationSeconds ? <span className="absolute bottom-2 right-2 rounded-md bg-ink/80 px-1.5 py-0.5 font-mono text-[11px] text-white">{formatDuration(data.durationSeconds)}</span> : null}
            </button>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand-dark">
                <Check className="h-3.5 w-3.5" /> {data.linkDownload ? "Disponible sans filigrane" : "Lien analysé"}
              </p>
              <h3 className="mt-3 line-clamp-2 text-base font-semibold leading-6 text-ink" data-testid="result-title">
                {data.title || `Vidéo de @${data.username}`}
              </h3>
              <p className="mt-1 truncate text-sm text-muted">
                {data.authorName ? `${data.authorName} · ` : ""}@{data.username}
              </p>
            </div>
            <button type="button" onClick={onReset} aria-label="Fermer le résultat" className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted hover:bg-canvas hover:text-ink">
              <X className="h-4 w-4" />
            </button>
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-line pt-4 text-xs sm:grid-cols-3">
            <Info label="Durée" value={data.durationSeconds ? formatDuration(data.durationSeconds) : "—"} />
            <Info label="Qualité max." value={data.qualities[0]?.label ?? "—"} />
            <Info label="Filigrane" value={data.linkDownload ? "Aucun" : "—"} />
          </dl>

          <a href={data.url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-brand hover:underline">
            Voir sur TikTok <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>

      {data.linkDownload ? (
        <Exporter
          cleanSource
          videoOptions={videoOptions}
          run={(format, option, onPhase, signal) =>
            requestFile(
              "/api/download",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                // Pour le MP3, le flux le plus léger suffit : la piste audio est la même.
                body: JSON.stringify(format === "mp4" ? { url: data.url, format, quality: option } : { url: data.url, format, quality: data.qualities[data.qualities.length - 1].id, bitrate: Number(option) }),
              },
              onPhase,
              signal,
            )
          }
          onPickFile={onPickFile}
        />
      ) : (
        <div className="mt-6 border-t border-line pt-6">
          <Alert tone="warn" title="Téléchargement direct indisponible pour ce lien">
            {data.linkUnavailableReason}
          </Alert>
          <p className="mt-4 text-sm font-medium text-ink">Alternatives</p>
          <div className="mt-3 flex flex-col gap-2.5 sm:flex-row">
            <Button variant="secondary" onClick={onPickFile}>
              <Upload className="h-4 w-4" /> Convertir un fichier de mon appareil
            </Button>
            <a href={data.url} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary")}>
              <ExternalLink className="h-4 w-4" /> Ouvrir sur TikTok
            </a>
          </div>
          <p className="mt-3 text-xs leading-5 text-muted">
            Si le créateur l'autorise, l'application TikTok propose « Enregistrer la vidéo » depuis le menu Partager. Importez ensuite le fichier ici pour le convertir en MP3 ou l'alléger. Attention : un fichier enregistré depuis l'application contient le filigrane TikTok, et TokFlow ne le retire pas.
          </p>
        </div>
      )}
    </Card>
  );
}

/* ---------- Résultat : fichier local ---------- */

function FileResult({ source, onReset, onMeta }: { source: Extract<Source, { kind: "file" }>; onReset: () => void; onMeta: (shortSide: number | undefined, duration: number | undefined) => void }) {
  const { file } = source;
  const isAudio = file.type.startsWith("audio/");
  const videoOptions: Option[] = isAudio
    ? []
    : availableTargets(source.shortSide).map((t: Mp4Target) =>
        t === "source" ? { id: "source", label: source.shortSide ? `Originale · ${source.shortSide}p` : "Originale", hint: "Sans ré-encodage" } : { id: String(t), label: `${t}p`, hint: "Ré-encodage H.264" },
      );

  return (
    <Card>
      <div className="flex flex-col gap-5 sm:flex-row sm:gap-6">
        <div className="relative mx-auto aspect-[9/16] w-40 shrink-0 overflow-hidden rounded-xl border border-line bg-ink sm:mx-0 sm:w-44">
          {isAudio ? (
            <span className="flex h-full w-full items-center justify-center">
              <Music className="h-7 w-7 text-white/40" />
            </span>
          ) : (
            <video
              src={source.previewUrl}
              controls
              muted
              playsInline
              preload="metadata"
              className="h-full w-full object-contain"
              onLoadedMetadata={(e) => {
                const v = e.currentTarget;
                onMeta(v.videoWidth && v.videoHeight ? Math.min(v.videoWidth, v.videoHeight) : undefined, Number.isFinite(v.duration) ? v.duration : undefined);
              }}
            />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand-dark">
                <FileVideo className="h-3.5 w-3.5" /> Fichier importé
              </p>
              <h3 className="mt-3 truncate text-base font-semibold text-ink" data-testid="result-title">
                {file.name}
              </h3>
              <p className="mt-1 text-sm text-muted">Conversion à l'identique : l'image n'est pas retouchée. Si le fichier contient un filigrane, il est conservé.</p>
            </div>
            <button type="button" onClick={onReset} aria-label="Fermer le résultat" className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted hover:bg-canvas hover:text-ink">
              <X className="h-4 w-4" />
            </button>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-line pt-4 text-xs sm:grid-cols-3">
            <Info label="Taille" value={formatBytes(file.size)} />
            <Info label="Durée" value={source.duration ? formatDuration(source.duration) : "—"} />
            <Info label="Définition" value={source.shortSide ? `${source.shortSide}p` : "—"} />
          </dl>
        </div>
      </div>
      <Exporter
        videoOptions={videoOptions}
        initialFormat={isAudio ? "mp3" : "mp4"}
        run={(format, option, onPhase, signal) => {
          const q = new URLSearchParams({ format, name: file.name });
          q.set(format === "mp4" ? "target" : "bitrate", option);
          return requestFile(`/api/convert?${q}`, { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: file }, onPhase, signal);
        }}
      />
    </Card>
  );
}

/* ---------- Choix du format + téléchargement ---------- */

const audioOptions: Option[] = MP3_BITRATES.map((b) => ({ id: String(b), label: `${b} kbps`, hint: b === 320 ? "Qualité maximale" : b === 192 ? "Équilibré" : "Fichier léger" }));

function Exporter({
  videoOptions,
  initialFormat = "mp4",
  cleanSource = false,
  run,
  onPickFile,
}: {
  videoOptions: Option[];
  initialFormat?: OutputFormat;
  /** Vrai lorsque la source est le flux d'origine TikTok, sans filigrane. */
  cleanSource?: boolean;
  run: (format: OutputFormat, option: string, onPhase: (p: DownloadPhase) => void, signal: AbortSignal) => Promise<void>;
  onPickFile?: () => void;
}) {
  const [format, setFormat] = useState<OutputFormat>(videoOptions.length ? initialFormat : "mp3");
  const [videoChoice, setVideoChoice] = useState(videoOptions[0]?.id ?? "");
  const [audioChoice, setAudioChoice] = useState("192");
  const [phase, setPhase] = useState<DownloadPhase | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => abort.current?.abort(), []);
  // La liste de qualités d'un fichier local n'est connue qu'après lecture de ses métadonnées.
  const ids = videoOptions.map((o) => o.id).join(",");
  useEffect(() => {
    setVideoChoice((c) => (ids.split(",").includes(c) ? c : ids.split(",")[0] ?? ""));
  }, [ids]);

  const options = format === "mp4" ? videoOptions : audioOptions;
  const choice = format === "mp4" ? videoChoice : audioChoice;
  const busy = phase?.state === "preparing" || phase?.state === "downloading";

  async function start() {
    setError(null);
    abort.current = new AbortController();
    try {
      await run(format, choice, setPhase, abort.current.signal);
    } catch (e) {
      setPhase(null);
      if ((e as Error).name === "AbortError") return;
      setError(e instanceof DownloadError ? e.message : "Le téléchargement a échoué. Réessayez.");
    }
  }

  const pct = phase?.state === "downloading" && phase.total ? Math.min(100, Math.round((phase.received / phase.total) * 100)) : null;

  return (
    <div className="mt-6 border-t border-line pt-6">
      <div className="grid gap-5 sm:grid-cols-2">
        <fieldset disabled={busy}>
          <legend className="text-xs font-semibold uppercase tracking-wider text-muted">Format</legend>
          <div className="mt-2.5 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Format">
            <Choice selected={format === "mp4"} disabled={!videoOptions.length} onSelect={() => setFormat("mp4")} icon={<Film className="h-4 w-4" />} label="MP4" hint="Vidéo + audio" />
            <Choice selected={format === "mp3"} onSelect={() => setFormat("mp3")} icon={<Music className="h-4 w-4" />} label="MP3" hint="Audio seul" />
          </div>
        </fieldset>
        <fieldset disabled={busy}>
          <legend className="text-xs font-semibold uppercase tracking-wider text-muted">Qualité</legend>
          <div className="mt-2.5 grid gap-2" role="radiogroup" aria-label="Qualité">
            {options.map((o) => (
              <Choice key={o.id} compact selected={choice === o.id} onSelect={() => (format === "mp4" ? setVideoChoice(o.id) : setAudioChoice(o.id))} label={o.label} hint={o.hint} />
            ))}
          </div>
        </fieldset>
      </div>

      <div className="mt-6" aria-live="polite">
        {busy ? (
          <div className="rounded-xl border border-line bg-canvas/60 p-4" data-testid="progress">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="inline-flex items-center gap-2 font-medium text-ink">
                <Loader2 className="h-4 w-4 animate-spin text-brand" />
                {phase?.state === "preparing" ? "Préparation du fichier…" : `Téléchargement… ${pct !== null ? `${pct} %` : formatBytes(phase!.state === "downloading" ? phase.received : 0)}`}
              </span>
              <button type="button" onClick={() => abort.current?.abort()} className="cursor-pointer text-xs font-medium text-muted hover:text-ink">
                Annuler
              </button>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ?? undefined}>
              {pct === null ? <div className="tf-indeterminate h-full w-1/3 rounded-full bg-brand" /> : <div className="h-full rounded-full bg-brand transition-[width] duration-200" style={{ width: `${pct}%` }} />}
            </div>
          </div>
        ) : (
          <Button size="lg" className="w-full" onClick={start} disabled={!choice} data-testid="download-button">
            <Download className="h-4 w-4" />
            {format === "mp4" ? (cleanSource ? "Télécharger sans filigrane" : "Télécharger en MP4") : "Télécharger l'audio MP3"}
          </Button>
        )}

        {phase?.state === "saved" && (
          <p className="mt-3 flex items-center gap-2 text-sm text-brand-dark" data-testid="saved">
            <Check className="h-4 w-4 shrink-0" />
            <span className="min-w-0 truncate">
              <span className="font-medium">{phase.fileName}</span> enregistré ({formatBytes(phase.size)}).
            </span>
          </p>
        )}
        {error && (
          <Alert tone="danger" className="mt-3" title="Le téléchargement n'a pas abouti">
            {error}
            <span className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
              <button type="button" onClick={start} className="inline-flex cursor-pointer items-center gap-1.5 font-medium underline underline-offset-4">
                <RotateCcw className="h-3.5 w-3.5" /> Réessayer
              </button>
              {onPickFile && (
                <button type="button" onClick={onPickFile} className="inline-flex cursor-pointer items-center gap-1.5 font-medium underline underline-offset-4">
                  <Upload className="h-3.5 w-3.5" /> Convertir un fichier à la place
                </button>
              )}
            </span>
          </Alert>
        )}
        <p className="mt-3 text-center text-xs leading-5 text-muted">Respectez les droits des créateurs : usage personnel ou contenu que vous êtes autorisé à réutiliser.</p>
      </div>
    </div>
  );
}

/* ---------- Primitives ---------- */

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section aria-label="Résultat" data-testid="result" className="rounded-2xl border border-line bg-white p-5 shadow-card sm:p-6">
      {children}
    </section>
  );
}

function Info({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted">{label}</dt>
      <dd className={cn("mt-0.5 truncate text-sm font-medium text-ink", mono && "font-mono text-xs leading-5")}>{value}</dd>
    </div>
  );
}

function Choice({ selected, onSelect, label, hint, icon, compact, disabled }: { selected: boolean; onSelect: () => void; label: string; hint?: string; icon?: React.ReactNode; compact?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        compact ? "py-2.5" : "py-3",
        selected ? "border-brand bg-brand-soft/60 ring-1 ring-brand" : "border-line bg-white hover:border-[#c9d0c8]",
      )}
    >
      {icon && <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", selected ? "bg-brand text-white" : "bg-canvas text-muted")}>{icon}</span>}
      <span className={cn("min-w-0 flex-1", compact && "flex items-baseline justify-between gap-3")}>
        <span className="block text-sm font-medium text-ink">{label}</span>
        {hint && <span className="block truncate text-xs text-muted">{hint}</span>}
      </span>
      {compact && <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded-full border", selected ? "border-brand bg-brand" : "border-[#c9d0c8] bg-white")}>{selected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}</span>}
    </button>
  );
}

function Alert({ tone, title, children, className, id }: { tone: "danger" | "warn"; title: string; children: React.ReactNode; className?: string; id?: string }) {
  return (
    <div id={id} role="alert" className={cn("flex gap-3 rounded-xl border p-4 text-sm leading-6", tone === "danger" ? "border-danger/20 bg-danger-soft text-danger" : "border-warn/20 bg-warn-soft text-warn", className)}>
      <AlertCircle className="mt-0.5 h-4.5 w-4.5 shrink-0" />
      <div className="min-w-0">
        <p className="font-semibold">{title}</p>
        <div className="mt-0.5 opacity-90">{children}</div>
      </div>
    </div>
  );
}

function ResultSkeleton() {
  return (
    <div className="mt-6 rounded-2xl border border-line bg-white p-5 sm:p-6" data-testid="skeleton" aria-label="Analyse en cours">
      <div className="flex animate-pulse flex-col gap-5 sm:flex-row sm:gap-6">
        <div className="mx-auto aspect-[9/16] w-40 rounded-xl bg-canvas sm:mx-0 sm:w-44" />
        <div className="flex-1 space-y-3 pt-1">
          <div className="h-6 w-28 rounded-full bg-canvas" />
          <div className="h-5 w-4/5 rounded bg-canvas" />
          <div className="h-4 w-2/5 rounded bg-canvas" />
          <div className="mt-6 h-12 rounded-xl bg-canvas" />
          <div className="h-12 rounded-xl bg-canvas" />
        </div>
      </div>
    </div>
  );
}
