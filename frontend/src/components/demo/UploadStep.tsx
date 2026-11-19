"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { errorMessage, postForm } from "@/lib/client/api";
import type { ConfigResponse, ExtractResponse } from "@/types/api";

interface Sample {
  file: string;
  label: string;
  detail: string;
  /** Mock mode reads only the SwiftLine PDFs; everything else needs Gemini or OpenAI */
  needsAI: boolean;
}

const MAIN_SAMPLES: Sample[] = [
  {
    file: "sample-1-al-noor-mobile.pdf",
    label: "Sample 1 · clean PDF",
    detail: "46 shipments for an online phone-accessories shop",
    needsAI: false,
  },
  {
    file: "sample-2-gulf-spice.pdf",
    label: "Sample 2 · PDF with gaps",
    detail: "22 shipments with missing weights, an import and an 85 kg box",
    needsAI: false,
  },
  {
    file: "sample-2-gulf-spice-photo.jpg",
    label: "Sample 2 · phone photo",
    detail: "The same invoice, photographed",
    needsAI: true,
  },
];

/** Other couriers' layouts, to show the AI is not tied to one format. */
const FORMAT_SAMPLES: Sample[] = [
  {
    file: "sample-3-falcon-air.pdf",
    label: "Falcon Air · PDF",
    detail: "Product codes, fuel column, DD/MM/YYYY",
    needsAI: true,
  },
  {
    file: "sample-3-falcon-air-scan.png",
    label: "Falcon Air · scan",
    detail: "Same invoice as a grey office scan",
    needsAI: true,
  },
  {
    file: "sample-4-desert-parcel.pdf",
    label: "Desert Parcel · PDF",
    detail: "Landscape, grouped by service with subtotals",
    needsAI: true,
  },
  {
    file: "sample-5-gulf-runner.png",
    label: "Gulf Runner · image",
    detail: "No table – one card per shipment",
    needsAI: true,
  },
  {
    file: "sample-6-oryx-usd.pdf",
    label: "Oryx Express · USD",
    detail: "Billed in US dollars – shows the currency check",
    needsAI: true,
  },
];

const ACCEPT = "application/pdf,image/jpeg,image/png,image/webp";

interface UploadStepProps {
  config: ConfigResponse | null;
  onExtracted: (result: ExtractResponse, fileName: string) => void;
}

export function UploadStep({ config, onExtracted }: UploadStepProps) {
  const inputId = useId();
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const provider = config?.provider ?? null;
  const reads_images = provider?.reads_images ?? false;
  /** A real AI reader (Gemini/OpenAI) is active – mock reads only the SwiftLine sample PDFs */
  const aiActive = provider !== null && provider.id !== "mock";

  async function upload(file: File) {
    setError(null);
    setBusyLabel(`Reading ${file.name}…`);
    try {
      const form = new FormData();
      form.append("file", file);
      const result = await postForm<ExtractResponse>("/invoices/extract", form);
      onExtracted(result, file.name);
    } catch (uploadError) {
      setError(errorMessage(uploadError));
    } finally {
      setBusyLabel(null);
    }
  }

  async function loadSample(fileName: string) {
    setError(null);
    setBusyLabel(`Loading ${fileName}…`);
    try {
      const response = await fetch(`/samples/${fileName}`);
      if (!response.ok) throw new Error("The sample file is missing. Run `npm run samples`.");
      const blob = await response.blob();
      await upload(new File([blob], fileName, { type: blob.type }));
    } catch (sampleError) {
      setError(errorMessage(sampleError));
      setBusyLabel(null);
    }
  }

  const busy = busyLabel !== null;

  return (
    <section className="flex flex-col gap-5" aria-labelledby="upload-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="upload-title" className="text-xl font-bold">
            Upload the prospect&apos;s courier invoice
          </h2>
          <p className="text-sm text-muted">PDF or photo of last month&apos;s invoice. The shipments are read automatically.</p>
        </div>
      </div>

      {config?.problem ? <Notice tone="error" title="AI provider not ready">{config.problem}</Notice> : null}

      <label
        htmlFor={inputId}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const file = event.dataTransfer.files[0];
          if (file && !busy) void upload(file);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-12 text-center transition-colors ${
          dragging ? "border-accent bg-accent/5" : "border-line bg-white hover:border-muted"
        } ${busy ? "pointer-events-none opacity-60" : ""}`}
      >
        <span className="text-base font-semibold">{busy ? busyLabel : "Drop the invoice here, or click to choose a file"}</span>
        <span className="text-sm text-muted">
          PDF, JPG, PNG or WEBP · up to {config?.max_upload_mb ?? 10} MB
          {provider && !reads_images ? " · photos need Gemini or OpenAI" : ""}
        </span>
        <input
          id={inputId}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void upload(file);
          }}
        />
      </label>

      {error ? <Notice tone="error" title="Could not read the invoice">{error}</Notice> : null}

      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold tracking-wide text-muted uppercase">Or try a sample invoice</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          {MAIN_SAMPLES.map((sample) => {
            const unavailable = sample.needsAI && !aiActive;
            return (
              <div key={sample.file} className="flex flex-col gap-2 rounded-lg border border-line bg-white p-4">
                <p className="font-semibold">{sample.label}</p>
                <p className="flex-1 text-sm text-muted">{sample.detail}</p>
                {unavailable ? <p className="text-xs text-warn">Needs AI_PROVIDER=gemini or openai.</p> : null}
                <Button variant="secondary" disabled={busy || unavailable} onClick={() => void loadSample(sample.file)}>
                  Use this sample
                </Button>
              </div>
            );
          })}
        </div>

        <h3 className="mt-2 text-sm font-semibold tracking-wide text-muted uppercase">
          Other courier formats {aiActive ? "" : "· need AI_PROVIDER=gemini or openai"}
        </h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {FORMAT_SAMPLES.map((sample) => (
            <button
              key={sample.file}
              type="button"
              disabled={busy || !aiActive}
              onClick={() => void loadSample(sample.file)}
              className="flex flex-col gap-1 rounded-lg border border-line bg-white p-3 text-left transition-colors hover:border-muted focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="text-sm font-semibold">{sample.label}</span>
              <span className="text-xs text-muted">{sample.detail}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
