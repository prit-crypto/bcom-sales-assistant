"use client";

import Image from "next/image";

export const STEPS = [
  { id: "upload", label: "Upload" },
  { id: "review", label: "Check shipments" },
  { id: "savings", label: "Savings" },
  { id: "proposal", label: "Proposal" },
  { id: "whatsapp", label: "WhatsApp" },
] as const;

export type StepId = (typeof STEPS)[number]["id"];

export function stepIndex(step: StepId): number {
  return STEPS.findIndex((item) => item.id === step);
}

/** Slim translucent top bar: logo, where you are, progress dots, and a way out. */
export function AppBar({
  current,
  reached,
  onSelect,
  onRestart,
  sampleMode = false,
}: {
  current: StepId;
  /** Furthest step reached; earlier steps can be revisited from the dots */
  reached: StepId;
  onSelect: (step: StepId) => void;
  /** Shown once there is something to start over from */
  onRestart: (() => void) | null;
  /** No AI reader is active: only the sample invoices and spreadsheets can be read */
  sampleMode?: boolean;
}) {
  const currentIndex = stepIndex(current);
  const reachedIndex = stepIndex(reached);

  return (
    <header className="material sticky top-0 z-30 border-b border-separator bg-bar">
      <div className="mx-auto flex min-h-[60px] max-w-[1200px] flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-2.5 sm:px-6">
        <div className="flex items-center gap-3">
          <Image
            src="/brand/bcom-global-logo.png"
            alt="BCOM Global"
            width={464}
            height={213}
            priority
            className="h-7 w-auto dark:rounded-md dark:bg-white dark:px-1.5 dark:py-0.5"
          />
          <span aria-hidden="true" className="hidden h-5 w-px bg-separator sm:block" />
          <span className="type-headline hidden text-[15px] font-semibold sm:block">Sales Assistant</span>
          {sampleMode ? (
            <span
              title="No AI reader is switched on: the sample PDFs and CSV or Excel statements work."
              className="rounded-full bg-fill px-2.5 py-0.5 text-xs font-semibold text-secondary"
            >
              Sample mode
            </span>
          ) : null}
        </div>

        <nav aria-label="Progress" className="order-3 flex w-full items-center justify-between gap-3 sm:order-none sm:w-auto sm:justify-start">
          <p className="text-[13px] text-secondary">
            Step {currentIndex + 1} of {STEPS.length} · <span className="font-semibold text-ink">{STEPS[currentIndex]!.label}</span>
          </p>
          <ol className="flex items-center">
            {STEPS.map((step, index) => {
              const isCurrent = index === currentIndex;
              const available = index <= reachedIndex && !isCurrent;
              const dot = `block h-2 rounded-full transition-all duration-300 ${isCurrent ? "w-[22px] bg-accent" : index <= reachedIndex ? "w-2 bg-accent" : "w-2 bg-fill"}`;
              return (
                <li key={step.id}>
                  {available ? (
                    <button
                      type="button"
                      onClick={() => onSelect(step.id)}
                      aria-label={`Go to ${step.label}`}
                      className="flex h-6 min-w-6 items-center justify-center rounded-full px-[3px] focus-visible:outline-2 focus-visible:outline-accent"
                    >
                      <span className={dot} />
                    </button>
                  ) : (
                    <span
                      className="flex h-6 min-w-6 items-center justify-center px-[3px]"
                      aria-current={isCurrent ? "step" : undefined}
                      aria-label={`${step.label}${isCurrent ? ", current step" : ", not reached yet"}`}
                      role="img"
                    >
                      <span className={dot} />
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="flex min-w-[92px] justify-end">
          {onRestart ? (
            <button
              type="button"
              onClick={onRestart}
              className="pressable rounded-full px-2 py-2 text-sm font-medium text-accent hover:bg-accent-tint focus-visible:outline-2 focus-visible:outline-accent"
            >
              Start over
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );
}
