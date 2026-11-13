"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, Check, Download, Info, LayoutGrid, Loader2, Merge, Pause, Play, RotateCcw, Scissors, SlidersHorizontal, Volume2, VolumeX, X } from "lucide-react";
import { clipUrl, makeItem, sourceUrl, thumbUrl, type BannerItem, type BannerJobHandle } from "@/lib/client-banners";
import { DownloadError, requestFile } from "@/lib/client-download";
import type { BannerJobView, BannerSensitivity } from "@/lib/media/banners/types";
import { cn, formatBytes } from "@/lib/utils";
import { ProgressBox, useDownload } from "./download-panel";
import { Button } from "./ui/button";
import { Notice, Select } from "./ui/field";

const two = (n: number) => String(n).padStart(2, "0");
const seconds = (v: number) => `${v.toFixed(1).replace(".", ",")} s`;
const MIN_LENGTH = 0.2;
const FRAME = 1 / 30;

const sensitivityOptions = [
  { value: "low", label: "Moins de coupes" },
  { value: "normal", label: "Découpage normal" },
  { value: "high", label: "Plus de coupes" },
];

/** Mode « Bannières » : séquences détectées, sélection, aperçu, correction et téléchargement. */
export function BannerPanel({ handle, intro }: { handle: BannerJobHandle; intro?: string }) {
  const { state, items, setItems } = handle;

  if (state.phase === "idle") {
    return (
      <div className="rounded-xl border border-dashed border-line bg-canvas/50 p-5 text-center">
        <LayoutGrid className="mx-auto h-6 w-6 text-brand" aria-hidden />
        <p className="mt-2 text-sm font-medium text-ink">Découper la vidéo en bannières</p>
        <p className="mx-auto mt-1 max-w-md text-[13px] leading-5 text-muted">{intro ?? "TokFlow repère chaque séquence animée de la vidéo et vous laisse télécharger celles que vous voulez, une par une ou toutes ensemble."}</p>
        <Button className="mt-4" onClick={() => void handle.start()} data-testid="banner-start">
          <Scissors className="h-4 w-4" /> Analyser la vidéo
        </Button>
      </div>
    );
  }

  if (state.phase === "starting" || state.phase === "running") {
    const job = state.phase === "running" ? state.job : null;
    const analysing = job?.status === "analysing";
    return (
      <div aria-live="polite">
        <ProgressBox
          testId="banner-progress"
          label={analysing ? "Analyse des séquences…" : "Récupération de la vidéo…"}
          ratio={analysing ? job.progress : null}
          detail={analysing ? "Chaque image est comparée aux précédentes pour repérer les changements de bannière." : "La vidéo est copiée temporairement sur le serveur pour être analysée."}
        />
      </div>
    );
  }

  if (state.phase === "error") {
    const expired = state.code === "EXPIRED";
    return (
      <Notice tone={expired ? "warn" : "danger"} title={expired ? "Cette analyse a expiré" : "L'analyse n'a pas abouti"} icon={<AlertCircle className="h-4.5 w-4.5" />}>
        {state.message}
        <button type="button" onClick={() => void handle.start()} className="mt-2 flex cursor-pointer items-center gap-1.5 font-medium underline underline-offset-4">
          <RotateCcw className="h-3.5 w-3.5" /> Relancer l&apos;analyse
        </button>
      </Notice>
    );
  }

  return <BannerResults handle={handle} job={state.job} items={items} setItems={setItems} />;
}

function BannerResults({ handle, job, items, setItems }: { handle: BannerJobHandle; job: BannerJobView; items: BannerItem[]; setItems: BannerJobHandle["setItems"] }) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [singleKey, setSingleKey] = useState<string | null>(null);
  const [failures, setFailures] = useState<{ name: string; message: string }[]>([]);
  const single = useDownload();
  const zip = useDownload();

  const selected = items.filter((i) => i.selected);
  const count = selected.length;
  const duration = job.duration ?? 0;
  const ratio = job.width && job.height ? Math.min(1.78, Math.max(0.62, job.width / job.height)) : 0.62;
  const busy = zip.busy || single.busy;
  const openIndex = items.findIndex((i) => i.key === openKey);

  const toggle = (key: string) => setItems((list) => list.map((i) => (i.key === key ? { ...i, selected: !i.selected } : i)));
  const selectAll = (value: boolean) => setItems((list) => list.map((i) => ({ ...i, selected: value })));

  const downloadOne = useCallback(
    (item: BannerItem, n: number) => {
      setSingleKey(item.key);
      setFailures([]);
      void single.start((onPhase, signal) => requestFile(clipUrl(job.id, item, n), {}, onPhase, signal));
    },
    [job.id, single],
  );

  function downloadSelection() {
    setFailures([]);
    if (count === 1) {
      const item = selected[0];
      return downloadOne(item, items.indexOf(item) + 1);
    }
    setSingleKey(null);
    const selection = items.map((item, i) => ({ item, index: i + 1 })).filter((x) => x.item.selected).map(({ item, index }) => ({ index, start: item.start, end: item.end }));
    void zip.start(async (onPhase, signal) => {
      onPhase({ state: "preparing" });
      const done = await handle.prepareZip(selection, signal);
      const exp = done.export;
      if (!exp || exp.status !== "ready") throw new DownloadError(exp?.errors[exp.errors.length - 1]?.message ?? "L'archive n'a pas pu être créée.", "EXPORT");
      setFailures(exp.errors);
      await requestFile(`/api/banners/${job.id}/export/${exp.id}`, {}, onPhase, signal);
    });
  }

  const exp = job.export;
  const active = single.busy ? single : zip;
  const saved = (zip.phase?.state === "saved" && zip.phase) || (single.phase?.state === "saved" && single.phase) || null;
  const error = zip.error ?? single.error;
  const singleName = singleKey ? `Bannière ${two(items.findIndex((i) => i.key === singleKey) + 1)}` : "";

  return (
    <div data-testid="banner-results">
      <Notice tone={job.verdict === "banners" ? "success" : "warn"} icon={job.verdict === "banners" ? <Check className="h-4.5 w-4.5" /> : <Info className="h-4.5 w-4.5" />}>
        <span data-testid="banner-verdict">{job.reason}</span>
        {job.verdict !== "banners" && <span className="mt-1 block text-[13px]">Le découpage est automatique : vérifiez les aperçus, et corrigez-le si besoin avec « Ajuster » ou le réglage ci-dessous.</span>}
      </Notice>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <p className="text-sm font-medium text-ink" aria-live="polite" data-testid="banner-count">
          {count} sélectionnée{count > 1 ? "s" : ""} sur {items.length}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => selectAll(true)} disabled={count === items.length}>
            Tout sélectionner
          </Button>
          <Button variant="secondary" size="sm" onClick={() => selectAll(false)} disabled={count === 0}>
            Tout désélectionner
          </Button>
          <Select aria-label="Réglage du découpage" value={job.sensitivity} onValueChange={(v) => void handle.setSensitivity(v as BannerSensitivity)} disabled={busy} className="h-9 w-[11.5rem] text-sm" options={sensitivityOptions} />
        </div>
      </div>

      <ul className={cn("mt-4 grid gap-3", ratio > 1.2 ? "grid-cols-1 min-[420px]:grid-cols-2" : "grid-cols-2 sm:grid-cols-3")}>
        {items.map((item, i) => (
          <BannerCard
            key={item.key}
            item={item}
            n={i + 1}
            jobId={job.id}
            ratio={ratio}
            downloading={single.busy && singleKey === item.key}
            disabled={busy}
            onToggle={() => toggle(item.key)}
            onOpen={() => setOpenKey(item.key)}
            onDownload={() => downloadOne(item, i + 1)}
          />
        ))}
      </ul>

      <div className="sticky bottom-3 z-10 mt-4">
        <Button size="lg" className="h-14 w-full shadow-card" onClick={downloadSelection} disabled={count === 0 || busy} data-testid="banner-download">
          <Download className="h-4.5 w-4.5 shrink-0" />
          <span className="truncate">{count === 0 ? "Sélectionnez au moins une bannière" : count === 1 ? "Télécharger la bannière sélectionnée" : `Télécharger les ${count} bannières sélectionnées`}</span>
        </Button>
      </div>
      {count > 1 && <p className="mt-1.5 text-center text-xs text-muted">Une archive ZIP contenant uniquement ces {count} fichiers vidéo.</p>}

      <div aria-live="polite" className="mt-4 space-y-3 empty:hidden">
        {active.busy &&
          (active.phase?.state === "downloading" ? (
            <ProgressBox label="Téléchargement…" ratio={active.phase.total ? active.phase.received / active.phase.total : null} onCancel={active.cancel} />
          ) : single.busy ? (
            <ProgressBox label={`Extraction de ${singleName}…`} ratio={null} onCancel={single.cancel} />
          ) : (
            <ProgressBox
              testId="banner-zip-progress"
              label={exp?.status === "running" ? `Extraction des bannières… ${exp.done} / ${exp.total}` : "Préparation de l'archive…"}
              ratio={exp?.status === "running" && exp.total ? exp.done / exp.total : null}
              detail={exp?.current ? `En cours : ${exp.current.replace(/\.mp4$/, "")}` : undefined}
              onCancel={zip.cancel}
            />
          ))}
        {saved && !busy && (
          <Notice tone="success" className="tf-rise" icon={<Check className="h-4.5 w-4.5" />}>
            <span data-testid="saved" className="block truncate">
              <span className="font-medium">{saved.fileName}</span> enregistré sur votre appareil ({formatBytes(saved.size)}).
            </span>
          </Notice>
        )}
        {failures.length > 0 && (
          <Notice tone="warn" className="tf-rise" title={`${failures.length} bannière${failures.length > 1 ? "s n'ont" : " n'a"} pas pu être extraite${failures.length > 1 ? "s" : ""}`} icon={<AlertCircle className="h-4.5 w-4.5" />}>
            <ul className="list-disc pl-4">
              {failures.map((f) => (
                <li key={f.name}>
                  {f.name.replace(/\.mp4$/, "")} : {f.message}
                </li>
              ))}
            </ul>
            Les autres fichiers sont bien dans l&apos;archive.
          </Notice>
        )}
        {error && !busy && (
          <Notice tone="danger" className="tf-rise" title={single.error && singleName ? `${singleName} n'a pas pu être téléchargée` : "Le téléchargement n'a pas abouti"} icon={<AlertCircle className="h-4.5 w-4.5" />}>
            {error}
            <button type="button" onClick={() => void (zip.error ? zip.retry() : single.retry())} className="mt-2 flex cursor-pointer items-center gap-1.5 font-medium underline underline-offset-4">
              <RotateCcw className="h-3.5 w-3.5" /> Réessayer
            </button>
          </Notice>
        )}
      </div>
      <p className="mt-4 text-center text-xs leading-5 text-muted">Respectez les droits des créateurs : usage personnel ou contenu que vous êtes autorisé à réutiliser. Les fichiers temporaires sont supprimés du serveur après 20 minutes d&apos;inactivité.</p>

      {openIndex >= 0 && (
        <BannerDialog
          key={items[openIndex].key}
          jobId={job.id}
          item={items[openIndex]}
          n={openIndex + 1}
          total={items.length}
          duration={duration}
          previous={items[openIndex - 1]}
          next={items[openIndex + 1]}
          onClose={() => setOpenKey(null)}
          onDownload={(item) => downloadOne(item, openIndex + 1)}
          onApply={(start, end) => setItems((list) => list.map((i) => (i.key === openKey ? { ...i, start, end, edited: true } : i)))}
          onMerge={() =>
            setItems((list) => {
              const at = list.findIndex((i) => i.key === openKey);
              if (at < 0 || at >= list.length - 1) return list;
              const merged = { ...list[at], end: list[at + 1].end, edited: true };
              return [...list.slice(0, at), merged, ...list.slice(at + 2)];
            })
          }
          onSplit={(time) =>
            setItems((list) => {
              const at = list.findIndex((i) => i.key === openKey);
              if (at < 0) return list;
              const cur = list[at];
              return [...list.slice(0, at), { ...cur, end: time, edited: true }, makeItem(time, cur.end, cur.selected, true), ...list.slice(at + 1)];
            })
          }
        />
      )}
    </div>
  );
}

function BannerCard({ item, n, jobId, ratio, downloading, disabled, onToggle, onOpen, onDownload }: {
  item: BannerItem;
  n: number;
  jobId: string;
  ratio: number;
  downloading: boolean;
  disabled: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onDownload: () => void;
}) {
  const [thumb, setThumb] = useState<"loading" | "ok" | "error">("loading");
  const name = `Bannière ${two(n)}`;
  const src = thumbUrl(jobId, item);
  useEffect(() => setThumb("loading"), [src]);
  return (
    <li data-testid="banner-card" className={cn("overflow-hidden rounded-xl border bg-white transition-colors", item.selected ? "border-brand ring-1 ring-brand" : "border-line")}>
      <div className="relative bg-ink" style={{ aspectRatio: ratio }}>
        {thumb !== "error" && (
          // eslint-disable-next-line @next/next/no-img-element -- vignette temporaire produite par notre serveur
          <img src={src} alt="" loading="lazy" onLoad={() => setThumb("ok")} onError={() => setThumb("error")} className={cn("h-full w-full object-contain transition-opacity", thumb === "ok" ? "opacity-100" : "opacity-0")} />
        )}
        {thumb === "loading" && <span className="absolute inset-0 animate-pulse bg-white/10" />}
        <button type="button" onClick={onOpen} aria-label={`Aperçu de ${name}`} className="group absolute inset-0 flex cursor-pointer items-center justify-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/95 text-ink shadow-card transition-transform group-hover:scale-105">
            <Play className="ml-0.5 h-4 w-4 fill-current" />
          </span>
        </button>
        <label className="absolute left-0 top-0 flex h-11 w-11 cursor-pointer items-center justify-center">
          <input type="checkbox" checked={item.selected} onChange={onToggle} aria-label={`Sélectionner ${name}`} className="peer sr-only" />
          <span className="flex h-6 w-6 items-center justify-center rounded-md border-2 border-white bg-ink/50 text-transparent shadow-sm transition-colors peer-checked:border-brand peer-checked:bg-brand peer-checked:text-white peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-white">
            <Check className="h-4 w-4" strokeWidth={3} />
          </span>
        </label>
        <span className="pointer-events-none absolute bottom-1.5 right-1.5 rounded-md bg-ink/75 px-1.5 py-0.5 text-[11px] font-medium text-white">{seconds(item.end - item.start)}</span>
      </div>
      <div className="flex items-center justify-between py-1 pl-2 pr-0.5">
        <p className="min-w-0 truncate text-[13px] font-medium text-ink sm:text-sm">
          {name}
          {item.edited && <span className="ml-1.5 text-xs font-normal text-muted">ajustée</span>}
        </p>
        <div className="flex shrink-0">
          <button type="button" onClick={onOpen} aria-label={`Ajuster ${name}`} title="Aperçu et réglage" className="flex h-10 w-8 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-canvas hover:text-ink">
            <SlidersHorizontal className="h-4 w-4" />
          </button>
          <button type="button" onClick={onDownload} disabled={disabled} aria-label={`Télécharger ${name}`} title="Télécharger ce fichier" className="flex h-10 w-8 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-canvas hover:text-ink disabled:cursor-not-allowed disabled:opacity-50">
            {downloading ? <Loader2 className="h-4 w-4 animate-spin text-brand" /> : <Download className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </li>
  );
}

/* ---------- Aperçu et correction d'une bannière ---------- */

/** Lit en boucle le passage [start, end[ de la vidéo analysée. */
function LoopPlayer({ jobId, start, end, n, videoRef }: { jobId: string; start: number; end: number; n: number; videoRef: React.RefObject<HTMLVideoElement | null> }) {
  // Si le navigateur ne sait pas lire la vidéo d'origine (HEVC…), on lit le fichier extrait en H.264.
  const [fallback, setFallback] = useState(false);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(true);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [position, setPosition] = useState(0);
  const range = useRef({ start, end });
  range.current = { start, end };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let frame = 0;
    const tick = () => {
      const { start: a, end: b } = fallback ? { start: 0, end: Number.isFinite(video.duration) ? video.duration : end - start } : range.current;
      const t = video.currentTime;
      if (!fallback && video.readyState >= 1 && (t >= b - 0.03 || t < a - 0.25)) video.currentTime = a;
      setPosition(b > a ? Math.min(1, Math.max(0, (t - a) / (b - a))) : 0);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [fallback, videoRef, start, end]);

  // Un changement de début ou de fin relance la lecture depuis le nouveau début.
  useEffect(() => {
    const video = videoRef.current;
    if (video && !fallback && video.readyState >= 1) video.currentTime = start;
  }, [start, end, fallback, videoRef]);

  return (
    <div className="relative mx-auto flex max-h-[38dvh] min-h-40 w-full items-center justify-center overflow-hidden rounded-xl bg-ink">
      <video
        ref={videoRef}
        key={fallback ? `clip-${start}-${end}` : "source"}
        src={fallback ? clipUrl(jobId, { start, end }, n, true) : sourceUrl(jobId)}
        muted={muted}
        loop={fallback}
        autoPlay
        playsInline
        disableRemotePlayback
        preload="auto"
        data-testid="banner-player"
        className="max-h-[38dvh] w-full object-contain"
        onLoadedMetadata={(e) => {
          // Certains navigateurs ne décodent pas le format d'origine (HEVC) : l'image reste noire
          // alors que le son joue. On bascule alors sur un extrait converti en H.264.
          if (!fallback && e.currentTarget.videoWidth === 0) {
            setFallback(true);
            return;
          }
          if (!fallback) e.currentTarget.currentTime = range.current.start;
          setReady(true);
        }}
        onPlay={() => setPaused(false)}
        onPause={() => setPaused(true)}
        onError={() => (fallback ? setFailed(true) : setFallback(true))}
      />
      {!ready && !failed && (
        <span className="absolute inset-0 flex items-center justify-center text-sm text-white/80">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {fallback ? "Préparation de l'aperçu…" : "Chargement…"}
        </span>
      )}
      {failed && <span className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-white/85">L&apos;aperçu n&apos;a pas pu être lu sur cet appareil. Le téléchargement reste possible.</span>}
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-ink/80 to-transparent p-2 pt-6">
        <button type="button" onClick={() => (videoRef.current?.paused ? void videoRef.current.play() : videoRef.current?.pause())} aria-label={paused ? "Lire" : "Mettre en pause"} className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg bg-white/15 text-white hover:bg-white/25">
          {paused ? <Play className="h-4 w-4 fill-current" /> : <Pause className="h-4 w-4 fill-current" />}
        </button>
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/25">
          <div className="h-full bg-white" style={{ width: `${position * 100}%` }} />
        </div>
        <button type="button" onClick={() => setMuted((m) => !m)} aria-label={muted ? "Activer le son" : "Couper le son"} className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg bg-white/15 text-white hover:bg-white/25">
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

function TimeControl({ id, label, value, min, max, onChange, onUsePosition }: { id: string; label: string; value: number; min: number; max: number; onChange: (v: number) => void; onUsePosition: () => void }) {
  const clamp = (v: number) => Math.round(Math.min(max, Math.max(min, v)) * 1000) / 1000;
  const step = (delta: number, text: string, aria: string) => (
    <button type="button" onClick={() => onChange(clamp(value + delta))} disabled={delta < 0 ? value <= min + 1e-6 : value >= max - 1e-6} aria-label={aria} className="flex h-10 min-w-10 cursor-pointer items-center justify-center rounded-lg border border-line bg-white px-1.5 text-xs font-medium text-ink transition-colors hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-40">
      {text}
    </button>
  );
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-xs font-medium text-muted">
          {label}
        </label>
        <button type="button" onClick={onUsePosition} className="cursor-pointer text-xs font-medium text-brand-dark underline underline-offset-2">
          Utiliser la position de lecture
        </button>
      </div>
      <div className="mt-1.5 flex items-center gap-1.5">
        {step(-0.1, "−0,1", `${label} : reculer de 0,1 seconde`)}
        {step(-FRAME, "−1 im.", `${label} : reculer d'une image`)}
        <input
          id={id}
          type="number"
          inputMode="decimal"
          step={0.01}
          min={min}
          max={max}
          value={Number(value.toFixed(2))}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v)) onChange(clamp(v));
          }}
          className="h-10 w-full min-w-0 rounded-lg border border-line bg-white px-2 text-center text-sm tabular-nums text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15"
        />
        {step(FRAME, "+1 im.", `${label} : avancer d'une image`)}
        {step(0.1, "+0,1", `${label} : avancer de 0,1 seconde`)}
      </div>
    </div>
  );
}

function BannerDialog({ jobId, item, n, total, duration, previous, next, onClose, onApply, onMerge, onSplit, onDownload }: {
  jobId: string;
  item: BannerItem;
  n: number;
  total: number;
  duration: number;
  previous?: BannerItem;
  next?: BannerItem;
  onClose: () => void;
  onApply: (start: number, end: number) => void;
  onMerge: () => void;
  onSplit: (time: number) => void;
  onDownload: (item: BannerItem) => void;
}) {
  const [start, setStart] = useState(item.start);
  const [end, setEnd] = useState(item.end);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const name = `Bannière ${two(n)}`;
  const changed = start !== item.start || end !== item.end;
  const original = useMemo(() => ({ start: item.start, end: item.end }), [item.start, item.end]);

  useEffect(() => {
    setStart(item.start);
    setEnd(item.end);
  }, [item.start, item.end]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  const position = () => Math.round((videoRef.current?.currentTime ?? start) * 1000) / 1000;
  const splitAt = () => {
    const t = position();
    if (t - start >= MIN_LENGTH && end - t >= MIN_LENGTH) {
      onApply(start, end);
      onSplit(t);
    }
  };

  // Rendu à la racine du document : la fenêtre passe ainsi au-dessus de l'en-tête fixe.
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-ink/60 sm:items-center sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="banner-dialog-title" data-testid="banner-dialog" className="tf-rise flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-card sm:max-w-xl sm:rounded-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5 sm:px-5">
          <div className="min-w-0">
            <h3 id="banner-dialog-title" className="truncate text-base font-semibold text-ink">
              {name} <span className="font-normal text-muted">sur {total}</span>
            </h3>
            <p className="text-xs text-muted" data-testid="banner-dialog-range">
              De {start.toFixed(2).replace(".", ",")} s à {end.toFixed(2).replace(".", ",")} s · {seconds(end - start)}
            </p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Fermer" className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-canvas hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
          <LoopPlayer jobId={jobId} start={start} end={end} n={n} videoRef={videoRef} />

          <div className="grid gap-4 sm:grid-cols-2">
            <TimeControl id="banner-start" label="Début" value={start} min={0} max={Math.max(0, end - MIN_LENGTH)} onChange={setStart} onUsePosition={() => setStart(Math.min(position(), end - MIN_LENGTH))} />
            <TimeControl id="banner-end" label="Fin" value={end} min={start + MIN_LENGTH} max={duration} onChange={setEnd} onUsePosition={() => setEnd(Math.max(position(), start + MIN_LENGTH))} />
          </div>
          <p className="text-xs leading-5 text-muted">L&apos;aperçu se relance à chaque réglage. « 1 im. » déplace la coupe d&apos;une image.{previous && start < previous.end - 1e-3 ? " Le début empiète sur la bannière précédente." : ""}{next && end > next.start + 1e-3 ? " La fin empiète sur la bannière suivante." : ""}</p>

          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={splitAt}>
              <Scissors className="h-4 w-4" /> Couper en deux ici
            </Button>
            {next && (
              <Button variant="secondary" size="sm" onClick={onMerge}>
                <Merge className="h-4 w-4" /> Fusionner avec la suivante
              </Button>
            )}
            {changed && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setStart(original.start);
                  setEnd(original.end);
                }}
              >
                <RotateCcw className="h-4 w-4" /> Annuler le réglage
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5 border-t border-line px-4 py-3 sm:px-5">
          <Button
            variant="secondary"
            size="lg"
            disabled={!changed}
            onClick={() => onApply(start, end)}
            data-testid="banner-apply"
          >
            <Check className="h-4 w-4" /> Appliquer
          </Button>
          <Button
            size="lg"
            onClick={() => {
              if (changed) onApply(start, end);
              onDownload({ ...item, start, end });
              onClose();
            }}
            data-testid="banner-dialog-download"
          >
            <Download className="h-4 w-4" /> Télécharger
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
