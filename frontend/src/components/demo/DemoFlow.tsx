"use client";

import { useEffect, useState } from "react";
import { errorMessage, getJson, postJson } from "@/lib/client/api";
import type {
  ComparisonResult,
  ConfigResponse,
  ExtractResponse,
  MessageResponse,
  PartnerDetailsInput,
  ProviderInfo,
} from "@/types/api";
import type { InvoiceData } from "@/types/invoice";
import { ProposalStep, type ProposalFile } from "./ProposalStep";
import { ReviewStep } from "./ReviewStep";
import { SavingsStep } from "./SavingsStep";
import { Stepper, stepIndex, type StepId } from "./Stepper";
import { UploadStep } from "./UploadStep";
import { WhatsAppStep } from "./WhatsAppStep";

/** Example partner details for the demo – clearly placeholders, edited on the proposal step. */
const EXAMPLE_PARTNER: Omit<PartnerDetailsInput, "prospect_name"> = {
  partner_name: "Rahul Mehta",
  partner_company: "Sharjah Logistics Partners",
  partner_phone: "+971 50 000 0000",
  partner_email: "rahul@example.com",
  validity_days: 30,
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
  /** The backend's comparison of the current invoice; null until compared, and again after any edit */
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [comparing, setComparing] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [partner, setPartner] = useState<PartnerDetailsInput>({ ...EXAMPLE_PARTNER, prospect_name: "" });
  const [proposal, setProposal] = useState<ProposalFile | null>(null);
  const [message, setMessage] = useState<MessageResponse | null>(null);

  useEffect(() => {
    getJson<ConfigResponse>("/config")
      .then(setConfig)
      .catch((error: unknown) => setConfig({ provider: null, problem: errorMessage(error), max_upload_mb: 10 }));
  }, []);

  // Free the PDF preview's memory when it is replaced or the page closes.
  useEffect(() => {
    return () => {
      if (proposal) URL.revokeObjectURL(proposal.url);
    };
  }, [proposal]);

  function goTo(next: StepId) {
    setStep(next);
    if (stepIndex(next) > stepIndex(reached)) setReached(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /** Any change to the shipments makes the comparison, proposal and message out of date. */
  function clearOutputs() {
    setComparison(null);
    setCompareError(null);
    setProposal(null);
    setMessage(null);
  }

  function handleExtracted(result: ExtractResponse, fileName: string) {
    setExtracted({ invoice: result.invoice, provider: result.provider, fileName });
    setPartner((current) => ({ ...current, prospect_name: result.invoice.customer_name ?? "" }));
    clearOutputs();
    setReached("review");
    goTo("review");
  }

  function handleInvoiceChange(invoice: InvoiceData) {
    setExtracted((current) => (current ? { ...current, invoice } : current));
    clearOutputs();
    setReached("review");
  }

  async function compare() {
    if (!extracted) return;
    setComparing(true);
    setCompareError(null);
    try {
      setComparison(await postJson<ComparisonResult>("/comparisons", { invoice: extracted.invoice }));
      goTo("savings");
    } catch (error) {
      setCompareError(errorMessage(error));
    } finally {
      setComparing(false);
    }
  }

  function restart() {
    setExtracted(null);
    clearOutputs();
    setPartner({ ...EXAMPLE_PARTNER, prospect_name: "" });
    setReached("upload");
    goTo("upload");
  }

  if (step === "upload" || !extracted) {
    return (
      <div className="flex flex-col gap-6">
        <Stepper current="upload" reached={reached} onSelect={goTo} />
        <UploadStep config={config} onExtracted={handleExtracted} />
      </div>
    );
  }

  // Later steps need a comparison of the current data; without one, the partner is back on the review step.
  const current: StepId = step !== "review" && !comparison ? "review" : step;

  return (
    <div className="flex flex-col gap-6">
      <Stepper current={current} reached={reached} onSelect={goTo} />

      {current === "review" || !comparison ? (
        <ReviewStep
          invoice={extracted.invoice}
          fileName={extracted.fileName}
          comparing={comparing}
          error={compareError}
          onChange={handleInvoiceChange}
          onContinue={() => void compare()}
        />
      ) : current === "savings" ? (
        <SavingsStep
          invoice={extracted.invoice}
          comparison={comparison}
          onBack={() => goTo("review")}
          onContinue={() => goTo("proposal")}
        />
      ) : current === "proposal" ? (
        <ProposalStep
          invoice={extracted.invoice}
          partner={partner}
          proposal={proposal}
          onPartnerChange={(next) => {
            setPartner(next);
            setProposal(null);
            setMessage(null);
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
