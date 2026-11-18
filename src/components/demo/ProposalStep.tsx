"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { errorMessage, postForBlob } from "@/lib/client/api";
import type { PartnerDetailsInput } from "@/types/api";
import type { InvoiceData } from "@/types/invoice";

export interface ProposalFile {
  url: string;
  fileName: string;
}

interface ProposalStepProps {
  invoice: InvoiceData;
  partner: PartnerDetailsInput;
  proposal: ProposalFile | null;
  onPartnerChange: (partner: PartnerDetailsInput) => void;
  onProposalReady: (proposal: ProposalFile) => void;
  onBack: () => void;
  onContinue: () => void;
}

const TEXT_FIELDS: { field: keyof Omit<PartnerDetailsInput, "validityDays">; label: string; required: boolean }[] = [
  { field: "prospectName", label: "Prospect (customer) name", required: true },
  { field: "partnerName", label: "Your name", required: true },
  { field: "partnerCompany", label: "Your company", required: true },
  { field: "partnerPhone", label: "Your phone", required: false },
  { field: "partnerEmail", label: "Your email", required: false },
];

export function ProposalStep({
  invoice,
  partner,
  proposal,
  onPartnerChange,
  onProposalReady,
  onBack,
  onContinue,
}: ProposalStepProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const missingRequired = TEXT_FIELDS.some(({ field, required }) => required && partner[field].trim() === "");

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const blob = await postForBlob("/api/proposal", { invoice, partner });
      const safeName = partner.prospectName.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "prospect";
      onProposalReady({ url: URL.createObjectURL(blob), fileName: `BCOM-proposal-${safeName}.pdf` });
    } catch (generateError) {
      setError(errorMessage(generateError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-5" aria-labelledby="proposal-title">
      <div>
        <h2 id="proposal-title" className="text-xl font-bold">
          Customer proposal
        </h2>
        <p className="text-sm text-muted">
          A branded PDF with the recommended services, cost comparison, savings and commercial conditions.
        </p>
      </div>

      <form
        className="grid gap-3 rounded-lg border border-line bg-white p-4 sm:grid-cols-2 lg:grid-cols-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!missingRequired && !busy) void generate();
        }}
      >
        {TEXT_FIELDS.map(({ field, label, required }) => (
          <label key={field} className="flex flex-col gap-1 text-xs font-semibold text-muted">
            {label}
            {required ? "" : " (optional)"}
            <input
              id={`partner-${field}`}
              value={partner[field]}
              required={required}
              onChange={(event) => onPartnerChange({ ...partner, [field]: event.target.value })}
              className="rounded border border-line px-2 py-1.5 text-sm text-ink focus-visible:outline-2 focus-visible:outline-accent"
            />
          </label>
        ))}
        <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
          Rates valid for
          <select
            id="partner-validity"
            value={partner.validityDays}
            onChange={(event) => onPartnerChange({ ...partner, validityDays: Number(event.target.value) })}
            className="rounded border border-line px-2 py-1.5 text-sm text-ink"
          >
            <option value={14}>14 days</option>
            <option value={30}>30 days</option>
            <option value={60}>60 days</option>
          </select>
        </label>
        <div className="flex items-end sm:col-span-2 lg:col-span-3">
          <Button type="submit" disabled={busy || missingRequired}>
            {busy ? "Creating PDF…" : proposal ? "Create the PDF again" : "Create proposal PDF"}
          </Button>
        </div>
      </form>

      {error ? <Notice tone="error" title="Could not create the proposal">{error}</Notice> : null}

      {proposal ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <a
              href={proposal.url}
              download={proposal.fileName}
              className="rounded-md border border-line bg-white px-4 py-2 text-sm font-semibold hover:bg-band"
            >
              Download {proposal.fileName}
            </a>
            <span className="text-sm text-muted">Attach this PDF when you send the WhatsApp message.</span>
          </div>
          <iframe
            title="Proposal preview"
            src={proposal.url}
            className="h-[75vh] w-full rounded-lg border border-line bg-white"
          />
        </div>
      ) : null}

      <div className="flex flex-wrap justify-between gap-3">
        <Button variant="secondary" onClick={onBack}>
          Back to savings
        </Button>
        <Button onClick={onContinue} disabled={!proposal}>
          Prepare WhatsApp message
        </Button>
      </div>
    </section>
  );
}
