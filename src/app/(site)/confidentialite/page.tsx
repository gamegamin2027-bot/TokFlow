import Link from "next/link";
import type { Metadata } from "next";
import { PageShell } from "@/components/page-shell";

export const metadata: Metadata = { title: "Confidentialité", description: "Politique de confidentialité de TokFlow." };

export default function Privacy() {
  return (
    <PageShell eyebrow="Légal" title="Politique de confidentialité" intro="TokFlow est conçu pour fonctionner avec le minimum de données. Dernière mise à jour : 13 novembre 2026.">
      <h2>Données traitées</h2>
      <ul>
        <li><strong>Liens soumis.</strong> Le lien que vous collez est transmis à notre serveur pour analyse, puis à TikTok pour récupérer les informations publiques de la vidéo. Il n'est pas enregistré dans une base de données.</li>
        <li><strong>Fichiers.</strong> Les vidéos récupérées ou importées sont écrites dans un dossier temporaire, converties, transmises à votre navigateur, puis supprimées dès la fin du transfert.</li>
        <li><strong>Adresse IP.</strong> Elle est utilisée en mémoire, de façon éphémère, pour limiter le nombre de requêtes et protéger le service contre les abus. Elle peut figurer dans les journaux techniques de notre hébergeur.</li>
      </ul>
      <h2>Demandes d'assistance</h2>
      <p>Lorsque vous envoyez une demande depuis le Centre d'assistance, nous enregistrons dans notre base de données la catégorie, votre adresse e-mail, le lien TikTok éventuellement indiqué, le sujet et la description. Ces informations servent uniquement à traiter la demande et à vous répondre par e-mail. Vous pouvez en demander la suppression à tout moment en ouvrant une nouvelle demande.</p>
      <h2>Ce que nous ne faisons pas</h2>
      <ul>
        <li>Aucun compte visiteur, aucun historique de téléchargements.</li>
        <li>Aucun cookie publicitaire ni traceur tiers. Le seul cookie du site est celui de la session de l'administrateur.</li>
        <li>Aucune revente ni partage de données à des fins commerciales.</li>
      </ul>
      <h2>Services tiers</h2>
      <p>Le site et sa base de données sont hébergés par Render. Les réponses aux demandes d'assistance sont envoyées par un prestataire d'e-mails transactionnels (Resend). Si vous lancez l'aperçu d'une vidéo, le lecteur officiel de TikTok est chargé depuis tiktok.com : TikTok peut alors déposer ses propres cookies et collecter des données selon sa propre politique. Le lecteur n'est chargé qu'après votre clic.</p>
      <h2>Vos droits</h2>
      <p>Conformément au RGPD, vous disposez de droits d'accès, de rectification, d'effacement et d'opposition. Pour les exercer, écrivez-nous depuis le <Link href="/assistance">Centre d'assistance</Link>.</p>
      <h2>Modifications</h2>
      <p>Cette politique peut évoluer avec le service. La date de mise à jour figure en haut de page.</p>
    </PageShell>
  );
}
