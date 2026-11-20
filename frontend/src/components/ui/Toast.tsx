"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect } from "react";

export interface ToastData {
  /** Changes for every new toast, so the timer restarts */
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Shown after the action, e.g. the keyboard shortcut */
  hint?: string;
}

/** A short message above the bottom bar, with one optional action (Undo). Disappears after 5 seconds. */
export function Toast({ toast, onDismiss }: { toast: ToastData | null; onDismiss: () => void }) {
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(onDismiss, 5000);
    return () => window.clearTimeout(timer);
  }, [toast, onDismiss]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-40 flex justify-center px-4 sm:bottom-28">
      <AnimatePresence>
        {toast ? (
          <motion.div
            key={toast.id}
            role="status"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
            transition={reduce ? { duration: 0.15 } : { type: "spring", bounce: 0, duration: 0.3 }}
            className="pointer-events-auto flex max-w-full items-center gap-3 rounded-full bg-hero py-2 pr-2 pl-4 text-sm text-white shadow-float dark:bg-hero-ink dark:text-hero"
          >
            <span className="min-w-0 truncate">{toast.message}</span>
            {toast.onAction ? (
              <button
                type="button"
                onClick={() => {
                  toast.onAction?.();
                  onDismiss();
                }}
                className="pressable shrink-0 rounded-full bg-white/15 px-3.5 py-1.5 font-semibold hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-white dark:bg-black/10 dark:hover:bg-black/20"
              >
                {toast.actionLabel ?? "Undo"}
              </button>
            ) : null}
            {toast.hint ? <span className="hidden shrink-0 pr-2 text-xs opacity-65 sm:inline">{toast.hint}</span> : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
