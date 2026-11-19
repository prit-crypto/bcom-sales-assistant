export const STEPS = [
  { id: "upload", label: "Upload invoice" },
  { id: "review", label: "Check shipments" },
  { id: "savings", label: "Savings" },
  { id: "proposal", label: "Proposal PDF" },
  { id: "whatsapp", label: "WhatsApp message" },
] as const;

export type StepId = (typeof STEPS)[number]["id"];

export function stepIndex(step: StepId): number {
  return STEPS.findIndex((item) => item.id === step);
}

interface StepperProps {
  current: StepId;
  /** Furthest step the user has reached; earlier steps can be revisited */
  reached: StepId;
  onSelect: (step: StepId) => void;
}

export function Stepper({ current, reached, onSelect }: StepperProps) {
  const reachedIndex = stepIndex(reached);
  return (
    <nav aria-label="Steps">
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {STEPS.map((step, index) => {
          const isCurrent = step.id === current;
          const isAvailable = index <= reachedIndex;
          return (
            <li key={step.id}>
              <button
                type="button"
                disabled={!isAvailable}
                onClick={() => onSelect(step.id)}
                aria-current={isCurrent ? "step" : undefined}
                className={`flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
                  isCurrent
                    ? "border-ink bg-ink text-white"
                    : isAvailable
                      ? "border-line bg-white hover:bg-band"
                      : "border-line bg-white/60 text-muted"
                }`}
              >
                <span
                  className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    isCurrent ? "bg-accent text-white" : isAvailable ? "bg-band text-ink" : "bg-band text-muted"
                  }`}
                >
                  {index + 1}
                </span>
                <span className="truncate font-medium">{step.label}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
