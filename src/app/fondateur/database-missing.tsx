import { Database } from "lucide-react";
import { Logo } from "@/components/logo";

export function DatabaseMissing() {
  return (
    <main className="flex flex-1 items-center justify-center px-5 py-12">
      <div className="w-full max-w-[460px]">
        <div className="flex justify-center">
          <Logo />
        </div>
        <div className="mt-8 rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-8">
          <span className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-warn-soft text-warn">
            <Database className="h-5 w-5" strokeWidth={1.75} />
          </span>
          <h1 className="mt-5 text-[22px] font-semibold tracking-tight text-ink">Base de données non configurée</h1>
          <p className="mt-2 text-sm leading-6 text-muted">
            L'espace fondateur et le centre d'assistance ont besoin d'une base PostgreSQL. Ajoutez la variable d'environnement <code className="rounded bg-canvas px-1.5 py-0.5 font-mono text-[13px] text-ink">DATABASE_URL</code> au service, puis redéployez.
          </p>
        </div>
      </div>
    </main>
  );
}
