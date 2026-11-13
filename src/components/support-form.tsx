"use client";

import { useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Copy, Loader2, Send } from "lucide-react";
import { CATEGORIES, LIMITS } from "@/lib/support-shared";
import type { ApiErrorBody } from "@/lib/types";
import { Button } from "./ui/button";
import { Field, Input, Notice, Select, Textarea } from "./ui/field";

const empty = { category: "", email: "", tiktokUrl: "", subject: "", description: "", website: "" };

/** Formulaire du Centre d'assistance. La confirmation n'apparaît qu'après enregistrement réel de la demande. */
export function SupportForm() {
  const [values, setValues] = useState(empty);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ id: string; email: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const set = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setValues((v) => ({ ...v, [k]: e.target.value }));
    if (fields[k]) setFields((f) => Object.fromEntries(Object.entries(f).filter(([key]) => key !== k)));
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/support", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
      const body = (await res.json().catch(() => null)) as { id?: string } | ApiErrorBody | null;
      if (res.status === 201 && body && "id" in body && body.id) {
        setDone({ id: body.id, email: values.email.trim() });
        setValues(empty);
        setFields({});
      } else {
        const err = body && "error" in body ? body.error : null;
        setFields(err?.fields ?? {});
        setError(err?.fields ? "Certains champs sont à corriger avant l'envoi." : (err?.message ?? "Votre demande n'a pas pu être enregistrée. Réessayez dans un instant."));
        if (err?.fields) requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>("[aria-invalid=true]")?.focus());
      }
    } catch {
      setError("Connexion au serveur impossible. Votre demande n'a pas été envoyée.");
    }
    setBusy(false);
  }

  if (done) {
    return (
      <div className="tf-rise rounded-2xl border border-line bg-white p-6 text-center sm:p-10" data-testid="support-confirmation">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-soft text-brand">
          <CheckCircle2 className="h-6 w-6" strokeWidth={1.75} />
        </span>
        <h2 className="mt-5 text-xl font-semibold tracking-tight text-ink">Votre demande a bien été transmise</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">
          L'équipe TokFlow l'a reçue. Si une réponse est nécessaire, elle sera envoyée à <span className="font-medium text-ink">{done.email}</span>.
        </p>
        <div className="mx-auto mt-6 flex max-w-xs items-center justify-between gap-3 rounded-xl border border-line bg-canvas px-4 py-3 text-left">
          <div>
            <p className="text-xs text-muted">Identifiant de la demande</p>
            <p className="mt-0.5 font-mono text-[15px] font-medium text-ink" data-testid="ticket-id">
              {done.id}
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(done.id).then(() => setCopied(true), () => undefined)}
            className="flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-white px-2.5 text-xs font-medium text-ink transition-colors hover:border-[#c9d0c8]"
          >
            <Copy className="h-3.5 w-3.5" /> {copied ? "Copié" : "Copier"}
          </button>
        </div>
        <Button variant="secondary" className="mt-6" onClick={() => { setDone(null); setCopied(false); }}>
          Envoyer une autre demande
        </Button>
      </div>
    );
  }

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="rounded-2xl border border-line bg-white p-5 sm:p-8">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Catégorie de la demande" htmlFor="sf-category" error={fields.category}>
          <Select
            id="sf-category"
            value={values.category}
            onValueChange={(category) => {
              setValues((v) => ({ ...v, category }));
              setFields((f) => Object.fromEntries(Object.entries(f).filter(([key]) => key !== "category")));
            }}
            aria-invalid={!!fields.category}
            placeholder="Choisir une catégorie…"
            options={CATEGORIES.map((c) => ({ value: c.id, label: c.label }))}
          />
        </Field>
        <Field label="Adresse e-mail" htmlFor="sf-email" error={fields.email} hint="Uniquement pour vous répondre.">
          <Input id="sf-email" type="email" autoComplete="email" inputMode="email" placeholder="vous@exemple.fr" value={values.email} onChange={set("email")} aria-invalid={!!fields.email} required />
        </Field>
        <Field className="sm:col-span-2" label="Lien TikTok concerné" htmlFor="sf-url" optional error={fields.tiktokUrl} hint="Recommandé pour un problème technique : il nous permet de reproduire l'erreur.">
          <Input id="sf-url" type="url" inputMode="url" placeholder="https://www.tiktok.com/@compte/video/…" value={values.tiktokUrl} onChange={set("tiktokUrl")} aria-invalid={!!fields.tiktokUrl} />
        </Field>
        <Field className="sm:col-span-2" label="Sujet" htmlFor="sf-subject" error={fields.subject}>
          <Input id="sf-subject" maxLength={LIMITS.subject} placeholder="Résumez votre demande en une phrase" value={values.subject} onChange={set("subject")} aria-invalid={!!fields.subject} required />
        </Field>
        <Field className="sm:col-span-2" label="Description détaillée" htmlFor="sf-description" error={fields.description} hint={`${values.description.length} / ${LIMITS.description} caractères`}>
          <Textarea id="sf-description" rows={7} maxLength={LIMITS.description} placeholder="Que s'est-il passé ? Quel message s'est affiché ? Sur quel appareil ?" value={values.description} onChange={set("description")} aria-invalid={!!fields.description} required />
        </Field>
      </div>

      {/* Champ piège : invisible pour les visiteurs, rempli par les robots. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Site web
          <input tabIndex={-1} autoComplete="off" value={values.website} onChange={set("website")} />
        </label>
      </div>

      {error && (
        <Notice tone="danger" className="mt-5" icon={<AlertCircle className="h-4.5 w-4.5" />}>
          {error}
        </Notice>
      )}

      <div className="mt-6 flex flex-col-reverse items-stretch gap-4 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[13px] leading-5 text-muted">Aucun compte nécessaire. Vos informations ne servent qu'à traiter cette demande.</p>
        <Button type="submit" size="lg" disabled={busy} className="sm:min-w-[13rem]">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {busy ? "Envoi en cours…" : "Envoyer ma demande"}
        </Button>
      </div>
    </form>
  );
}
