"use client";

import { AnimatePresence, motion, useReducedMotion, type PanInfo } from "motion/react";
import { useEffect, useId, useRef, type ReactNode } from "react";

/**
 * Phone bottom sheet. It follows the finger while dragged and keeps the flick's speed when let go:
 * a flick down (or a drag past a quarter of its height) closes it, anything else springs back.
 * Esc closes it, focus moves into it and back to the opener afterwards, and the page behind is dimmed.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "Tab" && panel.current) {
        const focusable = panel.current.querySelectorAll<HTMLElement>("button, a[href], iframe, input, [tabindex]:not([tabindex='-1'])");
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      opener?.focus();
    };
  }, [open, onClose]);

  function onDragEnd(_: unknown, info: PanInfo) {
    const height = panel.current?.offsetHeight ?? 600;
    if (info.velocity.y > 500 || info.offset.y > height / 4) onClose();
  }

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50">
          <motion.div
            className="absolute inset-0 bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            className="absolute inset-x-0 bottom-0 flex max-h-[92dvh] flex-col rounded-t-[22px] bg-surface shadow-float outline-none"
            initial={reduce ? { opacity: 0 } : { y: "100%" }}
            animate={reduce ? { opacity: 1 } : { y: 0 }}
            exit={reduce ? { opacity: 0 } : { y: "100%" }}
            transition={reduce ? { duration: 0.15 } : { type: "spring", bounce: 0.15, duration: 0.4 }}
            drag={reduce ? false : "y"}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.05, bottom: 0.9 }}
            onDragEnd={onDragEnd}
          >
            <div aria-hidden="true" className="flex justify-center pt-2">
              <span className="h-[5px] w-9 rounded-full bg-fill" />
            </div>
            <div className="flex items-center justify-between px-4 pt-2 pb-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-full px-1 py-2 text-base text-accent focus-visible:outline-2 focus-visible:outline-accent"
              >
                Done
              </button>
              <h2 id={titleId} className="text-base font-semibold">
                {title}
              </h2>
              <span className="w-12" />
            </div>
            <div className="min-h-0 flex-1 overflow-auto">{children}</div>
            {footer ? <div className="border-t border-separator px-4 pt-3.5 pb-7">{footer}</div> : null}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
