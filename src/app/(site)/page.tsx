import Link from "next/link";
import { Check, FileAudio, Images, MonitorSmartphone, ScanSearch, ShieldCheck, Video } from "lucide-react";
import { Retriever } from "@/components/retriever";
import { Faq } from "@/components/faq";
import { buttonClass } from "@/components/ui/button";
import { getDictionary } from "@/lib/i18n/server";

const featureIcons = [Video, FileAudio, Images, ScanSearch, MonitorSmartphone, ShieldCheck];

export default async function Home() {
  const { t } = await getDictionary();
  const h = t.home;

  return (
    <main>
      {/* L'outil d'abord : titre, champ, résultat. */}
      <section className="bg-brand">
        <div className="mx-auto max-w-6xl px-5 pb-12 pt-10 text-center sm:px-8 sm:pb-16 sm:pt-16">
          <h1 className="mx-auto max-w-3xl text-balance text-[clamp(28px,8.6vw,38px)] font-semibold leading-[1.08] tracking-[-0.03em] text-white sm:text-[52px]">
            {h.h1[0]} {h.h1[1]}
          </h1>
          <p className="mx-auto mt-4 max-w-[36rem] text-pretty text-[15px] leading-7 text-white/80 sm:text-[17px]">{h.lead}</p>
          <div className="mt-7 sm:mt-9">
            <Retriever />
          </div>
          <ul className="mx-auto mt-7 flex w-fit max-w-4xl flex-col items-start gap-x-6 gap-y-1.5 text-[13px] text-white/80 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-center">
            {h.proofs.map((proof) => (
              <li key={proof} className="inline-flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-white" strokeWidth={2.5} aria-hidden /> {proof}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Comment ça marche */}
      <section id="comment-ca-marche">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
          <SectionHeading title={h.howTitle} text={h.howLead} />
          <ol className="mt-10 grid gap-8 md:grid-cols-3 md:gap-10">
            {h.steps.map((step, i) => (
              <li key={step.title} className="border-t-2 border-ink pt-5">
                <span className="text-[28px] font-semibold leading-none tracking-tight text-brand">{i + 1}</span>
                <h3 className="mt-3 text-lg font-semibold tracking-tight text-ink">{step.title}</h3>
                <p className="mt-2 text-[15px] leading-7 text-muted">{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Fonctionnalités */}
      <section id="fonctionnalites" className="border-t border-line bg-white">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
          <SectionHeading title={h.featuresTitle} text={h.featuresLead} />
          <ul className="mt-10 grid gap-x-10 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
            {h.features.map((feature, i) => {
              const Icon = featureIcons[i];
              return (
                <li key={feature.title}>
                  <Icon className="h-6 w-6 text-brand" strokeWidth={1.6} aria-hidden />
                  <h3 className="mt-3 text-base font-semibold text-ink">{feature.title}</h3>
                  <p className="mt-1.5 text-[15px] leading-7 text-muted">{feature.text}</p>
                </li>
              );
            })}
          </ul>

          <div className="mt-12 flex flex-col gap-5 rounded-card border border-line bg-canvas p-6 sm:flex-row sm:items-center sm:justify-between sm:p-7">
            <div>
              <h3 className="text-base font-semibold text-ink">{h.responsibleTitle}</h3>
              <p className="mt-1.5 max-w-2xl text-[15px] leading-7 text-muted">{h.responsibleText}</p>
            </div>
            <Link href="/conditions" className={buttonClass("secondary", "md", "w-full sm:w-auto")}>
              {h.readTerms}
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="border-t border-line">
        <div className="mx-auto grid max-w-6xl gap-8 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[1fr_1.7fr] lg:gap-12">
          <div>
            <SectionHeading title={h.faqTitle} text={h.faqLead} />
            <Link href="/assistance" className="mt-2 inline-block text-[15px] font-medium text-brand underline underline-offset-4 hover:text-brand-dark">
              {h.faqLink}
            </Link>
          </div>
          <Faq items={h.faq} />
        </div>
      </section>
    </main>
  );
}

function SectionHeading({ title, text }: { title: string; text?: string }) {
  return (
    <div className="max-w-2xl">
      <h2 className="text-balance text-[26px] font-semibold leading-[1.15] tracking-[-0.02em] text-ink sm:text-[34px]">{title}</h2>
      {text && <p className="mt-3 text-base leading-7 text-muted">{text}</p>}
    </div>
  );
}
