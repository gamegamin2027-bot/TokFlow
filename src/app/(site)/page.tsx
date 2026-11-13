import Link from "next/link";
import { Check, ClipboardPaste, Copy, Download, FileAudio, Images, MonitorSmartphone, ScanSearch, ShieldCheck, Video } from "lucide-react";
import { Retriever } from "@/components/retriever";
import { Faq } from "@/components/faq";
import { Reveal } from "@/components/reveal";
import { buttonClass } from "@/components/ui/button";
import { getDictionary } from "@/lib/i18n/server";

const featureIcons = [Video, FileAudio, Images, ScanSearch, MonitorSmartphone, ShieldCheck];
const stepIcons = [Copy, ClipboardPaste, Download];

export default async function Home() {
  const { t } = await getDictionary();
  const h = t.home;
  return (
    <main>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(60%_60%_at_50%_0%,#e6f0ea_0%,transparent_70%)]" />
        <div className="relative mx-auto max-w-6xl px-5 pb-16 pt-14 text-center sm:px-8 sm:pb-24 sm:pt-24">
          <p className="tf-enter mx-auto inline-flex items-center gap-2 rounded-full border border-line bg-white px-3 py-1 text-xs font-medium text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-brand" /> {h.badge}
          </p>
          <h1 style={{ animationDelay: "60ms" }} className="tf-enter mx-auto mt-6 max-w-3xl text-balance text-[clamp(28px,9vw,38px)] font-semibold leading-[1.05] tracking-[-0.035em] text-ink sm:text-6xl lg:text-[68px]">
            {h.h1[0]} <span className="text-brand">{h.h1[1]}</span>
          </h1>
          <p style={{ animationDelay: "120ms" }} className="tf-enter mx-auto mt-5 max-w-[34rem] text-pretty text-base leading-7 text-muted sm:text-lg sm:leading-8">
            {h.lead}
          </p>
          <div style={{ animationDelay: "180ms" }} className="tf-enter mt-8 sm:mt-10">
            <Retriever />
          </div>
          <ul style={{ animationDelay: "260ms" }} className="tf-enter mx-auto mt-8 flex max-w-4xl flex-col items-center justify-center gap-x-7 gap-y-2 text-[13px] text-muted md:flex-row">
            {h.proofs.map((proof) => (
              <li key={proof} className="inline-flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-brand" strokeWidth={2.5} /> {proof}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Fonctionnalités */}
      <section id="fonctionnalites" className="border-t border-line bg-white">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
          <SectionHeading eyebrow={h.featuresEyebrow} title={h.featuresTitle} text={h.featuresLead} />
          <ul className="mt-12 grid gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
            {h.features.map((f, i) => {
              const Icon = featureIcons[i];
              return (
              <Reveal as="li" key={f.title} delay={(i % 3) * 0.06} className="group bg-white p-6 transition-colors duration-200 hover:bg-[#fbfcfb] sm:p-7">
                <span className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-brand-soft text-brand transition-transform duration-300 ease-out group-hover:-translate-y-0.5">
                  <Icon className="h-5 w-5" strokeWidth={1.75} />
                </span>
                <h3 className="mt-5 text-[15px] font-semibold text-ink">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-6 text-muted">{f.text}</p>
              </Reveal>
              );
            })}
          </ul>
        </div>
      </section>

      {/* Comment ça marche */}
      <section id="comment-ca-marche" className="border-t border-line">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
          <SectionHeading eyebrow={h.howEyebrow} title={h.howTitle} />
          <ol className="mt-12 grid gap-5 md:grid-cols-3">
            {h.steps.map((s, i) => {
              const StepIcon = stepIcons[i];
              return (
              <Reveal as="li" key={s.title} delay={i * 0.08} className="rounded-card border border-line bg-white p-6 sm:p-7">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-medium text-brand">0{i + 1}</span>
                  <StepIcon className="h-5 w-5 text-muted" strokeWidth={1.75} />
                </div>
                <h3 className="mt-8 text-lg font-semibold tracking-tight text-ink">{s.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted">{s.text}</p>
              </Reveal>
              );
            })}
          </ol>

          <Reveal className="mt-5 flex flex-col gap-4 rounded-card border border-line bg-brand-soft/50 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-7">
            <div className="flex gap-4">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand" strokeWidth={1.75} />
              <div>
                <h3 className="text-[15px] font-semibold text-ink">{h.responsibleTitle}</h3>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">
                  {h.responsibleText}
                </p>
              </div>
            </div>
            <Link href="/conditions" className={buttonClass("secondary", "md", "w-full sm:w-auto")}>
              {h.readTerms}
            </Link>
          </Reveal>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="border-t border-line bg-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-20 sm:px-8 sm:py-24 lg:grid-cols-[1fr_1.6fr]">
          <div>
            <SectionHeading align="left" eyebrow={h.faqEyebrow} title={h.faqTitle} text={h.faqLead} />
            <Link href="/assistance" className="mt-4 inline-block text-sm font-medium text-brand underline-offset-4 hover:underline">
              {h.faqLink}
            </Link>
          </div>
          <Faq items={h.faq} />
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-line">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
          <Reveal className="rounded-[20px] bg-ink px-6 py-14 text-center sm:px-12">
            <h2 className="mx-auto max-w-xl text-balance text-3xl font-semibold tracking-tight text-white sm:text-4xl">{h.ctaTitle}</h2>
            <p className="mx-auto mt-3 max-w-md text-[15px] leading-7 text-white/65">{h.ctaText}</p>
            <Link href="/#telecharger" className={buttonClass("primary", "lg", "mt-8")}>
              {h.ctaButton}
            </Link>
          </Reveal>
        </div>
      </section>
    </main>
  );
}

function SectionHeading({ eyebrow, title, text, align = "center" }: { eyebrow: string; title: string; text?: string; align?: "center" | "left" }) {
  return (
    <Reveal className={align === "center" ? "mx-auto max-w-2xl text-center" : ""}>
      <p className="text-sm font-medium text-brand">{eyebrow}</p>
      <h2 className="mt-3 text-balance text-3xl font-semibold tracking-[-0.025em] text-ink sm:text-[40px] sm:leading-[1.1]">{title}</h2>
      {text && <p className="mt-4 text-base leading-7 text-muted">{text}</p>}
    </Reveal>
  );
}
