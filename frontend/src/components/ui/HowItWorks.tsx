"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState, useSyncExternalStore } from "react";
import { Icon } from "./Icon";

const GUIDE_KEY = "bcom-guide-seen-v1";
const listeners = new Set<() => void>();

/** Whether this browser has already closed the guide. Blocked storage counts as "seen": no nagging. */
function readSeen(): boolean {
  try {
    return window.localStorage.getItem(GUIDE_KEY) === "1";
  } catch {
    return true;
  }
}

function markSeen(): void {
  try {
    window.localStorage.setItem(GUIDE_KEY, "1");
  } catch {
    // Blocked storage: the guide simply shows again next time.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const STEPS = [
  { title: "Upload", detail: "The prospect's courier invoice: PDF, photo, CSV or Excel." },
  { title: "Check", detail: "Fix anything the reader missed. Every value can be edited." },
  { title: "Send", detail: "Download the proposal PDF and send the WhatsApp message yourself." },
];

/**
 * A short "how this works" strip, shown on the first visit and re-opened from its link. The server
 * render keeps it hidden, so the page never flashes it for returning partners.
 */
export function HowItWorks() {
  const reduce = useReducedMotion();
  const seen = useSyncExternalStore(subscribe, readSeen, () => true);
  const [reopened, setReopened] = useState(false);
  const open = reopened || !seen;

  function close() {
    setReopened(false);
    markSeen();
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <AnimatePresence initial={false} mode="wait">
        {open ? (
          <motion.section
            key="guide"
            aria-labelledby="how-title"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
            transition={{ type: "spring", bounce: 0, duration: 0.3 }}
            className="w-full rounded-[22px] bg-surface p-5 shadow-card sm:p-6"
          >
            <div className="flex items-center justify-between gap-3 pb-4">
              <h2 id="how-title" className="type-headline text-lg font-semibold">
                How this works
              </h2>
              <button
                type="button"
                onClick={close}
                className="pressable min-h-10 rounded-full px-3 text-sm font-semibold text-accent hover:bg-accent-tint focus-visible:outline-2 focus-visible:outline-accent"
              >
                Got it
              </button>
            </div>
            <ol className="grid gap-4 sm:grid-cols-3">
              {STEPS.map((step, index) => (
                <li key={step.title} className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-tint text-sm font-bold text-accent"
                  >
                    {index + 1}
                  </span>
                  <span className="flex flex-col gap-0.5">
                    <span className="text-[15px] font-semibold">{step.title}</span>
                    <span className="text-sm leading-snug text-secondary">{step.detail}</span>
                  </span>
                </li>
              ))}
            </ol>
          </motion.section>
        ) : (
          <motion.button
            key="link"
            type="button"
            onClick={() => setReopened(true)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="pressable inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-accent hover:bg-accent-tint focus-visible:outline-2 focus-visible:outline-accent"
          >
            <Icon name="info" className="size-4" />
            How it works
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
