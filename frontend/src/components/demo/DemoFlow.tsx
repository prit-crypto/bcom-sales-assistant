"use client";

import { AnimatePresence, motion, useIsPresent, useReducedMotion, type Variants } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import { AppBar, stepIndex, type StepId } from "@/components/ui/AppBar";
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

/** Forward: the new step comes in from the right. Back: it comes in from the left, the old one leaves right. */
const SLIDE: Variants = {
  enter: (direction: number) => ({ x: direction * 48, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({ x: direction * -48, opacity: 0 }),
};
// Same properties as SLIDE (x stays 0), so the server-rendered page matches whichever one the browser picks.
const FADE: Variants = { enter: { x: 0, opacity: 0 }, center: { x: 0, opacity: 1 }, exit: { x: 0, opacity: 0 } };

/** While a step slides out, take it out of reach: no focus, no clicks, hidden from screen readers. */
function LeavingGuard({ children }: { children: ReactNode }) {
  const present = useIsPresent();
  return (
    <div inert={!present} aria-hidden={!present || undefined} className="flex flex-1 flex-col">
      {children}
    </div>
  );
}

/** Holds the state of the whole journey: upload → review → savings → proposal → WhatsApp. */
export function DemoFlow() {
  const reduce = useReducedMotion();
  const [config, setConfig] = useState<ConfigResponse | null>(null);
  const [step, setStep] = useState<StepId>("upload");
  const [direction, setDirection] = useState(1);
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

  // Free the PDF's memory when it is replaced or the page closes.
  useEffect(() => {
    return () => {
      if (proposal) URL.revokeObjectURL(proposal.url);
    };
  }, [proposal]);

  function goTo(next: StepId) {
    setDirection(stepIndex(next) >= stepIndex(step) ? 1 : -1);
    setStep(next);
    if (stepIndex(next) > stepIndex(reached)) setReached(next);
    window.scrollTo({ top: 0 });
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

  // Later steps need a comparison of the current data; without one, the partner is back on the review step.
  const current: StepId = !extracted ? "upload" : step !== "upload" && step !== "review" && !comparison ? "review" : step;

  function renderStep() {
    if (current === "upload" || !extracted) {
      return <UploadStep config={config} onExtracted={handleExtracted} />;
    }
    if (current === "review" || !comparison) {
      return (
        <ReviewStep
          invoice={extracted.invoice}
          fileName={extracted.fileName}
          comparing={comparing}
          error={compareError}
          onChange={handleInvoiceChange}
          onBack={() => goTo("upload")}
          onContinue={() => void compare()}
        />
      );
    }
    if (current === "savings") {
      return (
        <SavingsStep
          invoice={extracted.invoice}
          comparison={comparison}
          onBack={() => goTo("review")}
          onContinue={() => goTo("proposal")}
        />
      );
    }
    if (current === "proposal") {
      return (
        <ProposalStep
          invoice={extracted.invoice}
          partner={partner}
          proposal={proposal}
          onPartnerChange={(next) => {
            setPartner(next);
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
      );
    }
    return (
      <WhatsAppStep
        invoice={extracted.invoice}
        partner={partner}
        proposal={proposal}
        message={message}
        onMessage={setMessage}
        onBack={() => goTo("proposal")}
      />
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <AppBar current={current} reached={reached} onSelect={goTo} onRestart={extracted ? restart : null} />
      <div className="relative flex-1 overflow-x-clip">
        <AnimatePresence mode="popLayout" initial={false} custom={direction}>
          <motion.div
            key={current}
            custom={direction}
            variants={reduce ? FADE : SLIDE}
            initial="enter"
            animate="center"
            exit="exit"
            transition={reduce ? { duration: 0.15 } : { type: "spring", bounce: 0, duration: 0.35 }}
            className="flex min-h-[calc(100vh-61px)] flex-col"
          >
            <LeavingGuard>{renderStep()}</LeavingGuard>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
