"use client";

import { motion, useReducedMotion } from "motion/react";
import Image from "next/image";
import { useEffect, useState } from "react";
import { Banner } from "@/components/ui/Banner";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Disclosure } from "@/components/ui/Disclosure";
import { HeroBand } from "@/components/ui/Hero";
import { Icon } from "@/components/ui/Icon";
import { errorMessage, getFile, getJson, postJson, saveBlob } from "@/lib/client/api";
import { formatDate, formatMoney, formatMoneyExact, formatPercent } from "@/lib/format";
import { buildWhatsAppLink } from "@/lib/whatsapp";
import type { PublicProposal } from "@/types/api";

type Language = PublicProposal["language"];

/** The page's own wording. The Arabic was written without a native speaker: have it reviewed before real use. */
const EN = {
  preparedFor: "Prepared for",
  couldSave: "could save",
  aMonth: "a month",
  aYear: "a year",
  less: "less than today",
  today: "Today",
  withBcom: "With BCOM",
  perMonth: "per month",
  regions: "Where you save",
  shipments: "shipments",
  services: "Recommended services",
  acceptTitle: "Accept this proposal",
  acceptIntro:
    "Tell us who is accepting. Your BCOM partner will be in touch to set up your account at these rates.",
  yourName: "Your name",
  note: "Note for your partner (optional)",
  accept: "Accept proposal",
  accepting: "Accepting…",
  validUntil: "Rates valid until",
  acceptedTitle: "Proposal accepted",
  acceptedBy: "Accepted by",
  acceptedNext: "Thank you. Your BCOM partner will be in touch to set up your account.",
  expiredTitle: "These rates have expired",
  expiredBody: "Ask your BCOM partner for an updated proposal.",
  closedTitle: "This proposal is no longer on offer",
  closedBody: "Ask your BCOM partner for a new one.",
  contact: "Questions? Contact your partner",
  whatsapp: "WhatsApp",
  call: "Call",
  email: "Email",
  book: "Book a call",
  pdf: "Download the PDF",
  details: "How this was calculated",
  terms: "Commercial conditions",
  reference: "Reference",
  loading: "Opening your proposal…",
  notFound: "This link doesn't work",
  footer: "Prepared with the BCOM Global Sales Assistant",
  inPartnership: "In partnership with",
};

const T: Record<Language, Record<keyof typeof EN, string>> = {
  en: EN,
  ar: {
    preparedFor: "مُعدّ لـ",
    couldSave: "يمكنها توفير",
    aMonth: "شهرياً",
    aYear: "سنوياً",
    less: "أقل من التكلفة الحالية",
    today: "حالياً",
    withBcom: "مع BCOM",
    perMonth: "شهرياً",
    regions: "أين يتحقق التوفير",
    shipments: "شحنة",
    services: "الخدمات المقترحة",
    acceptTitle: "قبول هذا العرض",
    acceptIntro: "أخبرونا باسم من يقبل العرض. سيتواصل معكم شريك BCOM لإعداد حسابكم بهذه الأسعار.",
    yourName: "الاسم",
    note: "ملاحظة للشريك (اختياري)",
    accept: "قبول العرض",
    accepting: "جارٍ القبول…",
    validUntil: "الأسعار سارية حتى",
    acceptedTitle: "تم قبول العرض",
    acceptedBy: "قَبِله",
    acceptedNext: "شكراً لكم. سيتواصل معكم شريك BCOM لإعداد حسابكم.",
    expiredTitle: "انتهت صلاحية هذه الأسعار",
    expiredBody: "اطلبوا من شريك BCOM عرضاً محدّثاً.",
    closedTitle: "هذا العرض لم يعد متاحاً",
    closedBody: "اطلبوا من شريك BCOM عرضاً جديداً.",
    contact: "لديكم أسئلة؟ تواصلوا مع الشريك",
    whatsapp: "واتساب",
    call: "اتصال",
    email: "بريد إلكتروني",
    book: "حجز مكالمة",
    pdf: "تنزيل ملف PDF",
    details: "طريقة الحساب",
    terms: "الشروط التجارية",
    reference: "المرجع",
    loading: "جارٍ فتح العرض…",
    notFound: "هذا الرابط لا يعمل",
    footer: "أُعدّ باستخدام مساعد المبيعات من BCOM Global",
    inPartnership: "بالشراكة مع",
  },
};

/** The customer's view of their proposal, opened from the partner's link. */
export function CustomerProposal({ token }: { token: string }) {
  const reduce = useReducedMotion();
  const [proposal, setProposal] = useState<PublicProposal | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [howOpen, setHowOpen] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getJson<PublicProposal>(`/public/proposals/${token}`)
      .then((result) => {
        if (!cancelled) setProposal(result);
      })
      .catch((failure: unknown) => {
        if (!cancelled) setLoadError(errorMessage(failure));
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const language: Language = proposal?.language ?? "en";
  const t = T[language];
  const dir = language === "ar" ? "rtl" : "ltr";

  async function accept() {
    setAccepting(true);
    setAcceptError(null);
    try {
      setProposal(await postJson<PublicProposal>(`/public/proposals/${token}/accept`, { name, note }));
    } catch (failure) {
      setAcceptError(errorMessage(failure));
    } finally {
      setAccepting(false);
    }
  }

  async function downloadPdf() {
    try {
      const { blob, fileName } = await getFile(`/public/proposals/${token}/pdf`);
      saveBlob(blob, fileName ?? "BCOM-proposal.pdf");
    } catch (failure) {
      setAcceptError(errorMessage(failure));
    }
  }

  if (!proposal) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-[640px] flex-col justify-center gap-4 px-4">
        {loadError ? (
          <Banner tone="error" title={t.notFound}>
            {loadError}
          </Banner>
        ) : (
          <p role="status" className="text-center text-secondary">
            {t.loading}
          </p>
        )}
      </main>
    );
  }

  const { partner, currency } = proposal;
  const contactLinks = [
    partner.phone
      ? {
          label: t.whatsapp,
          href: buildWhatsAppLink("", partner.phone),
          icon: "copy" as const,
          external: true,
        }
      : null,
    partner.phone
      ? {
          label: t.call,
          href: `tel:${partner.phone.replace(/[^\d+]/g, "")}`,
          icon: "info" as const,
          external: false,
        }
      : null,
    partner.email
      ? { label: t.email, href: `mailto:${partner.email}`, icon: "file" as const, external: false }
      : null,
    partner.booking_url
      ? { label: t.book, href: partner.booking_url, icon: "calendar" as const, external: true }
      : null,
  ].filter((link): link is NonNullable<typeof link> => link !== null);

  return (
    <div dir={dir} lang={language} className="flex min-h-screen flex-col">
      <HeroBand width="max-w-[880px]" inner="flex flex-col gap-8 pt-4 pb-24 sm:pb-28">
        <header className="flex items-center justify-between gap-4">
          <span className="flex">
            <Image
              src="/brand/bcom-global-logo-light.png"
              alt="BCOM Global"
              width={464}
              height={213}
              priority
              className="h-7 w-auto"
            />
          </span>
          <span className="flex items-center gap-2 text-end text-xs leading-snug text-hero-secondary">
            <span>
              {t.inPartnership}
              <br />
              <span className="font-semibold text-hero-ink">{partner.company}</span>
            </span>
            {partner.logo ? (
              /* A data: URL chosen by the partner; next/image adds nothing here. */
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={partner.logo}
                alt=""
                className="h-8 max-w-[96px] rounded bg-white object-contain p-0.5"
              />
            ) : null}
          </span>
        </header>
        <motion.section
          aria-labelledby="saving-title"
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", bounce: 0, duration: 0.45 }}
          className="flex flex-col gap-7"
        >
          <div className="flex flex-col gap-2">
            <p className="text-[15px] text-hero-secondary sm:text-[17px]">
              {t.preparedFor} {proposal.prospect_name}
            </p>
            <h1 id="saving-title" className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1 font-bold">
              <span className="sr-only">
                {proposal.prospect_name} {t.couldSave}
              </span>
              <span className="type-display tabular text-[56px] sm:text-[96px]">
                <bdi className="whitespace-nowrap">{formatMoney(proposal.monthly_saving, currency)}</bdi>
              </span>
              <span className="type-title text-[22px] text-gold sm:text-[30px]">{t.aMonth}</span>
            </h1>
            <p className="text-lg text-hero-secondary">
              <bdi className="font-semibold whitespace-nowrap text-hero-ink">
                {formatMoney(proposal.yearly_saving, currency)}
              </bdi>{" "}
              {t.aYear} · <bdi className="whitespace-nowrap">{formatPercent(proposal.saving_pct)}</bdi>{" "}
              {t.less}
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[20px] bg-hero-line">
            <div className="flex flex-col gap-1 bg-hero-raised px-4 py-4 sm:px-6">
              <dt className="text-[13px] text-hero-secondary">{t.today}</dt>
              <dd className="type-headline tabular text-lg font-semibold sm:text-[24px]">
                <bdi className="whitespace-nowrap">{formatMoney(proposal.monthly_current, currency)}</bdi>
              </dd>
              <dd className="text-[13px] text-hero-secondary">{t.perMonth}</dd>
            </div>
            <div className="flex flex-col gap-1 bg-hero-raised px-4 py-4 sm:px-6">
              <dt className="text-[13px] text-hero-secondary">{t.withBcom}</dt>
              <dd className="type-headline tabular text-lg font-semibold text-hero-save sm:text-[24px]">
                <bdi className="whitespace-nowrap">{formatMoney(proposal.monthly_proposed, currency)}</bdi>
              </dd>
              <dd className="text-[13px] text-hero-secondary">{t.perMonth}</dd>
            </div>
          </dl>
        </motion.section>
      </HeroBand>

      <main className="mx-auto -mt-16 flex w-full max-w-[880px] flex-1 flex-col gap-5 px-4 pb-16 sm:px-6">
        {proposal.status === "accepted" ? (
          <Banner tone="success" title={t.acceptedTitle}>
            {proposal.accepted_by ? `${t.acceptedBy} ${proposal.accepted_by}. ` : ""}
            {t.acceptedNext}
          </Banner>
        ) : proposal.status === "expired" ? (
          <Banner tone="attention" title={t.expiredTitle}>
            {t.expiredBody}
          </Banner>
        ) : proposal.status === "closed" ? (
          <Banner tone="info" title={t.closedTitle}>
            {t.closedBody}
          </Banner>
        ) : null}

        <section
          aria-labelledby="regions-title"
          className="overflow-hidden rounded-[22px] bg-surface shadow-card"
        >
          <h2 id="regions-title" className="type-headline px-6 pt-5 pb-3 text-[20px] font-semibold">
            {t.regions}
          </h2>
          <ul>
            {proposal.regions.map((region) => (
              <li
                key={region.label}
                className="flex items-center justify-between gap-4 border-t border-separator px-6 py-3.5"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="font-semibold">{region.label}</span>
                  <span className="text-[13px] text-secondary">
                    {region.shipments} {t.shipments} ·{" "}
                    <bdi className="whitespace-nowrap">{formatMoneyExact(region.current, currency)}</bdi> →{" "}
                    <bdi className="whitespace-nowrap">{formatMoneyExact(region.proposed, currency)}</bdi>
                  </span>
                </span>
                <span
                  className={`tabular shrink-0 font-semibold ${region.saving >= 0 ? "text-accent" : "text-bad"}`}
                >
                  <bdi className="whitespace-nowrap">
                    {region.saving >= 0 ? "+" : "−"} {formatMoneyExact(Math.abs(region.saving), currency)}
                  </bdi>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section
          aria-labelledby="services-title"
          className="flex flex-col gap-3 rounded-[22px] bg-surface p-6 shadow-card"
        >
          <h2 id="services-title" className="type-headline text-[20px] font-semibold">
            {t.services}
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {proposal.services.map((service) => (
              <li key={service.title} className="flex flex-col gap-1 rounded-2xl bg-canvas p-4">
                <span className="font-semibold">{service.title}</span>
                <span className="text-sm leading-snug text-secondary">{service.description}</span>
              </li>
            ))}
          </ul>
        </section>

        {proposal.status === "open" ? (
          <section
            aria-labelledby="accept-title"
            className="flex flex-col gap-4 rounded-[24px] bg-hero p-6 text-hero-ink sm:p-7"
          >
            <div className="flex flex-col gap-1">
              <h2 id="accept-title" className="type-title text-[24px] font-bold">
                {t.acceptTitle}
              </h2>
              <p className="text-[15px] leading-snug text-hero-secondary">{t.acceptIntro}</p>
            </div>
            <form
              className="flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (name.trim()) void accept();
              }}
            >
              <label className="flex flex-col gap-1">
                <span className="text-[13px] text-hero-secondary">{t.yourName}</span>
                <input
                  value={name}
                  required
                  maxLength={80}
                  autoComplete="name"
                  onChange={(event) => setName(event.target.value)}
                  className="h-12 rounded-xl border border-hero-line bg-hero-raised px-3 text-[17px] text-hero-ink outline-none focus:border-gold focus:ring-4 focus:ring-gold/25"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[13px] text-hero-secondary">{t.note}</span>
                <textarea
                  value={note}
                  maxLength={500}
                  rows={3}
                  onChange={(event) => setNote(event.target.value)}
                  className="rounded-xl border border-hero-line bg-hero-raised px-3 py-2.5 text-[17px] text-hero-ink outline-none focus:border-gold focus:ring-4 focus:ring-gold/25"
                />
              </label>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-[13px] text-hero-secondary">
                  {t.validUntil} {formatDate(proposal.valid_until)}
                </span>
                <button
                  type="submit"
                  disabled={accepting || !name.trim()}
                  className="pressable inline-flex min-h-[52px] items-center gap-2 rounded-full bg-gold px-7 text-[17px] font-semibold text-on-gold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Icon name="check" className="size-4" />
                  {accepting ? t.accepting : t.accept}
                </button>
              </div>
              {acceptError ? (
                <p role="alert" className="text-sm font-medium text-[#ff9b94]">
                  {acceptError}
                </p>
              ) : null}
            </form>
          </section>
        ) : null}

        <section
          aria-labelledby="contact-title"
          className="flex flex-col gap-3 rounded-[22px] bg-surface p-6 shadow-card"
        >
          <h2 id="contact-title" className="type-headline text-[18px] font-semibold">
            {t.contact}
          </h2>
          <p className="text-[15px]">
            <strong className="font-semibold">{partner.name}</strong> · {partner.company}
          </p>
          <div className="flex flex-wrap gap-2">
            {contactLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                {...(link.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                className={buttonClasses("tinted")}
              >
                {link.label}
              </a>
            ))}
            <Button variant="plain" onClick={() => void downloadPdf()}>
              <Icon name="download" className="size-4" />
              {t.pdf}
            </Button>
          </div>
        </section>

        <div className="overflow-hidden rounded-[20px] bg-surface shadow-card">
          <Disclosure title={t.details} open={howOpen} onToggle={() => setHowOpen((open) => !open)}>
            <ul className="flex list-disc flex-col gap-1.5 border-t border-separator py-4 ps-11 pe-6 text-[15px] leading-relaxed text-secondary">
              {proposal.assumptions.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </Disclosure>
          <Disclosure title={t.terms} open={termsOpen} onToggle={() => setTermsOpen((open) => !open)}>
            <ul className="flex list-disc flex-col gap-1.5 border-t border-separator py-4 ps-11 pe-6 text-[15px] leading-relaxed text-secondary">
              {proposal.conditions.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </Disclosure>
        </div>

        <p className="text-center text-xs text-secondary">
          {t.reference} <bdi className="whitespace-nowrap">{proposal.reference}</bdi> · {t.footer}
        </p>
      </main>
    </div>
  );
}
