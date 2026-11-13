import Link from "next/link";
import { Check, ClipboardPaste, Download, FileAudio, Gauge, MonitorSmartphone, ScanSearch, ShieldCheck, SlidersHorizontal, Video } from "lucide-react";
import { Retriever } from "@/components/retriever";
import { Faq, type FaqItem } from "@/components/faq";
import { buttonClass } from "@/components/ui/button";

const features = [
  { icon: Video, title: "Vidéo sans filigrane", text: "TokFlow récupère le flux d'origine : ni logo TikTok, ni nom de compte incrusté, avec la piste audio et sans ré-encodage." },
  { icon: FileAudio, title: "Audio MP3", text: "Extrayez uniquement la bande-son, en 128, 192 ou 320 kbps selon votre besoin." },
  { icon: SlidersHorizontal, title: "Meilleure qualité par défaut", text: "La meilleure définition disponible est présélectionnée. Vous pouvez en choisir une autre." },
  { icon: ScanSearch, title: "La vidéo s'affiche aussitôt", text: "Miniature, lecteur, auteur et durée apparaissent sur la page dès que le lien est collé." },
  { icon: MonitorSmartphone, title: "Sur tous vos appareils", text: "Une interface pensée pour le mobile, la tablette et l'ordinateur. Rien à installer." },
  { icon: ShieldCheck, title: "Sobre en données", text: "Pas de compte, pas d'historique. Les fichiers sont supprimés dès la fin du transfert." },
];

const steps = [
  { icon: ClipboardPaste, title: "Collez le lien", text: "Copiez le lien d'une vidéo TikTok publique depuis le menu Partager, puis collez-le dans le champ. C'est tout." },
  { icon: Gauge, title: "La vidéo apparaît", text: "TokFlow la récupère automatiquement et l'affiche avec ses informations, sans étape intermédiaire." },
  { icon: Download, title: "Téléchargez", text: "Un bouton pour la vidéo sans filigrane (MP4), un autre pour le son (MP3). Le fichier arrive sur votre appareil." },
];

const faq: FaqItem[] = [
  { q: "Comment TokFlow obtient-il une vidéo sans filigrane ?", a: "TokFlow ne gomme ni ne floute rien. Le logo et le nom du compte ne sont incrustés par TikTok que dans le fichier d'export « Enregistrer la vidéo ». TokFlow récupère à la place le flux de lecture public d'origine, dont l'image est intacte. Si seule une version avec filigrane est disponible pour une vidéo, TokFlow l'indique et ne la propose pas." },
  { q: "Quels liens TikTok sont pris en charge ?", a: "Les liens de vidéos publiques : tiktok.com/@compte/video/…, ainsi que les liens courts vm.tiktok.com et vt.tiktok.com. Les vidéos privées, supprimées, réservées aux abonnés ou soumises à une restriction d'accès ne sont pas accessibles." },
  { q: "Dois-je être l'auteur de la vidéo ?", a: "Non. TokFlow traite toute vidéo consultable publiquement. Vous restez toutefois responsable de l'usage du fichier : copie pour usage personnel, ou réutilisation avec l'accord du créateur. Consultez nos conditions d'utilisation." },
  { q: "Pourquoi un lien ne peut-il pas être traité ?", a: "Le plus souvent : la vidéo a été supprimée par son créateur, elle est privée, elle est restreinte dans la région du serveur, il s'agit d'un diaporama photo, ou TikTok est momentanément indisponible. TokFlow indique la raison précise et vous propose de convertir un fichier déjà enregistré sur votre appareil." },
  { q: "Quelle qualité vais-je obtenir ?", a: "Celle que TikTok met publiquement à disposition pour la vidéo, généralement jusqu'en 720p ou 1080p. TokFlow ne suréchantillonne jamais : aucune qualité artificielle n'est proposée." },
  { q: "Puis-je convertir un fichier que je possède déjà ?", a: "Oui. Cliquez sur « Convertir un fichier vidéo » pour importer un fichier (jusqu'à 200 Mo), puis extrayez l'audio en MP3 ou réduisez la définition en MP4. L'image n'est pas retouchée : un filigrane déjà présent dans le fichier est conservé." },
  { q: "Conservez-vous mes vidéos ou mes liens ?", a: "Non. Les fichiers sont traités dans un dossier temporaire puis supprimés dès la fin du transfert. Aucun compte ni historique n'est créé. Seules les demandes envoyées au Centre d'assistance sont enregistrées." },
  { q: "TokFlow est-il affilié à TikTok ?", a: "Non. TokFlow est un service indépendant. TikTok est une marque de ByteDance Ltd." },
];

export default function Home() {
  return (
    <main>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(60%_60%_at_50%_0%,#e6f0ea_0%,transparent_70%)]" />
        <div className="relative mx-auto max-w-6xl px-5 pb-16 pt-14 text-center sm:px-8 sm:pb-24 sm:pt-24">
          <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-line bg-white px-3 py-1 text-xs font-medium text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-brand" /> Gratuit · sans inscription
          </p>
          <h1 className="mx-auto mt-6 max-w-3xl text-balance text-[clamp(28px,9vw,38px)] font-semibold leading-[1.05] tracking-[-0.035em] text-ink sm:text-6xl lg:text-[68px]">
            Vos vidéos TikTok, <span className="text-brand">sans filigrane.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-[34rem] text-pretty text-base leading-7 text-muted sm:text-lg sm:leading-8">
            Collez le lien d'une vidéo publique et récupérez l'image d'origine, en MP4 avec le son ou en MP3.
          </p>
          <div className="mt-8 sm:mt-10">
            <Retriever />
          </div>
          <ul className="mx-auto mt-8 flex max-w-4xl flex-col items-center justify-center gap-x-7 gap-y-2 text-[13px] text-muted md:flex-row">
            {["Ni logo ni nom de compte incrusté", "Meilleure qualité disponible", "Fichiers supprimés après transfert"].map((t) => (
              <li key={t} className="inline-flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-brand" strokeWidth={2.5} /> {t}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Fonctionnalités */}
      <section id="fonctionnalites" className="border-t border-line bg-white">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
          <SectionHeading eyebrow="Fonctionnalités" title="L'essentiel, bien fait." text="Un seul champ, des options claires, et des fichiers propres. Rien de plus." />
          <ul className="mt-12 grid gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <li key={f.title} className="bg-white p-6 sm:p-7">
                <span className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-brand-soft text-brand">
                  <f.icon className="h-5 w-5" strokeWidth={1.75} />
                </span>
                <h3 className="mt-5 text-[15px] font-semibold text-ink">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-6 text-muted">{f.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Comment ça marche */}
      <section id="comment-ca-marche" className="border-t border-line">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
          <SectionHeading eyebrow="Comment ça marche" title="Trois étapes, quelques secondes." />
          <ol className="mt-12 grid gap-5 md:grid-cols-3">
            {steps.map((s, i) => (
              <li key={s.title} className="rounded-card border border-line bg-white p-6 sm:p-7">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-medium text-brand">0{i + 1}</span>
                  <s.icon className="h-5 w-5 text-muted" strokeWidth={1.75} />
                </div>
                <h3 className="mt-8 text-lg font-semibold tracking-tight text-ink">{s.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted">{s.text}</p>
              </li>
            ))}
          </ol>

          <div className="mt-5 flex flex-col gap-4 rounded-card border border-line bg-brand-soft/50 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-7">
            <div className="flex gap-4">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand" strokeWidth={1.75} />
              <div>
                <h3 className="text-[15px] font-semibold text-ink">Un usage responsable</h3>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">
                  TokFlow n'accède qu'aux vidéos publiques, sans compte ni contournement de restriction. Les contenus appartiennent à leurs créateurs : téléchargez pour votre usage personnel ou avec leur accord.
                </p>
              </div>
            </div>
            <Link href="/conditions" className={buttonClass("secondary", "md", "w-full sm:w-auto")}>
              Lire les conditions
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="border-t border-line bg-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-20 sm:px-8 sm:py-24 lg:grid-cols-[1fr_1.6fr]">
          <div>
            <SectionHeading align="left" eyebrow="FAQ" title="Questions fréquentes" text="Vous ne trouvez pas votre réponse ?" />
            <Link href="/assistance" className="mt-4 inline-block text-sm font-medium text-brand underline-offset-4 hover:underline">
              Ouvrir une demande
            </Link>
          </div>
          <Faq items={faq} />
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-line">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
          <div className="rounded-[20px] bg-ink px-6 py-14 text-center sm:px-12">
            <h2 className="mx-auto max-w-xl text-balance text-3xl font-semibold tracking-tight text-white sm:text-4xl">Un lien suffit.</h2>
            <p className="mx-auto mt-3 max-w-md text-[15px] leading-7 text-white/65">Collez-le : la vidéo et le son sont prêts à télécharger.</p>
            <Link href="/#telecharger" className={buttonClass("primary", "lg", "mt-8")}>
              Coller un lien
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

function SectionHeading({ eyebrow, title, text, align = "center" }: { eyebrow: string; title: string; text?: string; align?: "center" | "left" }) {
  return (
    <div className={align === "center" ? "mx-auto max-w-2xl text-center" : ""}>
      <p className="text-sm font-medium text-brand">{eyebrow}</p>
      <h2 className="mt-3 text-balance text-3xl font-semibold tracking-[-0.025em] text-ink sm:text-[40px] sm:leading-[1.1]">{title}</h2>
      {text && <p className="mt-4 text-base leading-7 text-muted">{text}</p>}
    </div>
  );
}
