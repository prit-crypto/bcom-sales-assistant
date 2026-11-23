"use client";

import { Segmented } from "@/components/ui/Segmented";
import { isLikeForLike, LIKE_FOR_LIKE, type Scenario } from "@/types/api";

const VOLUMES = [
  { value: "0.8", label: "−20%" },
  { value: "1", label: "Same" },
  { value: "1.2", label: "+20%" },
  { value: "1.5", label: "+50%" },
  { value: "2", label: "×2" },
] as const;

type VolumeValue = (typeof VOLUMES)[number]["value"];

function volumeValue(factor: number): VolumeValue {
  return VOLUMES.find((option) => Number(option.value) === factor)?.value ?? "1";
}

/** The question a prospect often asks: "what if we ship more, or less?" */
export function WhatIfPanel({
  scenario,
  updating,
  error,
  onChange,
}: {
  scenario: Scenario;
  updating: boolean;
  error: string | null;
  onChange: (scenario: Scenario) => void;
}) {
  const changed = !isLikeForLike(scenario);

  return (
    <section aria-labelledby="what-if-title" className="flex flex-col gap-4 rounded-[22px] bg-surface px-6 py-5 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 id="what-if-title" className="type-headline text-[22px] font-semibold">
            Try a different scenario
          </h2>
          <p className="text-[13px] text-secondary" aria-live="polite">
            {updating
              ? "Updating the figures…"
              : changed
                ? "The figures above include this change."
                : "Now showing: their current shipping, same services."}
          </p>
        </div>
        {changed ? (
          <button
            type="button"
            onClick={() => onChange(LIKE_FOR_LIKE)}
            className="pressable min-h-10 rounded-full px-3 text-sm font-semibold text-accent hover:bg-accent-tint focus-visible:outline-2 focus-visible:outline-accent"
          >
            Back to their current shipping
          </button>
        ) : null}
      </div>

      <div className="flex max-w-[560px] flex-col gap-2">
        <span className="text-[15px] font-medium">If they ship more or less each month</span>
        <div className="overflow-x-auto">
          <Segmented
            label="If they ship more or less each month"
            stretch
            value={volumeValue(scenario.volume_factor)}
            // Economy for non-urgent parcels is no longer offered; changing the volume also switches off an
            // old saved choice of it.
            onChange={(value) => onChange({ volume_factor: Number(value), economy_for_non_urgent: false })}
            options={VOLUMES.map((option) => ({ ...option }))}
          />
        </div>
        <span className="text-[13px] text-secondary">Same routes and services, more or fewer parcels.</span>
      </div>

      {error ? (
        <p role="alert" className="text-sm font-medium text-bad">
          Could not update the figures: {error}
        </p>
      ) : null}
    </section>
  );
}
