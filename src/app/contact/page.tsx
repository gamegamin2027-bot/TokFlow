import type { Metadata } from "next";
import { ArrowUpRight, Mail, ShieldAlert } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { buttonClass } from "@/components/ui/button";

export const metadata: Metadata = { title: "Contact", description: "Contacter l'équipe TokFlow." };

const email = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "contact@example.com";
const mailto = (subject: string) => `mailto:${email}?subject=${encodeURIComponent(subject)}`;

const channels = [
  { icon: Mail, title: "Support et questions", text: "Un lien qui ne passe pas, un fichier incomplet ? Indiquez le lien concerné et le message affiché.", cta: "Écrire au support", href: mailto("TokFlow — Support") },
  { icon: ShieldAlert, title: "Droits d'auteur", text: "Créateur ou ayant droit, vous souhaitez signaler un usage abusif ? Précisez l'URL de la vidéo.", cta: "Signaler un contenu", href: mailto("TokFlow — Droits d'auteur") },
];

export default function Contact() {
  return (
    <PageShell bare eyebrow="Contact" title="Parlons-en." intro="Une question, un problème avec un lien, une demande concernant vos droits ? Écrivez-nous, nous répondons par e-mail.">
      <ul className="grid gap-4 sm:grid-cols-2">
        {channels.map((c) => (
          <li key={c.title} className="flex flex-col rounded-card border border-line bg-white p-6 sm:p-7">
            <span className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-brand-soft text-brand">
              <c.icon className="h-5 w-5" strokeWidth={1.75} />
            </span>
            <h2 className="mt-5 text-[17px] font-semibold tracking-tight text-ink">{c.title}</h2>
            <p className="mt-1.5 flex-1 text-sm leading-6 text-muted">{c.text}</p>
            <a href={c.href} className={buttonClass("secondary", "md", "mt-6 w-full")}>
              {c.cta} <ArrowUpRight className="h-4 w-4 text-muted" />
            </a>
          </li>
        ))}
      </ul>
      <p className="mt-6 rounded-card border border-line bg-white px-6 py-4 text-sm text-muted">
        Adresse directe :{" "}
        <a href={`mailto:${email}`} className="font-medium text-ink underline decoration-line underline-offset-4 hover:decoration-ink">
          {email}
        </a>
      </p>
    </PageShell>
  );
}
