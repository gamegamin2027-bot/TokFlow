"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BannerJobView, BannerSensitivity } from "./media/banners/types";
import type { ApiErrorBody } from "./types";

/** Une bannière telle que l'utilisateur la voit : séquence détectée, éventuellement corrigée à la main. */
export type BannerItem = { key: string; start: number; end: number; selected: boolean; edited: boolean };

export type BannerState =
  | { phase: "idle" }
  | { phase: "starting" }
  | { phase: "running" | "ready"; job: BannerJobView }
  | { phase: "error"; code: string; message: string };

export class BannerApiError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
  }
}

async function call(input: string, init?: RequestInit): Promise<BannerJobView> {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new BannerApiError("Connexion au serveur impossible. Vérifiez votre réseau et réessayez.", "NETWORK");
  }
  const body = (await res.json().catch(() => null)) as BannerJobView | ApiErrorBody | null;
  if (!res.ok || !body || "error" in body) {
    const err = body && "error" in body ? body.error : null;
    throw new BannerApiError(err?.message ?? `Le serveur a répondu avec une erreur (${res.status}).`, err?.code ?? "HTTP");
  }
  return body;
}

let counter = 0;
const newKey = () => `b${++counter}`;
export const makeItem = (start: number, end: number, selected = true, edited = false): BannerItem => ({ key: newKey(), start, end, selected, edited });

export const clipUrl = (jobId: string, item: Pick<BannerItem, "start" | "end">, n: number, inline = false) =>
  `/api/banners/${jobId}/clip?start=${item.start}&end=${item.end}&n=${n}${inline ? "&inline=1" : ""}`;
export const thumbUrl = (jobId: string, item: Pick<BannerItem, "start" | "end">) => `/api/banners/${jobId}/thumb?at=${(item.start + Math.min((item.end - item.start) / 2, 1.5)).toFixed(1)}`;
export const sourceUrl = (jobId: string) => `/api/banners/${jobId}/source`;

const POLL_MS = 900;

/**
 * Pilote une analyse de bannières : démarrage, suivi de l'avancement, liste modifiable des
 * séquences, préparation de l'archive. `create` envoie la demande de création au serveur.
 */
export function useBannerJob(create: (signal: AbortSignal) => Promise<Response>) {
  const [state, setState] = useState<BannerState>({ phase: "idle" });
  const [items, setItems] = useState<BannerItem[]>([]);
  const createRef = useRef(create);
  createRef.current = create;
  const abort = useRef<AbortController | null>(null);
  const jobId = useRef<string | null>(null);
  const detectionKey = useRef("");

  const accept = useCallback((job: BannerJobView) => {
    jobId.current = job.id;
    if (job.status === "error") {
      setState({ phase: "error", code: job.error?.code ?? "INTERNAL", message: job.error?.message ?? "L'analyse a échoué." });
      return;
    }
    if (job.status === "ready") {
      // Une nouvelle détection (première analyse ou autre sensibilité) remplace la liste.
      const key = `${job.id}:${job.sensitivity}:${job.segments.map((s) => s.start).join(",")}`;
      if (key !== detectionKey.current) {
        detectionKey.current = key;
        setItems(job.segments.map((s) => makeItem(s.start, s.end)));
      }
    }
    setState({ phase: job.status === "ready" ? "ready" : "running", job });
  }, []);

  const fail = useCallback((e: unknown) => {
    if ((e as Error).name === "AbortError") return;
    setState({ phase: "error", code: e instanceof BannerApiError ? e.code : "INTERNAL", message: e instanceof BannerApiError ? e.message : "L'analyse a échoué. Réessayez." });
  }, []);

  /** Interroge le serveur tant que `until` n'est pas satisfait. */
  const follow = useCallback(
    async (id: string, signal: AbortSignal, until: (job: BannerJobView) => boolean): Promise<BannerJobView> => {
      for (;;) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        if (signal.aborted) throw Object.assign(new Error("abandon"), { name: "AbortError" });
        const job = await call(`/api/banners/${id}`, { signal });
        accept(job);
        if (until(job)) return job;
      }
    },
    [accept],
  );

  const release = useCallback(() => {
    abort.current?.abort();
    if (jobId.current) void fetch(`/api/banners/${jobId.current}`, { method: "DELETE", keepalive: true }).catch(() => undefined);
    jobId.current = null;
    detectionKey.current = "";
  }, []);

  const start = useCallback(async () => {
    release();
    const controller = new AbortController();
    abort.current = controller;
    setItems([]);
    setState({ phase: "starting" });
    try {
      const res = await createRef.current(controller.signal);
      const body = (await res.json().catch(() => null)) as BannerJobView | ApiErrorBody | null;
      if (!res.ok || !body || "error" in body) {
        const err = body && "error" in body ? body.error : null;
        throw new BannerApiError(err?.message ?? `Le serveur a répondu avec une erreur (${res.status}).`, err?.code ?? "HTTP");
      }
      accept(body);
      if (body.status !== "ready" && body.status !== "error") await follow(body.id, controller.signal, (j) => j.status === "ready" || j.status === "error");
    } catch (e) {
      if ((e as Error).name === "TypeError") fail(new BannerApiError("Connexion au serveur impossible. Vérifiez votre réseau et réessayez.", "NETWORK"));
      else fail(e);
    }
  }, [accept, fail, follow, release]);

  const setSensitivity = useCallback(
    async (sensitivity: BannerSensitivity) => {
      if (!jobId.current) return;
      try {
        accept(await call(`/api/banners/${jobId.current}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sensitivity }) }));
      } catch (e) {
        fail(e);
      }
    },
    [accept, fail],
  );

  /** Demande l'archive des bannières données et attend qu'elle soit prête. */
  const prepareZip = useCallback(
    async (selection: { index: number; start: number; end: number }[], signal: AbortSignal): Promise<BannerJobView> => {
      const id = jobId.current;
      if (!id) throw new BannerApiError("Analyse introuvable.", "EXPIRED");
      const job = await call(`/api/banners/${id}/export`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: selection }), signal });
      accept(job);
      return follow(id, signal, (j) => j.export?.status !== "running");
    },
    [accept, follow],
  );

  // Fermeture du résultat ou de la page : les fichiers temporaires sont supprimés tout de suite.
  useEffect(() => release, [release]);

  return { state, items, setItems, start, setSensitivity, prepareZip };
}

export type BannerJobHandle = ReturnType<typeof useBannerJob>;
