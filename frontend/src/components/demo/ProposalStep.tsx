"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";
import { ActionBar } from "@/components/ui/ActionBar";
import { Banner } from "@/components/ui/Banner";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Segmented } from "@/components/ui/Segmented";
import { Sheet } from "@/components/ui/Sheet";
import { errorMessage, isAbort, postForBlob } from "@/lib/client/api";
import { useMinWidth } from "@/lib/hooks";
import { partnerForRequest, usableBookingUrl } from "@/lib/partner";
import type { CustomerLanguage, PartnerDetailsInput, Scenario } from "@/types/api";
import type { InvoiceData } from "@/types/invoice";

export interface ProposalFile {
  url: string;
  fileName: string;
}

interface ProposalStepProps {
  invoice: InvoiceData;
  /** The what-if chosen on Savings; the PDF shows the same figures */
  scenario: Scenario;
  partner: PartnerDetailsInput;
  proposal: ProposalFile | null;
  onPartnerChange: (partner: PartnerDetailsInput) => void;
  onProposalReady: (proposal: ProposalFile) => void;
  /** The PDF was downloaded (for the proposal's history) */
  onDownload?: () => void;
  onBack: () => void;
  onContinue: () => void;
}

type TextField = "prospect_name" | "partner_name" | "partner_company" | "partner_phone" | "partner_email" | "booking_url";
type Status = "waiting" | "updating" | "ready" | "error";

/** Wait this long after the last keystroke before rebuilding the PDF. */
const PREVIEW_DELAY_MS = 800;

const PREPARED_BY: { field: TextField; label: string; required: boolean; type: string }[] = [
  { field: "partner_name", label: "Your name", required: true, type: "text" },
  { field: "partner_company", label: "Your company", required: true, type: "text" },
  { field: "partner_phone", label: "Phone", required: false, type: "tel" },
  { field: "partner_email", label: "Email", required: false, type: "email" },
];

/** The backend's limit for the partner logo. */
const MAX_LOGO_BYTES = 300 * 1024;

function safeFileName(prospect: string, language: CustomerLanguage): string {
  const name = prospect.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "prospect";
  return `BCOM-proposal-${name}${language === "ar" ? "-ar" : ""}.pdf`;
}

export function ProposalStep({
  invoice,
  scenario,
  partner,
  proposal,
  onPartnerChange,
  onProposalReady,
  onDownload,
  onBack,
  onContinue,
}: ProposalStepProps) {
  const wide = useMinWidth(1024);
  const reduce = useReducedMotion();
  const [status, setStatus] = useState<Status>(proposal ? "ready" : "waiting");
  const [error, setError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const request = useRef<AbortController | null>(null);
  const firstRun = useRef(true);

  const missingRequired =
    partner.prospect_name.trim() === "" || partner.partner_name.trim() === "" || partner.partner_company.trim() === "";
  const requestKey = JSON.stringify([partnerForRequest(partner), scenario]);
  const [logoError, setLogoError] = useState<string | null>(null);
  const bookingTyped = partner.booking_url.trim() !== "";
  const bookingInvalid = bookingTyped && usableBookingUrl(partner.booking_url) === "";

  // Rebuild the PDF a moment after the details stop changing. A newer request cancels the older one.
  useEffect(() => {
    if (missingRequired) {
      request.current?.abort();
      return;
    }
    const immediate = firstRun.current && !proposal;
    const skip = firstRun.current && proposal !== null;
    firstRun.current = false;
    if (skip) return;

    const timer = window.setTimeout(
      () => {
        request.current?.abort();
        const controller = new AbortController();
        request.current = controller;
        setStatus("updating");
        setError(null);
        postForBlob("/proposals/render", { invoice, partner: partnerForRequest(partner), scenario }, controller.signal)
          .then((blob) => {
            onProposalReady({
              url: URL.createObjectURL(blob),
              fileName: safeFileName(partner.prospect_name, partner.language),
            });
            setStatus("ready");
          })
          .catch((failure: unknown) => {
            if (isAbort(failure)) return;
            setError(errorMessage(failure));
            setStatus("error");
          });
      },
      immediate ? 0 : PREVIEW_DELAY_MS,
    );
    return () => window.clearTimeout(timer);
    // The key captures every partner detail and the what-if; the invoice cannot change on this step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey, missingRequired]);

  useEffect(() => () => request.current?.abort(), []);

  function change(field: TextField, value: string) {
    setStatus(missingRequired ? "waiting" : "updating");
    onPartnerChange({ ...partner, [field]: value });
  }

  function update(patch: Partial<PartnerDetailsInput>) {
    setStatus(missingRequired ? "waiting" : "updating");
    onPartnerChange({ ...partner, ...patch });
  }

  function pickLogo(file: File) {
    setLogoError(null);
    if (file.type !== "image/png" && file.type !== "image/jpeg") {
      setLogoError("Choose a PNG or JPG image.");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setLogoError(`That image is ${Math.round(file.size / 1024)} KB. Use one of 300 KB or less.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => update({ partner_logo: String(reader.result) });
    reader.onerror = () => setLogoError("Could not read that image.");
    reader.readAsDataURL(file);
  }

  const upToDate = status === "ready" && proposal !== null;
  const statusText = missingRequired
    ? "Add the required names to build the PDF"
    : status === "updating"
      ? "Updating the PDF…"
      : status === "error"
        ? "The PDF could not be built"
        : upToDate
          ? "PDF ready"
          : "Building the PDF…";

  const preview = proposal ? (
    // Each new PDF fades in; the browser's PDF toolbar is hidden so the preview reads as a page.
    <motion.div
      key={proposal.url}
      className="h-full w-full"
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
    >
      <iframe title="Proposal preview" src={`${proposal.url}#toolbar=0&navpanes=0&view=FitH`} className="h-full w-full rounded bg-white" />
    </motion.div>
  ) : (
    <div className="flex h-full items-center justify-center text-sm text-secondary">{missingRequired ? "Waiting for the names" : "Building…"}</div>
  );

  return (
    <>
      <main className="mx-auto flex w-full max-w-[1200px] flex-1 flex-wrap items-start gap-8 px-4 pt-8 sm:px-6 sm:pt-12">
        <form className="flex w-full max-w-[440px] flex-[1_1_380px] flex-col gap-6" onSubmit={(event) => event.preventDefault()}>
          <div className="flex flex-col gap-1.5">
            <h1 className="type-title text-[28px] font-bold sm:text-[34px]">Customer proposal</h1>
            <p className="text-base leading-relaxed text-secondary">Check the names. The preview updates as you type.</p>
          </div>

          <Group legend="Prepared for">
            <Field
              label="Prospect"
              required
              value={partner.prospect_name}
              onChange={(value) => change("prospect_name", value)}
            />
          </Group>

          <Group legend="Prepared by">
            {PREPARED_BY.map(({ field, label, required, type }) => (
              <Field
                key={field}
                label={label}
                required={required}
                type={type}
                value={partner[field]}
                onChange={(value) => change(field, value)}
              />
            ))}
            <Field
              label="Booking link"
              type="url"
              placeholder="https://cal.com/your-name"
              value={partner.booking_url}
              onChange={(value) => change("booking_url", value)}
              hint={bookingInvalid ? "Use a full link starting with https:// to include it" : undefined}
            />
          </Group>
          <p className="-mt-4 pl-1 text-[13px] text-secondary">Your details are remembered on this device for the next proposal.</p>

          <LogoPicker logo={partner.partner_logo} error={logoError} onPick={pickLogo} onRemove={() => update({ partner_logo: null })} />

          <fieldset className="flex flex-col">
            <legend className="pb-2 pl-1 text-[13px] font-medium text-secondary">Customer language</legend>
            <Segmented
              label="Customer language"
              stretch
              value={partner.language}
              onChange={(language) => update({ language })}
              options={[
                { value: "en", label: "English" },
                { value: "ar", label: "العربية" },
              ]}
            />
            <p className="pt-2 pl-1 text-[13px] leading-snug text-secondary">
              {partner.language === "ar"
                ? "The PDF and WhatsApp message are written in Arabic. Ask a native speaker to check them before real use."
                : "The PDF and WhatsApp message the customer receives."}
            </p>
          </fieldset>

          <fieldset className="flex flex-col">
            <legend className="pb-2 pl-1 text-[13px] font-medium text-secondary">Rates valid for</legend>
            <Segmented
              label="Rates valid for"
              stretch
              value={String(partner.validity_days) as "14" | "30" | "60"}
              onChange={(value) => {
                setStatus("updating");
                onPartnerChange({ ...partner, validity_days: Number(value) });
              }}
              options={[
                { value: "14", label: "14 days" },
                { value: "30", label: "30 days" },
                { value: "60", label: "60 days" },
              ]}
            />
          </fieldset>

          {!wide ? (
            <Button variant="tinted" onClick={() => setSheetOpen(true)} disabled={!proposal}>
              <Icon name="eye" className="size-4" />
              Preview PDF
            </Button>
          ) : null}

          {error ? (
            <Banner tone="error" title="Could not build the proposal">
              {error}
            </Banner>
          ) : null}
        </form>

        {wide ? (
          <section aria-label="PDF preview" className="flex min-w-0 flex-[999_1_520px] flex-col gap-3">
            <div className="flex items-center justify-between gap-3 text-[13px] text-secondary">
              <span className="inline-flex items-center gap-2" aria-live="polite">
                <span
                  aria-hidden="true"
                  className={`size-2 rounded-full ${upToDate ? "bg-accent" : status === "error" ? "bg-bad" : "bg-attention"}`}
                />
                {upToDate ? "Preview up to date" : statusText}
              </span>
              <span>A4</span>
            </div>
            <div className="rounded-3xl bg-fill p-6 xl:p-8">
              <div
                className={`mx-auto aspect-[210/297] w-full max-w-[560px] overflow-hidden rounded bg-white shadow-[0_2px_6px_rgba(0,0,0,0.08),0_20px_48px_rgba(0,0,0,0.12)] transition-opacity duration-200 ${
                  status === "updating" ? "opacity-60" : ""
                }`}
              >
                {preview}
              </div>
            </div>
          </section>
        ) : null}
      </main>

      <ActionBar backLabel="Savings" onBack={onBack} status={statusText}>
        {proposal && wide ? (
          <a
            href={proposal.url}
            download={proposal.fileName}
            onClick={onDownload}
            aria-disabled={!upToDate}
            className={`${buttonClasses("tinted")} ${upToDate ? "" : "pointer-events-none opacity-50"}`}
          >
            <Icon name="download" className="size-4" />
            Download PDF
          </a>
        ) : null}
        <Button onClick={onContinue} disabled={!upToDate} className="flex-1 md:flex-none">
          Next: WhatsApp
        </Button>
      </ActionBar>

      <Sheet
        open={sheetOpen && !wide}
        onClose={() => setSheetOpen(false)}
        title="Proposal preview"
        footer={
          proposal ? (
            <div className="flex gap-2.5">
              <a
                href={proposal.url}
                download={proposal.fileName}
                onClick={onDownload}
                className={`${buttonClasses("tinted", "large")} flex-1`}
              >
                Download PDF
              </a>
              <Button
                size="large"
                className="flex-1"
                disabled={!upToDate}
                onClick={() => {
                  setSheetOpen(false);
                  onContinue();
                }}
              >
                Next: WhatsApp
              </Button>
            </div>
          ) : null
        }
      >
        <div className="h-[62dvh] bg-fill p-4">{preview}</div>
      </Sheet>
    </>
  );
}

/** iOS-style inset group of fields with hairline separators. */
function Group({ legend, children }: { legend: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col">
      <legend className="pb-2 pl-1 text-[13px] font-medium text-secondary">{legend}</legend>
      <div className="overflow-hidden rounded-[14px] bg-surface shadow-card [&>label+label]:ml-4 [&>label+label]:border-t [&>label+label]:border-separator [&>label+label]:pl-0">
        {children}
      </div>
    </fieldset>
  );
}

function Field({
  label,
  value,
  onChange,
  required = false,
  type = "text",
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
  placeholder?: string;
  /** Shown under the label in amber, e.g. why a value is not used yet */
  hint?: string;
}) {
  const empty = required && value.trim() === "";
  return (
    <label className="flex flex-col gap-0.5 px-4 py-2.5 focus-within:bg-fill-soft">
      <span className="text-xs text-secondary">
        {label}
        {required ? null : <span> · optional</span>}
        {empty ? <span className="font-medium text-attention-ink"> · required</span> : null}
        {hint ? <span className="font-medium text-attention-ink"> · {hint}</span> : null}
      </span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        required={required}
        onChange={(event) => onChange(event.target.value)}
        className="bg-transparent py-0.5 text-base outline-none placeholder:text-tertiary"
      />
    </label>
  );
}

/** The partner's own logo for the PDF header ("in partnership with"), with a preview and Remove. */
function LogoPicker({
  logo,
  error,
  onPick,
  onRemove,
}: {
  logo: string | null;
  error: string | null;
  onPick: (file: File) => void;
  onRemove: () => void;
}) {
  const inputId = useId();
  return (
    <fieldset className="flex flex-col">
      <legend className="pb-2 pl-1 text-[13px] font-medium text-secondary">
        Your logo · optional
      </legend>
      <div className="flex items-center gap-4 rounded-[14px] bg-surface px-4 py-3 shadow-card">
        <span className="flex h-12 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-separator bg-white">
          {logo ? (
            // A data: URL chosen on this device; next/image adds nothing here.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="Your logo" className="max-h-10 max-w-[88px] object-contain" />
          ) : (
            <span className="text-xs text-[#5f6670]">No logo</span>
          )}
        </span>
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <label
            htmlFor={inputId}
            className="pressable inline-flex min-h-10 cursor-pointer items-center rounded-full bg-accent-tint px-4 text-sm font-semibold text-accent focus-within:outline-2 focus-within:outline-accent"
          >
            {logo ? "Change" : "Add logo"}
            <input
              id={inputId}
              type="file"
              accept="image/png,image/jpeg"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) onPick(file);
              }}
            />
          </label>
          {logo ? (
            <button
              type="button"
              onClick={onRemove}
              className="pressable min-h-10 rounded-full px-3 text-sm font-semibold text-secondary hover:bg-fill-soft focus-visible:outline-2 focus-visible:outline-accent"
            >
              Remove
            </button>
          ) : (
            <span className="text-xs text-secondary">PNG or JPG, up to 300 KB</span>
          )}
        </span>
      </div>
      {error ? (
        <p role="alert" className="pt-2 pl-1 text-[13px] font-medium text-bad">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
