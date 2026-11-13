"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowDownUp, ArrowLeft, Check, CircleDot, Inbox, Loader2, LogOut, Mail, RefreshCw, Reply, Search, Send, X } from "lucide-react";
import { CATEGORIES, categoryLabel, LIMITS, STATUSES, statusLabel, type StatusId, type Ticket, type TicketEvent, type TicketList } from "@/lib/support-shared";
import type { ApiErrorBody } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";
import { Button } from "./ui/button";
import { Field, Input, Notice, Select, Textarea } from "./ui/field";

type EmailState = { configured: boolean; missing: string[]; from: string | null };
type ListResponse = TicketList & { email: EmailState };
type Detail = { ticket: Ticket; events: TicketEvent[] };

const statusTone: Record<StatusId, string> = {
  new: "bg-brand-soft text-brand-dark",
  in_progress: "bg-[#e8eef5] text-[#2f4d6e]",
  waiting: "bg-warn-soft text-warn",
  resolved: "bg-[#eceeea] text-ink",
  closed: "bg-canvas text-muted",
};

const fmtDate = (iso: string) => new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

function StatusBadge({ status }: { status: StatusId }) {
  return <span className={cn("inline-flex h-6 items-center whitespace-nowrap rounded-full px-2.5 text-xs font-medium", statusTone[status])}>{statusLabel(status)}</span>;
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: init?.body ? { "Content-Type": "application/json" } : undefined, cache: "no-store" });
  const body = (await res.json().catch(() => null)) as T | ApiErrorBody | null;
  if (res.status === 401) {
    window.location.assign("/fondateur/connexion");
    throw new Error("Session expirée.");
  }
  if (!res.ok || !body || (typeof body === "object" && "error" in body)) {
    const err = body && typeof body === "object" && "error" in body ? body.error : null;
    throw Object.assign(new Error(err?.message ?? "Le serveur a répondu de façon inattendue."), { fields: err?.fields, code: err?.code });
  }
  return body as T;
}

export function SupportCenter({ founderEmail }: { founderEmail: string }) {
  const [status, setStatus] = useState<StatusId | "">("");
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"desc" | "asc">("desc");
  const [list, setList] = useState<ListResponse | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ sort });
      if (status) p.set("status", status);
      if (category) p.set("category", category);
      if (q) p.set("q", q);
      setList(await api<ListResponse>(`/api/founder/tickets?${p}`));
      setListError(null);
    } catch (e) {
      setListError((e as Error).message);
    }
    setLoading(false);
  }, [status, category, q, sort]);

  useEffect(() => {
    void load();
  }, [load]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    window.location.assign("/");
  }

  const counts = list?.counts;
  const nav: { id: StatusId | ""; label: string; count?: number }[] = [{ id: "", label: "Toutes les demandes", count: list?.total }, ...STATUSES.map((s) => ({ id: s.id, label: s.label, count: counts?.[s.id] }))];
  const filtered = !!(status || category || q);

  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-canvas lg:flex-row">
      {/* Navigation latérale */}
      <aside className="border-b border-line bg-white lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-64 lg:shrink-0 lg:flex-col lg:border-b-0 lg:border-r">
        <div className="flex h-16 items-center justify-between px-5">
          <Logo />
          <button type="button" onClick={logout} className="flex h-10 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-muted transition-colors hover:bg-canvas hover:text-ink lg:hidden">
            <LogOut className="h-4 w-4" /> Déconnexion
          </button>
        </div>
        <nav aria-label="Statuts" className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-1 lg:flex-col lg:overflow-visible lg:pb-0 lg:pt-2">
          <p className="hidden px-2.5 pb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted lg:block">Centre de support</p>
          {nav.map((n) => (
            <button
              key={n.id || "all"}
              type="button"
              aria-current={status === n.id ? "page" : undefined}
              onClick={() => {
                setStatus(n.id);
                setOpenId(null);
              }}
              className={cn(
                "flex h-10 shrink-0 cursor-pointer items-center justify-between gap-3 whitespace-nowrap rounded-lg px-2.5 text-sm transition-colors",
                status === n.id ? "bg-brand-soft font-medium text-brand-dark" : "text-ink hover:bg-canvas",
              )}
            >
              <span className="flex items-center gap-2.5">
                {n.id === "" ? <Inbox className="h-4 w-4" /> : <CircleDot className="h-4 w-4 opacity-60" />}
                {n.label}
              </span>
              <span className={cn("min-w-6 rounded-full px-1.5 text-center text-xs tabular-nums", status === n.id ? "bg-white text-brand-dark" : "bg-canvas text-muted")}>{n.count ?? "–"}</span>
            </button>
          ))}
        </nav>
        <div className="hidden border-t border-line p-3 lg:block">
          <p className="truncate px-2.5 text-xs text-muted" title={founderEmail}>
            {founderEmail}
          </p>
          <Link href="/" className="mt-1 flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm text-ink transition-colors hover:bg-canvas">
            <ArrowLeft className="h-4 w-4" /> Retour au site
          </Link>
          <button type="button" onClick={logout} className="flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-sm text-ink transition-colors hover:bg-canvas">
            <LogOut className="h-4 w-4" /> Déconnexion
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="mx-auto max-w-6xl">
          {openId ? (
            <TicketDetail id={openId} email={list?.email ?? null} onBack={() => setOpenId(null)} onChanged={load} />
          ) : (
            <>
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-semibold tracking-tight text-ink">Centre de support</h1>
                  <p className="mt-1 text-sm text-muted">Demandes envoyées depuis le Centre d'assistance du site.</p>
                </div>
                <Button variant="secondary" size="sm" onClick={load} disabled={loading}>
                  <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Actualiser
                </Button>
              </div>

              {/* Compteurs */}
              <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
                {nav.map((n) => (
                  <div key={n.id || "all"} className="rounded-xl border border-line bg-white px-4 py-3" data-testid={`count-${n.id || "all"}`}>
                    <dt className="truncate text-xs text-muted">{n.id === "" ? "Total" : n.label}</dt>
                    <dd className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-ink">{n.count ?? "–"}</dd>
                  </div>
                ))}
              </dl>

              {list && !list.email.configured && (
                <Notice tone="warn" className="mt-5" title="Réponses par e-mail non configurées" icon={<Mail className="h-4.5 w-4.5" />}>
                  Variables d'environnement manquantes sur le serveur : <span className="font-mono text-[13px]">{list.email.missing.join(", ")}</span>. Tant qu'elles ne sont pas définies, aucune réponse ne peut être envoyée.
                </Notice>
              )}

              {/* Filtres */}
              <div className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
                  <Input type="search" aria-label="Rechercher une demande" placeholder="Rechercher : identifiant, e-mail, sujet…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
                </div>
                <Select aria-label="Filtrer par catégorie" value={category} onChange={(e) => setCategory(e.target.value)} className="sm:w-64">
                  <option value="">Toutes les catégories</option>
                  {CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </Select>
                <Select aria-label="Filtrer par statut" value={status} onChange={(e) => setStatus(e.target.value as StatusId | "")} className="sm:w-52">
                  <option value="">Tous les statuts</option>
                  {STATUSES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              </div>

              {/* Liste */}
              <div className="mt-4 overflow-hidden rounded-2xl border border-line bg-white">
                <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 text-sm sm:px-5">
                  <p className="text-muted" data-testid="result-count">
                    {list ? `${list.tickets.length} demande${list.tickets.length > 1 ? "s" : ""}${filtered ? " correspondante" + (list.tickets.length > 1 ? "s" : "") : ""}` : "Chargement…"}
                  </p>
                  <button type="button" onClick={() => setSort((s) => (s === "desc" ? "asc" : "desc"))} className="flex h-9 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 font-medium text-ink transition-colors hover:bg-canvas">
                    <ArrowDownUp className="h-3.5 w-3.5" /> {sort === "desc" ? "Plus récentes d'abord" : "Plus anciennes d'abord"}
                  </button>
                </div>

                {listError ? (
                  <div className="p-5">
                    <Notice tone="danger" title="Les demandes n'ont pas pu être chargées" icon={<AlertCircle className="h-4.5 w-4.5" />}>
                      {listError}
                    </Notice>
                  </div>
                ) : !list ? (
                  <div className="flex items-center justify-center gap-2 p-12 text-sm text-muted">
                    <Loader2 className="h-4 w-4 animate-spin" /> Chargement des demandes…
                  </div>
                ) : list.tickets.length === 0 ? (
                  <div className="px-5 py-14 text-center">
                    <Inbox className="mx-auto h-7 w-7 text-muted/60" strokeWidth={1.5} />
                    <p className="mt-3 text-sm font-medium text-ink">{filtered ? "Aucune demande ne correspond à ces critères" : "Aucune demande pour le moment"}</p>
                    <p className="mt-1 text-sm text-muted">{filtered ? "Modifiez la recherche ou les filtres." : "Les demandes envoyées depuis le site apparaîtront ici."}</p>
                  </div>
                ) : (
                  <>
                    <div className="hidden grid-cols-[7.5rem_minmax(0,1.6fr)_minmax(0,1.1fr)_minmax(0,1.2fr)_9.5rem_10.5rem] gap-4 border-b border-line bg-canvas/50 px-5 py-2.5 text-xs font-medium text-muted lg:grid">
                      <span>Identifiant</span>
                      <span>Sujet</span>
                      <span>Catégorie</span>
                      <span>E-mail</span>
                      <span>Date</span>
                      <span>Statut</span>
                    </div>
                    <ul className={cn("divide-y divide-line", loading && "opacity-60")}>
                      {list.tickets.map((t) => (
                        <li key={t.id}>
                          <button type="button" onClick={() => setOpenId(t.id)} data-testid="ticket-row" className="block w-full cursor-pointer px-4 py-3.5 text-left transition-colors hover:bg-canvas/60 focus-visible:bg-canvas/60 sm:px-5 lg:grid lg:grid-cols-[7.5rem_minmax(0,1.6fr)_minmax(0,1.1fr)_minmax(0,1.2fr)_9.5rem_10.5rem] lg:items-center lg:gap-4">
                            <span className="flex items-center justify-between gap-3 lg:block">
                              <span className="font-mono text-[13px] text-muted">{t.id}</span>
                              <span className="lg:hidden">
                                <StatusBadge status={t.status} />
                              </span>
                            </span>
                            <span className="mt-1.5 block truncate text-sm font-medium text-ink lg:mt-0">{t.subject}</span>
                            <span className="mt-0.5 block truncate text-sm text-muted lg:mt-0">{categoryLabel(t.category)}</span>
                            <span className="block truncate text-sm text-muted">{t.email}</span>
                            <span className="mt-1 block text-xs text-muted lg:mt-0 lg:text-[13px]">{fmtDate(t.createdAt)}</span>
                            <span className="hidden lg:block">
                              <StatusBadge status={t.status} />
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

/* ---------- Détail d'une demande ---------- */

function TicketDetail({ id, email, onBack, onChanged }: { id: string; email: EmailState | null; onBack: () => void; onChanged: () => void }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [replying, setReplying] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api<Detail>(`/api/founder/tickets/${id}`).then(
      (d) => alive && setDetail(d),
      (e: Error) => alive && setError(e.message),
    );
    return () => {
      alive = false;
    };
  }, [id]);

  async function changeStatus(next: StatusId) {
    setSaving(true);
    setError(null);
    setFlash(null);
    try {
      setDetail(await api<Detail>(`/api/founder/tickets/${id}`, { method: "PATCH", body: JSON.stringify({ status: next }) }));
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    }
    setSaving(false);
  }

  const back = (
    <button type="button" onClick={onBack} className="-ml-2 flex h-9 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-muted transition-colors hover:bg-white hover:text-ink">
      <ArrowLeft className="h-4 w-4" /> Toutes les demandes
    </button>
  );

  if (!detail) {
    return (
      <div>
        {back}
        {error ? (
          <Notice tone="danger" className="mt-4" title="Demande introuvable" icon={<AlertCircle className="h-4.5 w-4.5" />}>
            {error}
          </Notice>
        ) : (
          <div className="flex items-center justify-center gap-2 p-16 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Chargement de la demande…
          </div>
        )}
      </div>
    );
  }

  const { ticket, events } = detail;
  return (
    <div data-testid="ticket-detail">
      {back}
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-mono text-[13px] text-muted">{ticket.id}</span>
            <StatusBadge status={ticket.status} />
          </div>
          <h1 className="mt-2 text-xl font-semibold leading-7 tracking-tight text-ink sm:text-2xl">{ticket.subject}</h1>
        </div>
        <Button onClick={() => { setReplying(true); setFlash(null); }} disabled={replying}>
          <Reply className="h-4 w-4" /> Répondre
        </Button>
      </div>

      {flash && (
        <Notice tone="success" className="tf-rise mt-5" icon={<Check className="h-4.5 w-4.5" />}>
          <span data-testid="reply-sent">{flash}</span>
        </Notice>
      )}
      {error && (
        <Notice tone="danger" className="mt-5" icon={<AlertCircle className="h-4.5 w-4.5" />}>
          {error}
        </Notice>
      )}

      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-5">
          <section className="rounded-2xl border border-line bg-white p-5 sm:p-6">
            <h2 className="text-sm font-semibold text-ink">Description</h2>
            <p className="mt-3 whitespace-pre-wrap break-words text-[15px] leading-7 text-ink">{ticket.description}</p>
          </section>

          {replying && (
            <ReplyComposer
              ticket={ticket}
              email={email}
              onCancel={() => setReplying(false)}
              onSent={(d) => {
                setDetail(d);
                setReplying(false);
                setFlash(`Réponse envoyée à ${ticket.email}. La demande est passée en « ${statusLabel(d.ticket.status)} ».`);
                onChanged();
              }}
            />
          )}

          <section className="rounded-2xl border border-line bg-white p-5 sm:p-6">
            <h2 className="text-sm font-semibold text-ink">Historique</h2>
            <ol className="mt-4 space-y-5" data-testid="history">
              {events.map((ev) => (
                <li key={ev.id} className="relative pl-6">
                  <span className={cn("absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full", ev.type === "reply_sent" ? "bg-brand" : "bg-line ring-1 ring-[#c9d0c8]")} />
                  <p className="text-sm text-ink">
                    {ev.type === "created" && "Demande reçue"}
                    {ev.type === "status_changed" && (
                      <>
                        Statut modifié : {statusLabel(ev.data.from)} → <span className="font-medium">{statusLabel(ev.data.to)}</span>
                      </>
                    )}
                    {ev.type === "reply_sent" && (
                      <>
                        Réponse envoyée par e-mail à <span className="font-medium">{ev.data.to}</span>
                      </>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">{fmtDate(ev.createdAt)}</p>
                  {ev.type === "reply_sent" && (
                    <div className="mt-2.5 rounded-xl border border-line bg-canvas/60 p-4">
                      <p className="text-sm font-medium text-ink">{ev.data.subject}</p>
                      <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-6 text-ink/85">{ev.data.message}</p>
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="space-y-5">
          <section className="rounded-2xl border border-line bg-white p-5">
            <label htmlFor="ticket-status" className="text-sm font-semibold text-ink">
              Statut actuel
            </label>
            <Select id="ticket-status" className="mt-2.5" value={ticket.status} disabled={saving} onChange={(e) => changeStatus(e.target.value as StatusId)}>
              {STATUSES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
          </section>
          <section className="rounded-2xl border border-line bg-white p-5">
            <h2 className="text-sm font-semibold text-ink">Informations</h2>
            <dl className="mt-3 space-y-3.5 text-sm">
              <Info label="E-mail" value={ticket.email} />
              <Info label="Catégorie" value={categoryLabel(ticket.category)} />
              <Info label="Lien TikTok" value={ticket.tiktokUrl ?? "Non renseigné"} mono={!!ticket.tiktokUrl} copy={ticket.tiktokUrl ?? undefined} />
              <Info label="Reçue le" value={fmtDate(ticket.createdAt)} />
              <Info label="Dernière mise à jour" value={fmtDate(ticket.updatedAt)} />
            </dl>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Info({ label, value, mono, copy }: { label: string; value: string; mono?: boolean; copy?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <dt className="flex items-center justify-between gap-2 text-xs text-muted">
        {label}
        {copy && (
          <button type="button" onClick={() => navigator.clipboard?.writeText(copy).then(() => setCopied(true), () => undefined)} className="cursor-pointer font-medium text-brand hover:underline">
            {copied ? "Copié" : "Copier"}
          </button>
        )}
      </dt>
      <dd className={cn("mt-0.5 break-words text-ink", mono && "break-all font-mono text-[13px]")}>{value}</dd>
    </div>
  );
}

/* ---------- Réponse par e-mail ---------- */

function ReplyComposer({ ticket, email, onCancel, onSent }: { ticket: Ticket; email: EmailState | null; onCancel: () => void; onSent: (d: Detail) => void }) {
  const [subject, setSubject] = useState(`Re: ${ticket.subject} [${ticket.id}]`);
  const [message, setMessage] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const blocked = email !== null && !email.configured;

  useEffect(() => {
    area.current?.focus();
  }, []);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});
    try {
      onSent(await api<Detail>(`/api/founder/tickets/${ticket.id}/reply`, { method: "POST", body: JSON.stringify({ subject, message }) }));
      return;
    } catch (err) {
      const e2 = err as Error & { fields?: Record<string, string> };
      setFields(e2.fields ?? {});
      setError(e2.fields ? null : e2.message);
    }
    setBusy(false);
  }

  return (
    <form onSubmit={send} noValidate className="tf-rise rounded-2xl border border-brand/30 bg-white p-5 sm:p-6" data-testid="reply-composer">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-ink">Répondre par e-mail</h2>
        <button type="button" onClick={onCancel} aria-label="Fermer la réponse" className="-mr-2 flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-canvas hover:text-ink">
          <X className="h-4 w-4" />
        </button>
      </div>
      {blocked && (
        <Notice tone="warn" className="mt-4" title="Envoi impossible : fournisseur d'e-mails non configuré" icon={<Mail className="h-4.5 w-4.5" />}>
          Définissez <span className="font-mono text-[13px]">{email.missing.join(", ")}</span> dans les variables d'environnement du serveur, puis redéployez.
        </Notice>
      )}
      <div className="mt-4 space-y-4">
        <Field label="Destinataire" htmlFor="reply-to" hint={email?.from ? `Expéditeur : ${email.from}` : undefined}>
          <Input id="reply-to" value={ticket.email} readOnly className="bg-canvas text-muted" />
        </Field>
        <Field label="Sujet" htmlFor="reply-subject" error={fields.subject}>
          <Input id="reply-subject" value={subject} maxLength={200} onChange={(e) => setSubject(e.target.value)} aria-invalid={!!fields.subject} />
        </Field>
        <Field label="Message" htmlFor="reply-message" error={fields.message}>
          <Textarea ref={area} id="reply-message" rows={8} maxLength={LIMITS.replyMessage} value={message} onChange={(e) => setMessage(e.target.value)} aria-invalid={!!fields.message} placeholder="Bonjour,…" />
        </Field>
      </div>
      {error && (
        <Notice tone="danger" className="mt-4" title="L'e-mail n'a pas été envoyé" icon={<AlertCircle className="h-4.5 w-4.5" />}>
          {error}
        </Notice>
      )}
      <div className="mt-5 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>
          Annuler
        </Button>
        <Button type="submit" disabled={busy || blocked}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {busy ? "Envoi…" : "Envoyer"}
        </Button>
      </div>
    </form>
  );
}
