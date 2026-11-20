"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import type { ReadingStage, StageEvent } from "@/lib/client/stream";

const ORDER: ReadingStage[] = ["received", "checked", "reading", "cleaning", "checking"];

const LABEL: Record<ReadingStage, string> = {
  received: "Uploaded",
  checked: "File checked",
  reading: "Reading the invoice",
  cleaning: "Tidying the data",
  checking: "Running the checks",
};

/**
 * What is happening while an invoice is read: a short checklist of stages, the time so far and, once the
 * server knows it, how long reads usually take. `part` says which file of several is being read.
 */
export function ReadingProgress({
  fileName,
  stage,
  part,
}: {
  fileName: string;
  stage: StageEvent | null;
  part?: { index: number; total: number };
}) {
  const reduce = useReducedMotion();
  const [startedAt] = useState(() => Date.now());
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  const currentIndex = stage ? ORDER.indexOf(stage.stage) : -1;
  const [readingLabel, setReadingLabel] = useState<string | null>(null);
  const [typical, setTypical] = useState<number | null>(null);
  if (stage?.stage === "reading" && stage.label && stage.label !== readingLabel) {
    setReadingLabel(stage.label);
    setTypical(stage.typical_seconds ?? null);
  }

  return (
    <div className="flex w-full max-w-[360px] flex-col gap-3 text-left" role="status" aria-live="polite">
      <p className="truncate text-center text-[15px] text-secondary">
        {part && part.total > 1 ? `Invoice ${part.index} of ${part.total} · ` : ""}
        {fileName}
      </p>
      <ol className="flex flex-col gap-2">
        {ORDER.map((step, index) => {
          const done = index < currentIndex;
          const active = index === currentIndex || (currentIndex === -1 && index === 0);
          const label = step === "reading" && readingLabel ? readingLabel : LABEL[step];
          return (
            <li key={step} className={`flex items-center gap-3 text-[15px] ${done || active ? "text-ink" : "text-secondary"}`}>
              <span
                aria-hidden="true"
                className={`flex size-5 shrink-0 items-center justify-center rounded-full ${
                  done ? "bg-accent text-on-accent" : active ? "border-2 border-accent" : "border-2 border-separator"
                }`}
              >
                {done ? (
                  <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                ) : active && !reduce ? (
                  <motion.span
                    className="size-1.5 rounded-full bg-accent"
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1.2, repeat: Infinity }}
                  />
                ) : null}
              </span>
              <span className={active ? "font-semibold" : ""}>
                {label}
                <span className="sr-only">{done ? ", done" : active ? ", in progress" : ""}</span>
              </span>
            </li>
          );
        })}
      </ol>
      <p className="tabular text-center text-[13px] text-secondary">
        {elapsed} s{typical ? ` · usually about ${typical} s` : ""}
      </p>
    </div>
  );
}
