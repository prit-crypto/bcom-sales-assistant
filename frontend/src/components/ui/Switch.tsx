"use client";

import { motion, useReducedMotion } from "motion/react";

/** iOS-style on/off switch. A real switch for assistive technology; the knob slides with a spring. */
export function Switch({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4">
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[15px] font-medium">{label}</span>
        {description ? <span className="text-[13px] leading-snug text-secondary">{description}</span> : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`pressable relative mt-0.5 inline-flex h-[31px] w-[51px] shrink-0 items-center rounded-full p-[2px] transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
          checked ? "justify-end bg-accent" : "justify-start bg-fill"
        }`}
      >
        <motion.span
          layout
          transition={reduce ? { duration: 0 } : { type: "spring", bounce: 0.15, duration: 0.3 }}
          aria-hidden="true"
          className="size-[27px] rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.18)]"
        />
      </button>
    </label>
  );
}
