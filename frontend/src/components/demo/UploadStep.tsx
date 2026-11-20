"use client";

import { motion, useReducedMotion } from "motion/react";
import { useId, useState } from "react";
import { Banner } from "@/components/ui/Banner";
import { HeroBand } from "@/components/ui/Hero";
import { HowItWorks } from "@/components/ui/HowItWorks";
import { Icon } from "@/components/ui/Icon";
import { errorMessage, postJson } from "@/lib/client/api";
import { readInvoiceWithProgress, type StageEvent } from "@/lib/client/stream";
import type { ConfigResponse, ExtractResponse } from "@/types/api";
import type { InvoiceData } from "@/types/invoice";
import { MAX_INVOICES } from "@/lib/invoiceParts";
import { ReadingProgress } from "./ReadingProgress";

type Thumb = "clean" | "gaps" | "photo";

interface Sample {
  file: string;
  label: string;
  detail: string;
  thumb: Thumb;
  /** No-AI mode reads only the SwiftLine PDFs; everything else needs AI reading */
  needsAI: boolean;
}

const MAIN_SAMPLES: Sample[] = [
  {
    file: "sample-1-al-noor-mobile.pdf",
    label: "Clean PDF",
    detail: "46 shipments · phone accessories shop",
    thumb: "clean",
    needsAI: false,
  },
  {
    file: "sample-2-gulf-spice.pdf",
    label: "PDF with gaps",
    detail: "22 shipments · missing weights, an import, an 85 kg box",
    thumb: "gaps",
    needsAI: false,
  },
  {
    file: "sample-2-gulf-spice-photo.jpg",
    label: "Phone photo",
    detail: "The same invoice, photographed",
    thumb: "photo",
    needsAI: true,
  },
];

/** Other couriers' layouts, to show the reader is not tied to one format. */
const FORMAT_SAMPLES: { file: string; label: string }[] = [
  { file: "sample-3-falcon-air.pdf", label: "Falcon Air · codes" },
  { file: "sample-3-falcon-air-scan.png", label: "Falcon Air · scan" },
  { file: "sample-4-desert-parcel.pdf", label: "Desert Parcel · grouped" },
  { file: "sample-5-gulf-runner.png", label: "Gulf Runner · cards" },
  { file: "sample-6-oryx-usd.pdf", label: "Oryx Express · USD" },
];

const ACCEPT = [
  ".pdf",
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".csv",
  ".xlsx",
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
].join(",");

const TEMPLATE_URL = "/templates/bcom-shipments-template.csv";

interface Reading {
  fileName: string;
  index: number;
  total: number;
  stage: StageEvent | null;
}

interface UploadStepProps {
  config: ConfigResponse | null;
  /** One reading, or several months combined into one; `files` in the order they were added */
  onExtracted: (result: ExtractResponse, files: File[]) => void;
}

export function UploadStep({ config, onExtracted }: UploadStepProps) {
  const inputId = useId();
  const reduce = useReducedMotion();
  const [reading, setReading] = useState<Reading | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  /** Shown for a moment after a successful read, before moving on */
  const [done, setDone] = useState(false);

  const provider = config?.provider ?? null;
  /** A real AI reader is active – no-AI mode reads only the SwiftLine sample PDFs */
  const aiActive = provider !== null && provider.id !== "mock";
  const busy = reading !== null;

  /** Reads each file with live progress; several months are then combined into one invoice. */
  async function upload(files: File[]) {
    setError(null);
    if (files.length > MAX_INVOICES) {
      setError(`Choose up to ${MAX_INVOICES} invoices at once (one per month).`);
      return;
    }
    try {
      const results: ExtractResponse[] = [];
      for (const [index, file] of files.entries()) {
        setReading({ fileName: file.name, index: index + 1, total: files.length, stage: null });
        results.push(
          await readInvoiceWithProgress(file, (stage) =>
            setReading((current) => (current ? { ...current, stage } : current)),
          ),
        );
      }
      const first = results[0]!;
      const result =
        results.length > 1
          ? {
              ...first,
              invoice: await postJson<InvoiceData>("/invoices/combine", {
                invoices: results.map((r) => r.invoice),
              }),
            }
          : first;
      if (!reduce) {
        // A short tick confirms the read before the next step slides in.
        setDone(true);
        await new Promise((resolve) => window.setTimeout(resolve, 450));
      }
      onExtracted(result, files);
    } catch (uploadError) {
      setError(errorMessage(uploadError));
    } finally {
      setReading(null);
      setDone(false);
    }
  }

  async function loadSample(fileName: string) {
    setError(null);
    setReading({ fileName, index: 1, total: 1, stage: null });
    try {
      const response = await fetch(`/samples/${fileName}`);
      if (!response.ok) throw new Error("The sample file is missing. Run `npm run samples`.");
      const blob = await response.blob();
      await upload([new File([blob], fileName, { type: blob.type })]);
    } catch (sampleError) {
      setError(errorMessage(sampleError));
      setReading(null);
    }
  }

  return (
    <>
      <HeroBand inner="flex flex-col items-center gap-4 pt-14 pb-36 text-center sm:pt-20">
        <p className="text-[17px] font-semibold text-gold">New proposal</p>
        <h1 className="type-title max-w-[820px] text-[40px] font-bold text-balance sm:text-[64px] sm:leading-[1.03]">
          Their invoice in. Your proposal out.
        </h1>
        <p className="max-w-[620px] text-[17px] leading-relaxed text-hero-secondary sm:text-[21px]">
          Drop the prospect&apos;s last courier invoice. Every shipment is read, checked and compared with
          BCOM rates.
        </p>
        <p lang="ar" dir="rtl" className="font-arabic text-lg text-hero-secondary">
          من فاتورة الشحن إلى عرض توفير خلال دقائق
        </p>
      </HeroBand>
      <main className="mx-auto -mt-28 flex w-full max-w-[880px] flex-1 flex-col gap-6 px-4 pb-20 sm:px-6">
        {config?.problem ? (
          <Banner tone="error" title="Invoice reading isn't available right now">
            {config.problem}
          </Banner>
        ) : null}

        {config?.samples_only ? (
          <Banner tone="info" title="This demo server reads only the sample invoices">
            Use the samples below. Real customer invoices are refused here, to keep customer data off the free
            AI tier.
          </Banner>
        ) : config?.privacy_notice ? (
          <Banner tone="attention" title="Free AI tier">
            {config.privacy_notice}
          </Banner>
        ) : null}

        <label
          htmlFor={inputId}
          onDragOver={(event) => {
            event.preventDefault();
            if (!busy) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            const files = [...event.dataTransfer.files];
            if (files.length > 0 && !busy) void upload(files);
          }}
          className={`relative flex cursor-pointer flex-col items-center justify-center gap-4 overflow-hidden rounded-[28px] px-6 py-12 text-center shadow-raised outline-2 -outline-offset-[14px] outline-dashed transition-[background-color,outline-color,transform] duration-200 focus-within:outline-solid focus-within:outline-accent sm:py-14 ${
            dragging
              ? "scale-[1.01] bg-accent-tint outline-accent"
              : "bg-surface outline-separator hover:outline-tertiary"
          } ${busy ? "pointer-events-none" : ""}`}
        >
          <span
            aria-hidden="true"
            className="flex size-16 items-center justify-center rounded-[20px] bg-accent-tint text-accent"
          >
            {done ? (
              <svg
                viewBox="0 0 24 24"
                className="size-[30px]"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.4}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <motion.path
                  d="M5 12.5l4.5 4.5L19 7.5"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.35, ease: "easeOut" }}
                />
              </svg>
            ) : (
              <Icon name={busy ? "file" : "upload"} className="size-[30px]" />
            )}
          </span>
          <span className="type-headline text-2xl font-semibold" aria-live="polite">
            {done
              ? "Invoice read"
              : busy
                ? "Reading…"
                : dragging
                  ? "Drop to read it"
                  : "Drop the invoice here"}
          </span>
          {busy && !done && reading ? (
            <ReadingProgress
              key={`${reading.index}-${reading.fileName}`}
              fileName={reading.fileName}
              stage={reading.stage}
              part={{ index: reading.index, total: reading.total }}
            />
          ) : busy ? null : (
            <>
              <span className="text-[15px] text-secondary">
                PDF, photo, CSV or Excel · up to {config?.max_upload_mb ?? 10} MB · up to {MAX_INVOICES}{" "}
                months at once
              </span>
              <span className="inline-flex min-h-11 items-center rounded-full bg-gold px-5 text-[15px] font-semibold text-on-gold">
                Choose a file
              </span>
            </>
          )}
          <input
            id={inputId}
            type="file"
            accept={ACCEPT}
            multiple
            className="sr-only"
            disabled={busy}
            onChange={(event) => {
              const files = [...(event.target.files ?? [])];
              event.target.value = "";
              if (files.length > 0) void upload(files);
            }}
          />
        </label>

        <p className="-mt-2 text-center text-[13px] text-secondary">
          Have shipments in a spreadsheet?{" "}
          <a
            href={TEMPLATE_URL}
            download
            className="rounded font-semibold text-accent underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-accent"
          >
            Download the CSV template
          </a>{" "}
          · spreadsheets are read without AI.
        </p>

        {error ? (
          <Banner tone="error" title="Could not read the invoice">
            {error}
          </Banner>
        ) : null}

        <HowItWorks />

        <section aria-labelledby="samples-title" className="flex flex-col gap-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2 px-4">
            <h2 id="samples-title" className="text-[13px] font-medium tracking-wide text-secondary uppercase">
              No invoice to hand? Try a sample
            </h2>
            <span className="text-[13px] text-secondary">Fictional companies and data</span>
          </div>
          <ul className="overflow-hidden rounded-[18px] bg-surface shadow-card">
            {MAIN_SAMPLES.map((sample, index) => {
              const unavailable = sample.needsAI && !aiActive;
              return (
                <motion.li
                  key={sample.file}
                  initial={reduce ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: "spring", bounce: 0, duration: 0.35, delay: 0.05 + index * 0.04 }}
                >
                  <button
                    type="button"
                    disabled={busy || unavailable}
                    onClick={() => void loadSample(sample.file)}
                    className="flex w-full items-center gap-4 px-4 text-left hover:bg-fill-soft focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:hover:bg-transparent"
                  >
                    <Thumbnail kind={sample.thumb} />
                    <span
                      className={`flex min-w-0 flex-1 items-center gap-3 py-3 ${index > 0 ? "border-t border-separator" : ""}`}
                    >
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className={`text-[17px] ${unavailable ? "text-secondary" : ""}`}>
                          <span className="sr-only">Use sample: </span>
                          {sample.label}
                        </span>
                        <span className="text-[13px] leading-snug text-secondary">
                          {unavailable ? "Needs AI reading" : sample.detail}
                        </span>
                      </span>
                      {unavailable ? null : (
                        <Icon name="chevronRight" className="size-3.5 shrink-0 text-tertiary" />
                      )}
                    </span>
                  </button>
                </motion.li>
              );
            })}
          </ul>
          <div className="flex flex-wrap items-center gap-2 px-1 pt-2">
            <span className="mr-1 text-[13px] text-secondary">
              Other courier layouts{aiActive ? ":" : " (need AI reading):"}
            </span>
            {FORMAT_SAMPLES.map((sample) => (
              <button
                key={sample.file}
                type="button"
                disabled={busy || !aiActive}
                onClick={() => void loadSample(sample.file)}
                className="pressable min-h-9 rounded-full bg-surface px-3.5 text-[13px] text-secondary shadow-card hover:text-ink focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:text-secondary"
              >
                {sample.label}
              </button>
            ))}
          </div>
          {!aiActive && provider ? (
            <p className="px-1 text-[13px] text-secondary">
              Photos and other couriers&apos; layouts need AI reading, which is switched off on this server.
              The two SwiftLine PDFs and CSV or Excel statements work without it.
            </p>
          ) : null}
        </section>
      </main>
    </>
  );
}

/** A tiny drawn invoice, so each sample is recognisable at a glance. */
function Thumbnail({ kind }: { kind: Thumb }) {
  const lines =
    kind === "gaps"
      ? ["w-full", "w-2/5 bg-attention", "w-full", "w-1/2 bg-attention"]
      : ["w-full", "w-full", "w-full", "w-3/4"];
  return (
    <span
      aria-hidden="true"
      className={`flex h-[52px] w-10 shrink-0 flex-col gap-1 rounded-md border border-separator px-1.5 py-2 ${
        kind === "photo" ? "-rotate-3 bg-[#e5e5ea] dark:bg-[#2c2c2e]" : "bg-canvas"
      }`}
    >
      <span className={`h-[5px] w-3/5 rounded-full ${kind === "photo" ? "bg-tertiary" : "bg-accent"}`} />
      {lines.map((line, index) => (
        <span
          key={index}
          className={`h-[3px] rounded-full ${line.includes("bg-") ? line : `${line} bg-fill`}`}
        />
      ))}
    </span>
  );
}
