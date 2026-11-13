import type { Metadata } from "next";
import { Mail, ShieldAlert } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { buttonClass } from "@/components/ui/button";

export const metadata: Metadata = { title: "Contact", description: "Contacter l'équipe TokFlow." };

const email = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "contact@example.com";

export default function Contact() {
  return (
    <PageShell eyebrow="Contact" title="Parlons-en." intro="Une question, un problème avec un lien, une demande concernant vos droits ? Écrivez-nous, nous répondons par e-mail.">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-line p-5">
          <Mail className="h-5 w-5 text-brand" strokeWidth={1.75} />
          <h2 style={{ marginTop: "0.9rem" }}>Support et questions</h2>
          <p>Indiquez le lien concerné et le message d'erreur affiché pour un diagnostic plus rapide.</p>
          <a href={`mailto:${email}?subject=${encodeURIComponent("TokFlow — Support")}`} className={buttonClass("primary", "sm", "mt-4 !text-white !no-underline")}>
            {email}
          </a>
        </div>
        <div className="rounded-xl border border-line p-5">
          <ShieldAlert className="h-5 w-5 text-brand" strokeWidth={1.75} />
          <h2 style={{ marginTop: "0.9rem" }}>Droits d'auteur</h2>
          <p>Vous êtes créateur ou ayant droit et souhaitez signaler un usage abusif ? Précisez l'URL de la vidéo et votre qualité.</p>
          <a href={`mailto:${email}?subject=${encodeURIComponent("TokFlow — Droits d'auteur")}`} className={buttonClass("secondary", "sm", "mt-4 !text-ink !no-underline")}>
            Signaler un contenu
          </a>
        </div>
      </div>
    </PageShell>
  );
}
