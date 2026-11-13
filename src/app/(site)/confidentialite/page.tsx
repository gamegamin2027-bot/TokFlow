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
        <li><strong>Fichiers.</strong> Les vidéos récupérées ou importées sont écrites dans un dossier temporaire, converties, transmises à votre navigateur, puis supprimées dès la fin du transfert. Les bannières d'un carrousel restent dans ce dossier temporaire le temps de votre sélection, vingt minutes au plus après la dernière utilisation, puis sont supprimées.</li>
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
      <p><strong>Animations des bannières.</strong> TikTok ne publie pas les animations des bannières (« Live Photos ») sur ses pages publiques. Pour les retrouver, l'adresse de la publication, et rien d'autre, est transmise à TikWM (tikwm.com), un service tiers indépendant, non officiel et sans lien avec TikTok ni avec TokFlow. Notre serveur l'interroge d'abord ; lorsque TikWM refuse notre serveur, c'est votre navigateur qui l'interroge directement. Dans ce second cas, TikWM reçoit, comme tout site que vous consultez, votre adresse IP et les informations techniques de votre navigateur, en plus de l'adresse de la publication ; aucun cookie ni identifiant TokFlow ne lui est transmis. Ce service n'est interrogé que pour les carrousels, jamais pour les vidéos. Il ne publie pas de durée de conservation des adresses reçues ; sa politique figure sur son site. Les fichiers eux-mêmes sont ensuite téléchargés par notre serveur auprès de TikTok.</p>
      <h2>Vos droits</h2>
      <p>Conformément au RGPD, vous disposez de droits d'accès, de rectification, d'effacement et d'opposition. Pour les exercer, écrivez-nous depuis le <Link href="/assistance">Centre d'assistance</Link>.</p>
      <h2>Modifications</h2>
      <p>Cette politique peut évoluer avec le service. La date de mise à jour figure en haut de page.</p>
    </PageShell>
  );
}
