"use client";

import type { ReactNode } from "react";
import { Icon } from "./Icon";

/**
 * Floating translucent bar at the bottom of every step: Back on the left, what is happening in the
 * middle, the next action on the right. The next step is always one tap away, wherever you have scrolled.
 */
export function ActionBar({
  backLabel,
  onBack,
  status,
  children,
}: {
  backLabel?: string;
  onBack?: () => void;
  /** Short line about the state of this step, e.g. "20 of 22 ready" */
  status?: ReactNode;
  /** The action buttons, primary last */
  children?: ReactNode;
}) {
  return (
    <div className="pointer-events-none sticky bottom-0 z-20 px-3 pt-8 pb-4 sm:px-6 sm:pb-5">
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-canvas to-transparent"
      />
      <div className="material pointer-events-auto relative mx-auto flex w-full max-w-[760px] items-center justify-between gap-2 rounded-[22px] bg-bar-strong p-2 shadow-float sm:gap-4 sm:pl-3">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label={backLabel ? `Back to ${backLabel}` : "Back"}
            className="pressable flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-[15px] font-medium hover:bg-fill-soft focus-visible:outline-2 focus-visible:outline-accent"
          >
            <Icon name="chevronLeft" className="size-4" />
            <span className="hidden sm:inline">{backLabel}</span>
          </button>
        ) : (
          <span className="hidden sm:block sm:w-2" />
        )}
        {status ? (
          <p aria-live="polite" className="hidden min-w-0 flex-1 truncate text-center text-[13px] text-secondary md:block">
            {status}
          </p>
        ) : (
          <span className="hidden flex-1 md:block" />
        )}
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2 md:flex-none">{children}</div>
      </div>
    </div>
  );
}
