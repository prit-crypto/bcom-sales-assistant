"use client";

import { AnimatePresence, motion, useIsPresent, useReducedMotion, type Variants } from "motion/react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AppBar, stepIndex, type StepId } from "@/components/ui/AppBar";
import { Banner } from "@/components/ui/Banner";
import type { InvoiceSource } from "@/components/ui/InvoiceViewer";
import { Toast, type ToastData } from "@/components/ui/Toast";
import { errorMessage, getJson, postJson } from "@/lib/client/api";
import {
  clearSession,
  loadSession,
  loadSourceFile,
  saveSession,
  saveSourceFile,
  sourceKind,
  type SavedSession,
} from "@/lib/session";
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

/** How many edits Undo can step back through. */
const HISTORY_LIMIT = 20;

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

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
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
  /** The uploaded invoice, for the viewer beside the shipments */
  const [source, setSource] = useState<InvoiceSource | null>(null);
  /** Earlier versions of the invoice, newest last, for Undo (a ref: Undo must read the latest list) */
  const history = useRef<InvoiceData[]>([]);
  const [undoCount, setUndoCount] = useState(0);
  const [toast, setToast] = useState<ToastData | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoredNotice, setRestoredNotice] = useState(false);
  const skipFirstSave = useRef(true);
  const toastCount = useRef(0);

  useEffect(() => {
    getJson<ConfigResponse>("/config")
      .then(setConfig)
      .catch((error: unknown) => setConfig({ provider: null, problem: errorMessage(error), max_upload_mb: 10 }));
  }, []);

  // Free memory held by the PDF and the invoice file when they are replaced or the page closes.
  useEffect(() => {
    return () => {
      if (proposal) URL.revokeObjectURL(proposal.url);
    };
  }, [proposal]);
  useEffect(() => {
    return () => {
      if (source) URL.revokeObjectURL(source.url);
    };
  }, [source]);

  const loadComparison = useCallback(async (invoice: InvoiceData) => {
    setComparing(true);
    setCompareError(null);
    try {
      setComparison(await postJson<ComparisonResult>("/comparisons", { invoice }));
      return true;
    } catch (error) {
      setCompareError(errorMessage(error));
      return false;
    } finally {
      setComparing(false);
    }
  }, []);

  // After a refresh, bring the journey back from this tab's session storage.
  useEffect(() => {
    const saved = loadSession();
    if (!saved?.extracted) return;
    const restore = async (session: SavedSession & { extracted: Extracted }) => {
      setExtracted(session.extracted);
      setPartner(session.partner);
      setMessage(session.message);
      setReached(session.reached);
      setStep(session.step);
      setRestoredNotice(true);
      const file = session.source ? await loadSourceFile() : null;
      if (file && session.source) setSource({ url: URL.createObjectURL(file), ...session.source });
      if (stepIndex(session.step) > stepIndex("review")) {
        setRestoring(true);
        const ok = await loadComparison(session.extracted.invoice);
        if (!ok) setStep("review");
        setRestoring(false);
      }
    };
    void restore(saved as SavedSession & { extracted: Extracted });
  }, [loadComparison]);

  // Save the journey whenever it changes (not on the very first render, before any restore ran).
  useEffect(() => {
    if (skipFirstSave.current) {
      skipFirstSave.current = false;
      return;
    }
    if (!extracted) return;
    saveSession({
      version: 1,
      step,
      reached,
      extracted,
      partner,
      message,
      source: source ? { name: source.name, kind: source.kind } : null,
    });
  }, [step, reached, extracted, partner, message, source]);

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

  function handleExtracted(result: ExtractResponse, file: File) {
    setExtracted({ invoice: result.invoice, provider: result.provider, fileName: file.name });
    setSource({ url: URL.createObjectURL(file), name: file.name, kind: sourceKind(file.type) });
    saveSourceFile(file);
    setPartner((current) => ({ ...current, prospect_name: result.invoice.customer_name ?? "" }));
    history.current = [];
    setUndoCount(0);
    setRestoredNotice(false);
    clearOutputs();
    setReached("review");
    goTo("review");
  }

  /** `note` (e.g. "Weight set to 12 kg") marks an edit that Undo can reverse; typing in a header field has none. */
  function handleInvoiceChange(invoice: InvoiceData, note?: string) {
    if (note && extracted) {
      history.current = [...history.current, extracted.invoice].slice(-HISTORY_LIMIT);
      setUndoCount(history.current.length);
      toastCount.current += 1;
      setToast({ id: toastCount.current, message: note, actionLabel: "Undo", onAction: undo, hint: "⌘Z" });
    }
    setExtracted((current) => (current ? { ...current, invoice } : current));
    clearOutputs();
    setReached("review");
  }

  const undo = useCallback(() => {
    const previous = history.current[history.current.length - 1];
    if (!previous) return;
    history.current = history.current.slice(0, -1);
    setUndoCount(history.current.length);
    setExtracted((current) => (current ? { ...current, invoice: previous } : current));
    setComparison(null);
    setProposal(null);
    setMessage(null);
    setReached("review");
  }, []);

  const dismissToast = useCallback(() => setToast(null), []);

  async function compare() {
    if (!extracted) return;
    if (await loadComparison(extracted.invoice)) goTo("savings");
  }

  function restart() {
    clearSession();
    setExtracted(null);
    setSource(null);
    history.current = [];
    setUndoCount(0);
    setToast(null);
    setRestoredNotice(false);
    clearOutputs();
    setPartner({ ...EXAMPLE_PARTNER, prospect_name: "" });
    setReached("upload");
    goTo("upload");
  }

  // Later steps need a comparison of the current data; without one, the partner is back on the review step.
  const current: StepId = !extracted ? "upload" : step !== "upload" && step !== "review" && !comparison && !restoring ? "review" : step;

  // ⌘Z / Ctrl+Z undoes the last edit on the shipments step (text fields keep their own undo).
  useEffect(() => {
    if (current !== "review") return;
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === "z" && !isTyping(event.target)) {
        event.preventDefault();
        undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, undo]);

  function renderStep() {
    if (current === "upload" || !extracted) {
      return <UploadStep config={config} onExtracted={handleExtracted} />;
    }
    if (restoring && !comparison) {
      return (
        <main className="flex flex-1 items-center justify-center px-4" aria-busy="true">
          <p role="status" className="text-secondary">
            Restoring your last session…
          </p>
        </main>
      );
    }
    if (current === "review" || !comparison) {
      return (
        <ReviewStep
          invoice={extracted.invoice}
          fileName={extracted.fileName}
          source={source}
          comparing={comparing}
          error={compareError}
          canUndo={undoCount > 0}
          onUndo={undo}
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
      {restoredNotice && extracted ? (
        <div className="mx-auto w-full max-w-[1200px] px-4 pt-4 sm:px-6">
          <Banner
            tone="success"
            title="Restored your last session"
            action={
              <span className="flex gap-1">
                <button
                  type="button"
                  onClick={restart}
                  className="pressable rounded-full px-3 py-2 text-sm font-semibold text-accent hover:bg-surface/60 focus-visible:outline-2 focus-visible:outline-accent"
                >
                  Discard
                </button>
                <button
                  type="button"
                  onClick={() => setRestoredNotice(false)}
                  className="pressable rounded-full px-3 py-2 text-sm font-medium text-secondary hover:bg-surface/60 focus-visible:outline-2 focus-visible:outline-accent"
                >
                  Keep
                </button>
              </span>
            }
          >
            Your edits from before the page reloaded are back.
          </Banner>
        </div>
      ) : null}
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
      <Toast toast={toast} onDismiss={dismissToast} />
    </div>
  );
}
