"use client";

import { AnimatePresence, motion, useIsPresent, useReducedMotion, type Variants } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppBar, stepIndex, type StepId } from "@/components/ui/AppBar";
import { Banner } from "@/components/ui/Banner";
import type { InvoiceSource } from "@/components/ui/InvoiceViewer";
import { Toast, type ToastData } from "@/components/ui/Toast";
import { errorMessage, getJson, patchJson, postJson, sendNoContent } from "@/lib/client/api";
import { readInvoiceWithProgress, type StageEvent } from "@/lib/client/stream";
import { partnerForRequest } from "@/lib/partner";
import { EXAMPLE_PARTNER, loadPartnerDefaults, savePartnerDefaults } from "@/lib/partnerDefaults";
import { partnerSavable, useProposalSync } from "@/lib/useProposalSync";
import {
  clearSession,
  clearSourceFile,
  isSpreadsheet,
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
  ProposalDetail,
  ProviderInfo,
  Scenario,
} from "@/types/api";
import { LIKE_FOR_LIKE } from "@/types/api";
import type { InvoiceData } from "@/types/invoice";
import { ProposalStep, type ProposalFile } from "./ProposalStep";
import { ReviewStep } from "./ReviewStep";
import { SavingsStep } from "./SavingsStep";
import { UploadStep } from "./UploadStep";
import { WhatsAppStep } from "./WhatsAppStep";

/** Wait this long after the last what-if change before asking for new figures. */
const SCENARIO_DELAY_MS = 250;

/** How many edits Undo can step back through. */
const HISTORY_LIMIT = 20;

interface Extracted {
  invoice: InvoiceData;
  /** Who read the invoice; unknown for a proposal opened from the list */
  provider: ProviderInfo | null;
  /** For display: the file name, or "a.pdf + 1 more" */
  fileName: string;
  /** Every file in the proposal, in the order added (several months can be combined) */
  fileNames?: string[];
  /** The invoice as first read, before any correction (to learn from what the partner fixes) */
  original?: InvoiceData;
  /** Who read it, for that learning: an AI provider and model, "mock", or "spreadsheet" */
  reader?: { provider: string; model: string | null };
}

function displayName(names: string[]): string {
  return names.length > 1 ? `${names[0]} + ${names.length - 1} more` : (names[0] ?? "");
}

/** The saved proposal behind this journey (after "Compare"), as the server last reported it. */
export interface SavedInfo {
  id: string;
  reference: string;
  status: ProposalDetail["status"];
  followUpOn: string | null;
}

function savedInfo(detail: ProposalDetail): SavedInfo {
  return { id: detail.id, reference: detail.reference, status: detail.status, followUpOn: detail.follow_up_on };
}

/** Shows the proposal's own address, so a reload reopens it from the server. */
function showAddress(path: string) {
  if (window.location.pathname !== path) window.history.replaceState(null, "", path);
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

/**
 * Holds the state of the whole journey: upload → review → savings → proposal → WhatsApp. At "Compare" the
 * work is saved as a draft proposal and autosaved from then on; `proposalId` reopens a saved one.
 */
export function DemoFlow({ proposalId = null }: { proposalId?: string | null }) {
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
  /** The what-if on Savings; changing it re-prices without leaving the step */
  const [scenario, setScenario] = useState<Scenario>(LIKE_FOR_LIKE);
  const [scenarioUpdating, setScenarioUpdating] = useState(false);
  const [scenarioError, setScenarioError] = useState<string | null>(null);
  const scenarioTimer = useRef<number | undefined>(undefined);
  const scenarioRequest = useRef(0);
  // The partner's own details are remembered on this device (there are no accounts yet).
  const [partner, setPartner] = useState<PartnerDetailsInput>(() => ({ ...loadPartnerDefaults(), prospect_name: "" }));
  const [saved, setSaved] = useState<SavedInfo | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<ProposalFile | null>(null);
  const [message, setMessage] = useState<MessageResponse | null>(null);
  /** The uploaded invoices (PDFs and photos), for the viewer beside the shipments */
  const [sources, setSources] = useState<InvoiceSource[]>([]);
  const source = sources[0] ?? null;
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
      .catch((error: unknown) =>
        setConfig({ provider: null, problem: errorMessage(error), max_upload_mb: 10, privacy_notice: null, samples_only: false, email_enabled: false }),
      );
  }, []);

  // Free memory held by the PDF and the invoice file when they are replaced or the page closes.
  useEffect(() => {
    return () => {
      if (proposal) URL.revokeObjectURL(proposal.url);
    };
  }, [proposal]);
  useEffect(() => {
    return () => sources.forEach((item) => URL.revokeObjectURL(item.url));
  }, [sources]);

  const loadComparison = useCallback(async (invoice: InvoiceData, what: Scenario) => {
    setComparing(true);
    setCompareError(null);
    try {
      const result = await postJson<ComparisonResult>("/comparisons", { invoice, scenario: what });
      setComparison(result);
      return result;
    } catch (error) {
      setCompareError(errorMessage(error));
      return null;
    } finally {
      setComparing(false);
    }
  }, []);

  // A saved proposal opened from the list: everything comes from the server; it resumes at Savings.
  useEffect(() => {
    if (!proposalId) return;
    let cancelled = false;
    getJson<ProposalDetail>(`/proposals/${proposalId}`)
      .then((detail) => {
        if (cancelled) return;
        setExtracted({ invoice: detail.invoice, provider: null, fileName: detail.source_file_name ?? detail.reference });
        setPartner({ ...loadPartnerDefaults(), ...detail.partner });
        setScenario(detail.scenario);
        setComparison(detail.comparison);
        setMessage(detail.message ? { message: detail.message, source: "template", notice: null } : null);
        setSaved(savedInfo(detail));
        setReached(detail.message ? "whatsapp" : "proposal");
        setStep("savings");
        // Reloaded in the tab that uploaded it: the invoice file is still here for the viewer.
        const session = loadSession();
        if (session?.proposalId === proposalId && session.source) {
          const kept = session.source;
          void loadSourceFile().then((file) => {
            if (file && !cancelled) setSources([{ url: URL.createObjectURL(file), ...kept }]);
          });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) setOpenError(errorMessage(error));
      });
    return () => {
      cancelled = true;
    };
  }, [proposalId]);

  // After a refresh, bring the unsaved journey back from this tab's session storage.
  useEffect(() => {
    if (proposalId) return;
    const saved = loadSession();
    if (!saved?.extracted) return;
    // Work that was already saved reopens from the server, not from this copy.
    if (saved.proposalId) {
      clearSession();
      return;
    }
    const restore = async (session: SavedSession & { extracted: Extracted }) => {
      setExtracted(session.extracted);
      // Sessions saved before newer partner fields existed get their defaults.
      setPartner({ ...EXAMPLE_PARTNER, ...session.partner });
      const savedScenario = session.scenario ?? LIKE_FOR_LIKE;
      setScenario(savedScenario);
      setMessage(session.message);
      setReached(session.reached);
      setStep(session.step);
      setRestoredNotice(true);
      const file = session.source ? await loadSourceFile() : null;
      if (file && session.source) setSources([{ url: URL.createObjectURL(file), ...session.source }]);
      if (stepIndex(session.step) > stepIndex("review")) {
        setRestoring(true);
        const ok = (await loadComparison(session.extracted.invoice, savedScenario)) !== null;
        if (!ok) setStep("review");
        setRestoring(false);
      }
    };
    void restore(saved as SavedSession & { extracted: Extracted });
  }, [loadComparison, proposalId]);

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
      scenario,
      proposalId: saved?.id ?? null,
    });
  }, [step, reached, extracted, partner, message, source, scenario, saved]);

  // Autosave of a saved proposal: the shipments, the what-if, the partner details and the message.
  const draft = useMemo(
    () =>
      extracted && saved
        ? { invoice: extracted.invoice, scenario, partner, message: message?.message ?? null }
        : null,
    [extracted, saved, scenario, partner, message],
  );
  const onSaved = useCallback((detail: ProposalDetail) => setSaved(savedInfo(detail)), []);
  const sync = useProposalSync(saved?.id ?? null, draft, onSaved);

  useEffect(() => () => window.clearTimeout(scenarioTimer.current), []);

  function goTo(next: StepId) {
    setDirection(stepIndex(next) >= stepIndex(step) ? 1 : -1);
    setStep(next);
    if (stepIndex(next) > stepIndex(reached)) setReached(next);
    window.scrollTo({ top: 0 });
  }

  /** Any change to the shipments makes the comparison, proposal and message out of date. */
  function clearOutputs() {
    cancelScenarioUpdate();
    setComparison(null);
    setCompareError(null);
    setProposal(null);
    setMessage(null);
  }

  function cancelScenarioUpdate() {
    window.clearTimeout(scenarioTimer.current);
    scenarioRequest.current += 1;
    setScenarioUpdating(false);
    setScenarioError(null);
  }

  /** A what-if change: the old figures stay on screen (dimmed) until the new ones arrive. */
  function changeScenario(next: Scenario) {
    if (!extracted) return;
    setScenario(next);
    setProposal(null);
    setMessage(null);
    setReached("savings");
    window.clearTimeout(scenarioTimer.current);
    const id = ++scenarioRequest.current;
    const invoice = extracted.invoice;
    setScenarioUpdating(true);
    setScenarioError(null);
    scenarioTimer.current = window.setTimeout(() => {
      postJson<ComparisonResult>("/comparisons", { invoice, scenario: next })
        .then((result) => {
          if (id === scenarioRequest.current) setComparison(result);
        })
        .catch((error: unknown) => {
          if (id === scenarioRequest.current) setScenarioError(errorMessage(error));
        })
        .finally(() => {
          if (id === scenarioRequest.current) setScenarioUpdating(false);
        });
    }, SCENARIO_DELAY_MS);
  }

  function handleExtracted(result: ExtractResponse, files: File[]) {
    // A new invoice starts a new proposal.
    setSaved(null);
    showAddress("/new");
    const names = files.map((file) => file.name);
    const first = files[0]!;
    setExtracted({
      invoice: result.invoice,
      provider: result.provider,
      fileName: displayName(names),
      fileNames: names,
      original: result.invoice,
      reader: isSpreadsheet(first)
        ? { provider: "spreadsheet", model: null }
        : { provider: result.provider.id, model: result.provider.model },
    });
    // Statements have no pages to show beside the table; the first invoice is kept for a refresh.
    const viewable = files.filter((file) => !isSpreadsheet(file));
    setSources(viewable.map((file) => ({ url: URL.createObjectURL(file), name: file.name, kind: sourceKind(file.type) })));
    if (viewable[0]) saveSourceFile(viewable[0]);
    else clearSourceFile();
    setScenario(LIKE_FOR_LIKE);
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
    window.clearTimeout(scenarioTimer.current);
    scenarioRequest.current += 1;
    setScenarioUpdating(false);
    setComparison(null);
    setProposal(null);
    setMessage(null);
    setReached("review");
  }, []);

  const dismissToast = useCallback(() => setToast(null), []);

  async function compare() {
    if (!extracted) return;
    const result = await loadComparison(extracted.invoice, scenario);
    if (!result) return;
    goTo("savings");
    if (!saved && result.summary.compared_shipments > 0) void saveDraft(extracted);
  }

  /** First save, at Compare. Blank names are filled from the remembered details so it can be stored. */
  async function saveDraft(current: Extracted) {
    const defaults = loadPartnerDefaults();
    const details: PartnerDetailsInput = partnerSavable(partner)
      ? partner
      : {
          ...partner,
          prospect_name: partner.prospect_name.trim() || current.invoice.customer_name || "Unnamed prospect",
          partner_name: partner.partner_name.trim() || defaults.partner_name || EXAMPLE_PARTNER.partner_name,
          partner_company: partner.partner_company.trim() || defaults.partner_company || EXAMPLE_PARTNER.partner_company,
        };
    try {
      const detail = await postJson<ProposalDetail>("/proposals", {
        invoice: current.invoice,
        scenario,
        partner: partnerForRequest(details),
        source_file_name: current.fileNames?.[0] ?? current.fileName,
        source_files: current.fileNames ?? [current.fileName],
        original_invoice: current.original ?? null,
        reader: current.reader ?? null,
      });
      setSaved(savedInfo(detail));
      showAddress(`/proposals/${detail.id}/edit`);
      toastCount.current += 1;
      setToast({ id: toastCount.current, message: `Saved to your proposals · ${detail.reference}` });
    } catch (error) {
      // Saving is a convenience: the journey carries on, and the partner is told.
      toastCount.current += 1;
      setToast({ id: toastCount.current, message: `Not saved: ${errorMessage(error)}` });
    }
  }

  /**
   * "Add another month" on the shipments step: reads one more invoice and combines it (Undo takes it out
   * again). The first reading is combined the same way, so corrections stay comparable. Returns an error.
   */
  async function addMonth(file: File, onStage: (stage: StageEvent) => void): Promise<string | null> {
    if (!extracted) return null;
    try {
      const read = await readInvoiceWithProgress(file, onStage);
      const [combined, original] = await Promise.all([
        postJson<InvoiceData>("/invoices/combine", { invoices: [extracted.invoice, read.invoice] }),
        postJson<InvoiceData>("/invoices/combine", { invoices: [extracted.original ?? extracted.invoice, read.invoice] }),
      ]);
      handleInvoiceChange(combined, `Added ${file.name}`);
      const names = [...(extracted.fileNames ?? [extracted.fileName]), file.name];
      setExtracted((current) =>
        current ? { ...current, invoice: combined, original, fileNames: names, fileName: displayName(names) } : current,
      );
      if (!isSpreadsheet(file)) {
        setSources((current) => [...current, { url: URL.createObjectURL(file), name: file.name, kind: sourceKind(file.type) }]);
      }
      return null;
    } catch (error) {
      return errorMessage(error);
    }
  }

  /** History lines for things done outside the server (downloads, copy, WhatsApp). */
  const recordEvent = useCallback(
    (kind: "pdf_downloaded" | "message_copied" | "whatsapp_opened") => {
      if (saved) void sendNoContent(`/proposals/${saved.id}/events`, "POST", { kind }).catch(() => undefined);
    },
    [saved],
  );

  /** "Mark as sent": the server sets the follow-up date. Errors go back to the button that asked. */
  async function markSent(): Promise<void> {
    if (!saved) return;
    // The message goes along: it may still be waiting for autosave.
    const body = { status: "sent", message: message?.message ?? null };
    setSaved(savedInfo(await patchJson<ProposalDetail>(`/proposals/${saved.id}`, body)));
  }

  function changePartner(next: PartnerDetailsInput) {
    setPartner(next);
    savePartnerDefaults(next);
  }

  function restart() {
    clearSession();
    setSaved(null);
    showAddress("/new");
    setExtracted(null);
    setSources([]);
    history.current = [];
    setUndoCount(0);
    setToast(null);
    setRestoredNotice(false);
    clearOutputs();
    setScenario(LIKE_FOR_LIKE);
    setPartner({ ...loadPartnerDefaults(), prospect_name: "" });
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
    if (proposalId && !extracted) {
      return (
        <main className="mx-auto flex w-full max-w-[720px] flex-1 flex-col justify-center gap-4 px-4" aria-busy={!openError}>
          {openError ? (
            <Banner tone="error" title="Could not open this proposal">
              {openError}{" "}
              <Link href="/" className="font-semibold underline">
                Back to proposals
              </Link>
            </Banner>
          ) : (
            <p role="status" className="text-center text-secondary">
              Opening the proposal…
            </p>
          )}
        </main>
      );
    }
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
          sources={sources}
          onAddMonth={addMonth}
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
          scenario={scenario}
          updating={scenarioUpdating}
          scenarioError={scenarioError}
          onScenarioChange={changeScenario}
          onBack={() => goTo("review")}
          onContinue={() => goTo("proposal")}
        />
      );
    }
    if (current === "proposal") {
      return (
        <ProposalStep
          invoice={extracted.invoice}
          scenario={scenario}
          partner={partner}
          proposal={proposal}
          onPartnerChange={(next) => {
            changePartner(next);
            setMessage(null);
            setReached("proposal");
          }}
          onProposalReady={(file) => {
            setProposal(file);
            setMessage(null);
          }}
          onDownload={() => recordEvent("pdf_downloaded")}
          onBack={() => goTo("savings")}
          onContinue={() => goTo("whatsapp")}
        />
      );
    }
    return (
      <WhatsAppStep
        invoice={extracted.invoice}
        scenario={scenario}
        partner={partner}
        proposal={proposal}
        message={message}
        onMessage={setMessage}
        saved={saved}
        onMarkSent={markSent}
        onEvent={recordEvent}
        onBack={() => goTo("proposal")}
      />
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <AppBar
        current={current}
        reached={reached}
        onSelect={goTo}
        onRestart={extracted ? restart : null}
        sampleMode={config?.provider?.id === "mock"}
        saveState={saved ? sync.state : null}
      />
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
