import type { Metadata } from "next";
import { Database } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { SupportForm } from "@/components/support-form";
import { Notice } from "@/components/ui/field";
import { databaseConfigured } from "@/lib/server/db";

export const metadata: Metadata = { title: "Centre d'assistance", description: "Envoyez votre demande à l'équipe TokFlow directement depuis le site." };

export default function Assistance() {
  return (
    <PageShell bare eyebrow="Assistance" title="Centre d'assistance TokFlow" intro="Un problème de téléchargement, une suggestion, une question ? Décrivez votre demande : elle est transmise directement à l'équipe.">
      {databaseConfigured() ? (
        <SupportForm />
      ) : (
        <Notice tone="warn" title="Le centre d'assistance est momentanément indisponible" icon={<Database className="h-4.5 w-4.5" />}>
          Les demandes ne peuvent pas être enregistrées pour le moment. Réessayez plus tard.
        </Notice>
      )}
    </PageShell>
  );
}
