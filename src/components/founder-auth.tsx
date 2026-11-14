"use client";

import { useState } from "react";
import { AlertCircle, Loader2, LockKeyhole } from "lucide-react";
import type { ApiErrorBody } from "@/lib/types";
import { Logo } from "./logo";
import { Button } from "./ui/button";
import { Field, Input, Notice } from "./ui/field";

/**
 * Écran d'accès fondateur.
 * - "setup" : création du compte, proposée uniquement tant qu'aucun fondateur n'existe.
 * - "login" : connexion du fondateur existant (aucune inscription possible).
 */
export function FounderAuth({ mode }: { mode: "setup" | "login" }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const setup = mode === "setup";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (setup && password !== confirm) {
      setFields({ confirm: "Les deux mots de passe ne correspondent pas." });
      return;
    }
    setFields({});
    setBusy(true);
    try {
      const res = await fetch(`/api/auth/${setup ? "setup" : "login"}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      if (res.ok) {
        window.location.assign("/fondateur");
        return;
      }
      const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
      setFields(body?.error?.fields ?? {});
      setError(body?.error?.fields ? null : (body?.error?.message ?? "Une erreur est survenue. Réessayez."));
    } catch {
      setError("Connexion au serveur impossible. Vérifiez votre réseau et réessayez.");
    }
    setBusy(false);
  }

  return (
    <main className="flex flex-1 items-center justify-center px-5 py-12">
      <div className="w-full max-w-[420px]">
        <div className="flex justify-center">
          <Logo />
        </div>
        <div className="mt-8 rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-8">
          <span className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-brand-soft text-brand">
            <LockKeyhole className="h-5 w-5" strokeWidth={1.75} />
          </span>
          <h1 className="mt-5 text-[22px] font-semibold tracking-tight text-ink">{setup ? "Créez le compte fondateur" : "Espace fondateur"}</h1>
          <p className="mt-2 text-sm leading-6 text-muted">
            {setup
              ? "TokFlow vient d'être installé. Le premier compte créé devient l'unique compte fondateur ; l'inscription sera ensuite fermée définitivement."
              : "Connectez-vous avec le compte fondateur. Aucune inscription n'est possible."}
          </p>

          <form onSubmit={submit} noValidate className="mt-6 space-y-4">
            <Field label="Adresse e-mail" htmlFor="auth-email" error={fields.email}>
              <Input id="auth-email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!fields.email} placeholder="vous@exemple.fr" />
            </Field>
            <Field label="Mot de passe" htmlFor="auth-password" error={fields.password} hint={setup ? "10 caractères minimum. Conservez-le : il n'existe pas de récupération automatique." : undefined}>
              <Input id="auth-password" type="password" autoComplete={setup ? "new-password" : "current-password"} required value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={!!fields.password} />
            </Field>
            {setup && (
              <Field label="Confirmez le mot de passe" htmlFor="auth-confirm" error={fields.confirm}>
                <Input id="auth-confirm" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-invalid={!!fields.confirm} />
              </Field>
            )}
            {error && (
              <Notice tone="danger" icon={<AlertCircle className="h-4.5 w-4.5" />}>
                {error}
              </Notice>
            )}
            <Button type="submit" size="lg" className="w-full" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {setup ? "Créer le compte fondateur" : "Se connecter"}
            </Button>
          </form>
        </div>
      </div>
    </main>
  );
}
