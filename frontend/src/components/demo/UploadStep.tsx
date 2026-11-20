"use client";

import { motion, useReducedMotion } from "motion/react";
import { useId, useState } from "react";
import { Banner } from "@/components/ui/Banner";
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
  { file: "sample-1-al-noor-mobile.pdf", label: "Clean PDF", detail: "46 shipments · phone accessories shop", thumb: "clean", needsAI: false },
  {
    file: "sample-2-gulf-spice.pdf",
    label: "PDF with gaps",
    detail: "22 shipments · missing weights, an import, an 85 kg box",
    thumb: "gaps",
    needsAI: false,
  },
  { file: "sample-2-gulf-spice-photo.jpg", label: "Phone photo", detail: "The same invoice, photographed", thumb: "photo", needsAI: true },
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
          await readInvoiceWithProgress(file, (stage) => setReading((current) => (current ? { ...current, stage } : current))),
        );
      }
      const first = results[0]!;
      const result =
        results.length > 1
          ? { ...first, invoice: await postJson<InvoiceData>("/invoices/combine", { invoices: results.map((r) => r.invoice) }) }
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
    <main className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col gap-10 px-4 pt-12 pb-20 sm:gap-12 sm:px-6 sm:pt-[72px]">
      <div className="flex flex-col items-center gap-3 text-center">
        <h1 className="type-title max-w-[760px] text-[34px] font-bold text-balance sm:text-[48px] sm:leading-[1.05]">
          Turn last month&apos;s courier invoice into a savings proposal.
        </h1>
        <p className="max-w-[620px] text-[17px] leading-relaxed text-secondary sm:text-[19px]">
          Drop the prospect&apos;s invoice. We read every shipment, compare it with BCOM rates, and prepare the PDF and
          WhatsApp message.
        </p>
      </div>

      <HowItWorks />

      {config?.problem ? (
        <Banner tone="error" title="Invoice reading isn't available right now">
          {config.problem}
        </Banner>
      ) : null}

      {config?.samples_only ? (
        <Banner tone="info" title="This demo server reads only the sample invoices">
          Use the samples below. Real customer invoices are refused here, to keep customer data off the free AI tier.
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
        className={`relative flex cursor-pointer flex-col items-center justify-center gap-4 overflow-hidden rounded-[28px] border-2 border-dashed px-6 py-14 text-center shadow-raised transition-[background-color,border-color,transform] duration-200 focus-within:outline-2 focus-within:outline-offset-4 focus-within:outline-accent sm:py-16 ${
          dragging ? "scale-[1.01] border-accent bg-accent-tint" : "border-tertiary/45 bg-surface hover:border-tertiary"
        } ${busy ? "pointer-events-none" : ""}`}
      >
        <span aria-hidden="true" className="flex size-16 items-center justify-center rounded-[20px] bg-accent-tint text-accent">
          {done ? (
            <svg viewBox="0 0 24 24" className="size-[30px]" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
              <motion.path d="M5 12.5l4.5 4.5L19 7.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.35, ease: "easeOut" }} />
            </svg>
          ) : (
            <Icon name={busy ? "file" : "upload"} className="size-[30px]" />
          )}
        </span>
        <span className="type-headline text-2xl font-semibold" aria-live="polite">
          {done ? "Invoice read" : busy ? "Reading…" : dragging ? "Drop to read it" : "Drop the invoice here"}
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
              PDF, photo, CSV or Excel · up to {config?.max_upload_mb ?? 10} MB · up to {MAX_INVOICES} months at once
            </span>
            <span className="inline-flex min-h-11 items-center rounded-full bg-accent px-5 text-[15px] font-semibold text-on-accent">
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

      <p className="-mt-6 text-center text-[13px] text-secondary sm:-mt-8">
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

      <section aria-labelledby="samples-title" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="samples-title" className="type-headline text-[22px] font-semibold">
            No invoice to hand? Try a sample
          </h2>
          <span className="text-[13px] text-secondary">Fictional companies and data</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {MAIN_SAMPLES.map((sample, index) => {
            const unavailable = sample.needsAI && !aiActive;
            return (
              <motion.div
                key={sample.file}
                className="flex"
                initial={reduce ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: "spring", bounce: 0, duration: 0.4, delay: 0.1 + index * 0.05 }}
              >
              <button
                type="button"
                disabled={busy || unavailable}
                onClick={() => void loadSample(sample.file)}
                className="pressable flex flex-1 items-center gap-4 rounded-[20px] bg-surface p-4 text-left shadow-card hover:shadow-raised focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:hover:shadow-card"
              >
                <Thumbnail kind={sample.thumb} />
                <span className="flex min-w-0 flex-col gap-1">
                  <span className={`text-base font-semibold ${unavailable ? "text-secondary" : ""}`}>
                    <span className="sr-only">Use sample: </span>
                    {sample.label}
                  </span>
                  {unavailable ? (
                    <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-fill-soft px-2.5 py-0.5 text-xs font-semibold text-secondary">
                      <Icon name="info" className="size-3" />
                      Needs AI reading
                    </span>
                  ) : (
                    <span className="text-sm leading-snug text-secondary">{sample.detail}</span>
                  )}
                </span>
              </button>
              </motion.div>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="mr-1 text-[13px] text-secondary">Other courier layouts{aiActive ? ":" : " (need AI reading):"}</span>
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
          <p className="text-[13px] text-secondary">
            Photos and other couriers&apos; layouts need AI reading, which is switched off on this server. The two SwiftLine
            PDFs and CSV or Excel statements work without it.
          </p>
        ) : null}
      </section>
    </main>
  );
}

/** A tiny drawn invoice, so each sample is recognisable at a glance. */
function Thumbnail({ kind }: { kind: Thumb }) {
  const lines = kind === "gaps" ? ["w-full", "w-2/5 bg-attention", "w-full", "w-1/2 bg-attention"] : ["w-full", "w-full", "w-full", "w-3/4"];
  return (
    <span
      aria-hidden="true"
      className={`flex h-[72px] w-14 shrink-0 flex-col gap-[5px] rounded-lg border border-separator px-2 py-2.5 ${
        kind === "photo" ? "-rotate-3 bg-[#e9e4dc] dark:bg-[#2a2620]" : "bg-canvas"
      }`}
    >
      <span className={`h-[5px] w-3/5 rounded-full ${kind === "photo" ? "bg-tertiary" : "bg-accent"}`} />
      {lines.map((line, index) => (
        <span key={index} className={`h-[3px] rounded-full ${line.includes("bg-") ? line : `${line} bg-fill`}`} />
      ))}
    </span>
  );
}
