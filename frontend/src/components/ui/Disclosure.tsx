"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useId, type ReactNode } from "react";
import { Icon } from "./Icon";

/** A row that expands to show more, with a chevron that turns. Controlled, so a chip elsewhere can open it. */
export function Disclosure({
  title,
  detail,
  open,
  onToggle,
  children,
}: {
  title: string;
  detail?: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const id = useId();
  const reduce = useReducedMotion();
  return (
    <div className="border-t border-separator first:border-t-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={onToggle}
        className="flex min-h-14 w-full items-center justify-between gap-4 px-6 text-left text-base font-medium hover:bg-fill-soft focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
      >
        <span>
          {title}
          {detail ? <span className="font-normal text-secondary"> · {detail}</span> : null}
        </span>
        <motion.span
          animate={{ rotate: open ? 90 : 0 }}
          transition={reduce ? { duration: 0 } : { type: "spring", bounce: 0, duration: 0.3 }}
          className="text-tertiary"
        >
          <Icon name="chevronRight" className="size-4" />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            id={id}
            key="content"
            initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={reduce ? { opacity: 1 } : { height: "auto", opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={reduce ? { duration: 0.15 } : { type: "spring", bounce: 0, duration: 0.35 }}
            className="overflow-hidden"
          >
            {children}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
