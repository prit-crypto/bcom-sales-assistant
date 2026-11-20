"use client";

import { motion, useReducedMotion } from "motion/react";
import { useId, useRef, type KeyboardEvent } from "react";

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

/**
 * iOS-style segmented control. It is a radio group: one choice, arrow keys move between options,
 * and the selection moves with them (as a native radio group does).
 */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  size = "regular",
  stretch = false,
}: {
  label: string;
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: "small" | "regular";
  stretch?: boolean;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const pillId = `segment-pill-${useId()}`;
  const reduce = useReducedMotion();

  function onKeyDown(event: KeyboardEvent, index: number) {
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = (index + step + options.length) % options.length;
    onChange(options[next]!.value);
    refs.current[next]?.focus();
  }

  const pad = size === "small" ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-[13px]";

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`${stretch ? "grid w-full" : "inline-grid"} rounded-[10px] bg-fill p-[3px]`}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            ref={(element) => {
              refs.current[index] = element;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={`pressable relative rounded-lg text-center whitespace-nowrap focus-visible:outline-2 focus-visible:outline-accent ${pad} ${
              selected ? "font-semibold text-ink" : "font-medium text-secondary hover:text-ink"
            }`}
          >
            {selected ? (
              // The white pill slides to the chosen option instead of jumping.
              <motion.span
                layoutId={pillId}
                aria-hidden="true"
                className="absolute inset-0 rounded-lg bg-surface shadow-[0_1px_3px_rgba(0,0,0,0.12)]"
                transition={reduce ? { duration: 0 } : { type: "spring", bounce: 0, duration: 0.3 }}
              />
            ) : null}
            <span className="relative">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
