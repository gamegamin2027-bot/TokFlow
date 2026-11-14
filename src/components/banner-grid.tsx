"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Archive, Check, Download, Film, Image as ImageIcon, Info, Loader2, RotateCcw, X } from "lucide-react";
import type { BannerItem, BannerSet } from "@/lib/banners/types";
import { DownloadError, requestFile, type DownloadPhase } from "@/lib/client-download";
import { cn } from "@/lib/utils";
import { useI18n } from "./i18n-provider";
import { Button } from "./ui/button";
import { Notice } from "./ui/field";

const pad = (n: number) => String(n).padStart(2, "0");

type Busy = { key: string; phase: DownloadPhase } | null;

/** Résultat du mode Bannières : une carte par bannière, dans l'ordre de la publication. */
export function BannerGrid({ data, onReset, onRetry }: { data: BannerSet; onReset: () => void; onRetry: () => void }) {
  const { t, bytes, apiMessage } = useI18n();
  const b = t.banners;
  const [selected, setSelected] = useState<Set<number>>(() => new Set(data.items.map((i) => i.n)));
  const [withImages, setWithImages] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<{ message: string; expired: boolean } | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  const base = `/api/banners/${data.id}`;
  const count = selected.size;
  const mixed = data.animatedCount > 0;

  function toggle(n: number) {
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(n)) next.add(n);
      return next;
    });
  }

  async function run(key: string, input: string, init: RequestInit) {
    if (busy) return;
    const c = new AbortController();
    controller.current = c;
    setError(null);
    setSaved(null);
    setBusy({ key, phase: { state: "preparing" } });
    try {
      await requestFile(input, init, (phase) => (phase.state === "saved" ? setSaved(`${phase.fileName} · ${bytes(phase.size)}`) : setBusy({ key, phase })), c.signal);
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        const code = e instanceof DownloadError ? e.code : "";
        setError({ message: apiMessage(code, (e as Error).message) || t.common.downloadFailed, expired: code === "EXPIRED" || code === "IMAGE_UNAVAILABLE" });
      }
    }
    setBusy(null);
  }

  const downloadOne = (item: BannerItem, format: "mp4" | "jpg") => run(`${item.n}.${format}`, `${base}/${item.n}.${format}`, { method: "GET" });
  const downloadZip = () =>
    run("zip", `${base}/zip`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: data.items.filter((i) => selected.has(i.n)).map((i) => (withImages && i.animated ? { n: i.n, formats: ["mp4", "jpg"] } : { n: i.n })) }),
    });

  const zipPhase = busy?.key === "zip" ? busy.phase : null;
  const zipLabel = !zipPhase
    ? b.zip
    : zipPhase.state === "downloading" && zipPhase.total
      ? t.tool.downloading(t.tool.percent(Math.round((zipPhase.received / zipPhase.total) * 100)))
      : b.zipPreparing;

  return (
    <section aria-label={b.region} data-testid="banner-result" className="rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-6">
      <div className="flex items-start justify-between gap-2">
        <p className="inline-flex min-h-7 items-center gap-1.5 rounded-full bg-brand-soft px-2.5 py-1 text-xs font-medium leading-4 text-brand-dark" data-testid="banner-summary">
          <Check className="h-3.5 w-3.5 shrink-0" />
          {b.count(data.count)}
          {mixed ? ` · ${b.animated(data.animatedCount)}` : ` · ${b.stillsOnly}`}
        </p>
        <button type="button" onClick={onReset} aria-label={t.common.closeResult} className="-mr-1.5 -mt-1.5 flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-canvas hover:text-ink">
          <X className="h-4 w-4" />
        </button>
      </div>
      <h3 className="mt-2 line-clamp-2 text-[15px] font-semibold leading-6 text-ink sm:text-base" data-testid="result-title">
        {data.title || b.titleOf(data.author)}
      </h3>
      <p className="mt-0.5 truncate text-sm text-muted">@{data.author} · {b.sub}</p>

      {data.notice && (
        <Notice tone="info" className="mt-4" icon={<Info className="h-4.5 w-4.5" />}>
          <span data-testid="banner-notice">{b.notices[data.clipStatus] ?? data.notice}</span>
          {data.clipStatus === "unavailable" && (
            <button type="button" onClick={onRetry} className="mt-1.5 flex cursor-pointer items-center gap-1.5 font-medium underline underline-offset-4">
              <RotateCcw className="h-3.5 w-3.5" /> {t.common.retry}
            </button>
          )}
        </Notice>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-line pt-4">
        <p className="text-sm font-medium text-ink" data-testid="banner-count" aria-live="polite">
          {count === 0 ? b.noneSelected : b.selected(count, data.count)}
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setSelected(new Set(data.items.map((i) => i.n)))} disabled={count === data.count}>
            {b.selectAll}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setSelected(new Set())} disabled={count === 0}>
            {b.selectNone}
          </Button>
        </div>
      </div>

      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {data.items.map((item) => (
          <BannerCard key={item.n} item={item} base={base} selected={selected.has(item.n)} onToggle={() => toggle(item.n)} busy={busy} locked={!!busy} onDownload={downloadOne} />
        ))}
      </ul>

      <div className="sticky bottom-3 z-10 mt-5 rounded-xl border border-line bg-surface/95 p-3 shadow-card backdrop-blur">
        {mixed && (
          <label className="mb-2.5 flex cursor-pointer items-center gap-2 text-[13px] text-muted">
            <input type="checkbox" checked={withImages} onChange={(e) => setWithImages(e.target.checked)} className="h-4 w-4 accent-[var(--color-brand)]" data-testid="banner-with-images" />
            {b.withImages}
          </label>
        )}
        <Button size="lg" className="w-full" disabled={count === 0 || !!busy} onClick={downloadZip} data-testid="banner-zip">
          {zipPhase ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}
          {zipLabel}
          {!zipPhase && count > 0 && <span className="opacity-80">· {count}</span>}
        </Button>
        <div aria-live="polite">
          {saved && !error && (
            <p className="mt-2 flex items-center justify-center gap-1.5 text-center text-xs text-brand-dark" data-testid="banner-saved">
              <Check className="h-3.5 w-3.5" /> {b.saved} {saved}
            </p>
          )}
          {error && (
            <Notice tone="danger" className="mt-2.5 text-left" icon={<AlertCircle className="h-4.5 w-4.5" />}>
              <span data-testid="banner-error">{error.message}</span>
              {error.expired && (
                <button type="button" onClick={onRetry} className="mt-1.5 flex cursor-pointer items-center gap-1.5 font-medium underline underline-offset-4">
                  <RotateCcw className="h-3.5 w-3.5" /> {b.rerun}
                </button>
              )}
            </Notice>
          )}
        </div>
      </div>
      <p className="mt-4 text-center text-xs leading-5 text-muted">{t.common.rights}</p>
    </section>
  );
}

function BannerCard({ item, base, selected, onToggle, busy, locked, onDownload }: { item: BannerItem; base: string; selected: boolean; onToggle: () => void; busy: Busy; locked: boolean; onDownload: (item: BannerItem, format: "mp4" | "jpg") => void }) {
  const { t, bytes } = useI18n();
  const b = t.banners;
  const video = useRef<HTMLVideoElement>(null);
  const [broken, setBroken] = useState(false);
  const ratio = item.width && item.height ? `${item.width} / ${item.height}` : "16 / 9";

  // L'animation ne joue que lorsqu'elle est visible : pas de dizaines de lectures simultanées.
  useEffect(() => {
    const el = video.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) void el.play().catch(() => undefined);
      else el.pause();
    }, { threshold: 0.25 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const num = pad(item.n);
  const spinner = (format: string) => busy?.key === `${item.n}.${format}`;
  return (
    <li data-testid="banner-card" data-n={item.n} data-animated={item.animated} data-selected={selected} className={cn("overflow-hidden rounded-xl border bg-surface transition-colors", selected ? "border-brand/60 ring-2 ring-brand/15" : "border-line")}>
      <div className="relative bg-panel" style={{ aspectRatio: ratio, maxHeight: "22rem" }}>
        {broken ? (
          <span className="flex h-full w-full items-center justify-center px-4 text-center text-xs text-white/80">{b.previewMissing}</span>
        ) : item.animated ? (
          <video ref={video} src={`${base}/${item.n}.mp4?inline=1`} muted loop playsInline autoPlay preload="metadata" onError={() => setBroken(true)} aria-label={b.previewAnimated(num)} className="h-full w-full object-contain" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- fichier d'origine servi par notre API, sans retraitement
          <img src={`${base}/${item.n}.jpg?inline=1`} alt={b.preview(num)} loading="lazy" decoding="async" onError={() => setBroken(true)} className="h-full w-full object-contain" />
        )}
        <label className="absolute left-2 top-2 flex cursor-pointer items-center gap-2 rounded-lg bg-white/95 py-1.5 pl-2 pr-2.5 text-xs font-semibold text-[#202a26] shadow-card">
          <input type="checkbox" checked={selected} onChange={onToggle} aria-label={b.select(num)} className="h-4 w-4 accent-[var(--color-brand)]" />
          {pad(item.n)}
        </label>
        <span className={cn("absolute right-2 top-2 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium", item.animated ? "bg-brand text-white" : "bg-white/95 text-[#202a26]")}>
          {item.animated ? <Film className="h-3 w-3" /> : <ImageIcon className="h-3 w-3" />}
          {item.animated ? b.tagAnimated : b.tagStill}
        </span>
      </div>
      <div className="p-3">
        <p className="text-xs leading-5 text-muted" data-testid="banner-format">
          {item.animated ? b.formatAnimated(item.clipBytes ? bytes(item.clipBytes) : "") : b.formatStill}
        </p>
        <div className="mt-2 flex gap-2">
          {item.animated && (
            <Button size="sm" className="flex-1" disabled={locked} onClick={() => onDownload(item, "mp4")} data-testid="banner-mp4" aria-label={b.download(num, "MP4")}>
              {spinner("mp4") ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} MP4
            </Button>
          )}
          <Button size="sm" variant={item.animated ? "secondary" : "primary"} className="flex-1" disabled={locked} onClick={() => onDownload(item, "jpg")} data-testid="banner-jpg" aria-label={b.download(num, "JPG")}>
            {spinner("jpg") ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} JPG
          </Button>
        </div>
      </div>
    </li>
  );
}
