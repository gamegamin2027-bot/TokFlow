"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Check, Download, Loader2, Music, RotateCcw } from "lucide-react";
import { DownloadError, type DownloadPhase } from "@/lib/client-download";
import { MP3_BITRATES, type AudioFormat } from "@/lib/media/formats";
import { cn, formatBytes } from "@/lib/utils";
import { Button } from "./ui/button";
import { Notice, Select } from "./ui/field";

export type Option = { id: string; label: string };
type Run = (onPhase: (p: DownloadPhase) => void, signal: AbortSignal) => Promise<void>;

/** Suivi d'un téléchargement : préparation, transfert, enregistrement, erreur, annulation. */
export function useDownload() {
  const [phase, setPhase] = useState<DownloadPhase | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const last = useRef<Run | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  async function start(run: Run) {
    last.current = run;
    setError(null);
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    try {
      await run(setPhase, controller.signal);
    } catch (e) {
      setPhase(null);
      if ((e as Error).name === "AbortError") return;
      setError(e instanceof DownloadError || (e instanceof Error && "code" in e) ? (e as Error).message : "Le téléchargement a échoué. Réessayez.");
    }
  }

  return {
    phase,
    error,
    busy: phase?.state === "preparing" || phase?.state === "downloading",
    start,
    retry: () => (last.current ? start(last.current) : undefined),
    cancel: () => {
      abort.current?.abort();
      setPhase(null);
    },
    setPhase,
  };
}

export type DownloadHandle = ReturnType<typeof useDownload>;

/** Barre d'avancement commune. `ratio` nul = durée inconnue (animation continue). */
export function ProgressBox({ label, ratio, onCancel, detail, testId = "progress" }: { label: string; ratio: number | null; onCancel?: () => void; detail?: string; testId?: string }) {
  const pct = ratio === null ? null : Math.min(100, Math.max(0, Math.round(ratio * 100)));
  return (
    <div className="tf-rise rounded-xl border border-line bg-canvas/60 p-4" data-testid={testId}>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="inline-flex min-w-0 items-center gap-2 font-medium text-ink">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brand" />
          <span className="truncate">
            {label}
            {pct !== null ? ` ${pct} %` : ""}
          </span>
        </span>
        {onCancel && (
          <button type="button" onClick={onCancel} className="shrink-0 cursor-pointer text-xs font-medium text-muted hover:text-ink">
            Annuler
          </button>
        )}
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ?? undefined}>
        {pct === null ? <div className="tf-indeterminate h-full w-1/3 rounded-full bg-brand" /> : <div className="h-full rounded-full bg-brand transition-[width] duration-300" style={{ width: `${pct}%` }} />}
      </div>
      {detail && <p className="mt-2 text-xs text-muted">{detail}</p>}
    </div>
  );
}

/** État d'un téléchargement sous les boutons d'action. */
export function DownloadStatus({ download, preparingLabel }: { download: DownloadHandle; preparingLabel: string }) {
  const { phase, error } = download;
  return (
    <div aria-live="polite" className="empty:hidden mt-4 space-y-3">
      {download.busy && (
        <ProgressBox
          label={phase?.state === "downloading" ? (phase.total ? "Téléchargement…" : `Téléchargement… ${formatBytes(phase.received)}`) : preparingLabel}
          ratio={phase?.state === "downloading" && phase.total ? phase.received / phase.total : null}
          onCancel={download.cancel}
        />
      )}
      {phase?.state === "saved" && (
        <Notice tone="success" className="tf-rise" icon={<Check className="h-4.5 w-4.5" />}>
          <span data-testid="saved" className="block truncate">
            <span className="font-medium">{phase.fileName}</span> enregistré sur votre appareil ({formatBytes(phase.size)}).
          </span>
        </Notice>
      )}
      {error && (
        <Notice tone="danger" className="tf-rise" title="Le téléchargement n'a pas abouti" icon={<AlertCircle className="h-4.5 w-4.5" />}>
          {error}
          <button type="button" onClick={() => void download.retry()} className="mt-2 flex cursor-pointer items-center gap-1.5 font-medium underline underline-offset-4">
            <RotateCcw className="h-3.5 w-3.5" /> Réessayer
          </button>
        </Notice>
      )}
    </div>
  );
}

const Rights = () => <p className="mt-4 text-center text-xs leading-5 text-muted">Respectez les droits des créateurs : usage personnel ou contenu que vous êtes autorisé à réutiliser.</p>;

/* ---------- Mode Vidéo ---------- */

export function VideoPanel({ options, cleanSource = false, run }: {
  options: Option[];
  /** Vrai lorsque la source est le flux d'origine TikTok, sans filigrane. */
  cleanSource?: boolean;
  run: (quality: string, onPhase: (p: DownloadPhase) => void, signal: AbortSignal) => Promise<void>;
}) {
  const [quality, setQuality] = useState(options[0]?.id ?? "");
  const download = useDownload();
  // Les qualités d'un fichier local ne sont connues qu'après lecture de ses métadonnées.
  const ids = options.map((o) => o.id).join(",");
  useEffect(() => {
    setQuality((c) => (ids.split(",").includes(c) ? c : (ids.split(",")[0] ?? "")));
  }, [ids]);

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-end">
        <div>
          <label htmlFor="video-quality" className="block text-xs font-medium text-muted">
            Qualité de la vidéo
          </label>
          <Select id="video-quality" value={quality} onValueChange={setQuality} disabled={download.busy} className="mt-1.5 h-12 text-sm" options={options.map((o) => ({ value: o.id, label: o.label }))} />
        </div>
        <Button size="lg" className="w-full" onClick={() => void download.start((onPhase, signal) => run(quality, onPhase, signal))} disabled={download.busy || !quality} data-testid="download-video">
          <Download className="h-4.5 w-4.5" /> Télécharger la vidéo
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted">{cleanSource ? "Vidéo complète en MP4, sans filigrane, avec le son." : "Vidéo complète en MP4, avec le son."}</p>
      <DownloadStatus download={download} preparingLabel="Préparation de la vidéo…" />
      <Rights />
    </div>
  );
}

/* ---------- Mode Audio ---------- */

const formatOptions = [
  { value: "mp3", label: "MP3 · compatible partout" },
  { value: "m4a", label: "M4A · son d'origine" },
];
const bitrateOptions = MP3_BITRATES.map((b) => ({ value: String(b), label: `${b} kbps${b === 320 ? " (maximum)" : b === 128 ? " (léger)" : ""}` }));

export function AudioPanel({ run }: { run: (format: AudioFormat, bitrate: string, onPhase: (p: DownloadPhase) => void, signal: AbortSignal) => Promise<void> }) {
  const [format, setFormat] = useState<AudioFormat>("mp3");
  const [bitrate, setBitrate] = useState("192");
  const download = useDownload();
  return (
    <div>
      <div className={cn("grid gap-3 sm:items-end", format === "mp3" ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
        <div>
          <label htmlFor="audio-format" className="block text-xs font-medium text-muted">
            Format du son
          </label>
          <Select id="audio-format" value={format} onValueChange={(v) => setFormat(v as AudioFormat)} disabled={download.busy} className="mt-1.5 h-12 text-sm" options={formatOptions} />
        </div>
        {format === "mp3" && (
          <div>
            <label htmlFor="audio-quality" className="block text-xs font-medium text-muted">
              Qualité du son
            </label>
            <Select id="audio-quality" value={bitrate} onValueChange={setBitrate} disabled={download.busy} className="mt-1.5 h-12 text-sm" options={bitrateOptions} />
          </div>
        )}
        <Button variant="dark" size="lg" className="w-full" onClick={() => void download.start((onPhase, signal) => run(format, bitrate, onPhase, signal))} disabled={download.busy} data-testid="download-audio">
          <Music className="h-4.5 w-4.5" /> Télécharger le son
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted">{format === "mp3" ? "Piste audio seule, convertie en MP3." : "Piste audio seule, copiée telle quelle depuis la vidéo quand elle est en AAC : aucune perte de qualité."}</p>
      <DownloadStatus download={download} preparingLabel="Extraction du son…" />
      <Rights />
    </div>
  );
}

