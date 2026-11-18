"use client";

import { useEffect, useMemo, useState } from "react";
import { errorMessage, getJson } from "@/lib/client/api";
import { compareInvoice } from "@/lib/pricing/comparison";
import type { ConfigResponse, ExtractResponse, MessageResponse, PartnerDetailsInput } from "@/types/api";
import type { InvoiceData } from "@/types/invoice";
import type { ProviderInfo } from "@/types/provider";
import { ProposalStep, type ProposalFile } from "./ProposalStep";
import { ReviewStep } from "./ReviewStep";
import { SavingsStep } from "./SavingsStep";
import { Stepper, stepIndex, type StepId } from "./Stepper";
import { UploadStep } from "./UploadStep";
import { WhatsAppStep } from "./WhatsAppStep";

/** Example partner details for the demo – clearly placeholders, edited on the proposal step. */
const EXAMPLE_PARTNER: Omit<PartnerDetailsInput, "prospectName"> = {
  partnerName: "Rahul Mehta",
  partnerCompany: "Sharjah Logistics Partners",
  partnerPhone: "+971 50 000 0000",
  partnerEmail: "rahul@example.com",
  validityDays: 30,
};

interface Extracted {
  invoice: InvoiceData;
  provider: ProviderInfo;
  fileName: string;
}

/** Holds the state of the whole demo journey: upload → review → savings → proposal → WhatsApp. */
export function DemoFlow() {
  const [config, setConfig] = useState<ConfigResponse | null>(null);
  const [step, setStep] = useState<StepId>("upload");
  const [reached, setReached] = useState<StepId>("upload");
  const [extracted, setExtracted] = useState<Extracted | null>(null);
  const [partner, setPartner] = useState<PartnerDetailsInput>({ ...EXAMPLE_PARTNER, prospectName: "" });
  const [proposal, setProposal] = useState<ProposalFile | null>(null);
  const [message, setMessage] = useState<MessageResponse | null>(null);

  useEffect(() => {
    getJson<ConfigResponse>("/api/config")
      .then(setConfig)
      .catch((error: unknown) => setConfig({ provider: null, problem: errorMessage(error), maxUploadMb: 10 }));
  }, []);

  // Free the PDF preview's memory when it is replaced or the page closes.
  useEffect(() => {
    return () => {
      if (proposal) URL.revokeObjectURL(proposal.url);
    };
  }, [proposal]);

  const comparison = useMemo(() => (extracted ? compareInvoice(extracted.invoice) : null), [extracted]);

  function goTo(next: StepId) {
    setStep(next);
    if (stepIndex(next) > stepIndex(reached)) setReached(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /** Any change to the data makes the proposal and message out of date. */
  function clearOutputs() {
    setProposal(null);
    setMessage(null);
  }

  function handleExtracted(result: ExtractResponse, fileName: string) {
    setExtracted({ invoice: result.invoice, provider: result.provider, fileName });
    setPartner((current) => ({ ...current, prospectName: result.invoice.customerName ?? "" }));
    clearOutputs();
    setReached("review");
    goTo("review");
  }

  function handleInvoiceChange(invoice: InvoiceData) {
    setExtracted((current) => (current ? { ...current, invoice } : current));
    clearOutputs();
    setReached(step);
  }

  function restart() {
    setExtracted(null);
    clearOutputs();
    setPartner({ ...EXAMPLE_PARTNER, prospectName: "" });
    setReached("upload");
    goTo("upload");
  }

  return (
    <div className="flex flex-col gap-6">
      <Stepper current={step} reached={reached} onSelect={goTo} />

      {step === "upload" || !extracted || !comparison ? (
        <UploadStep config={config} onExtracted={handleExtracted} />
      ) : step === "review" ? (
        <ReviewStep
          invoice={extracted.invoice}
          fileName={extracted.fileName}
          onChange={handleInvoiceChange}
          onContinue={() => goTo("savings")}
        />
      ) : step === "savings" ? (
        <SavingsStep
          invoice={extracted.invoice}
          comparison={comparison}
          onBack={() => goTo("review")}
          onContinue={() => goTo("proposal")}
        />
      ) : step === "proposal" ? (
        <ProposalStep
          invoice={extracted.invoice}
          partner={partner}
          proposal={proposal}
          onPartnerChange={(next) => {
            setPartner(next);
            clearOutputs();
            setReached("proposal");
          }}
          onProposalReady={(file) => {
            setProposal(file);
            setMessage(null);
          }}
          onBack={() => goTo("savings")}
          onContinue={() => goTo("whatsapp")}
        />
      ) : (
        <WhatsAppStep
          invoice={extracted.invoice}
          partner={partner}
          message={message}
          onMessage={setMessage}
          onBack={() => goTo("proposal")}
          onRestart={restart}
        />
      )}
    </div>
  );
}
