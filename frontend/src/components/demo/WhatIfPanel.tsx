"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Segmented } from "@/components/ui/Segmented";
import { Switch } from "@/components/ui/Switch";
import { formatMoney } from "@/lib/format";
import { isLikeForLike, LIKE_FOR_LIKE, type ComparisonSummary, type Scenario } from "@/types/api";

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

/** Two quick questions a prospect asks: "what if we ship more?" and "what if some parcels can wait?" */
export function WhatIfPanel({
  scenario,
  summary,
  updating,
  error,
  onChange,
}: {
  scenario: Scenario;
  summary: ComparisonSummary;
  updating: boolean;
  error: string | null;
  onChange: (scenario: Scenario) => void;
}) {
  const reduce = useReducedMotion();
  const changed = !isLikeForLike(scenario);
  const tradeoffs = summary.transit_tradeoffs;

  return (
    <section aria-labelledby="what-if-title" className="flex flex-col gap-4 rounded-[22px] bg-surface px-6 py-5 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 id="what-if-title" className="type-headline text-[22px] font-semibold">
            What if…
          </h2>
          <p className="text-[13px] text-secondary" aria-live="polite">
            {updating ? "Updating the figures…" : changed ? "Figures above include these changes." : "Showing today's shipping, like for like."}
          </p>
        </div>
        {changed ? (
          <button
            type="button"
            onClick={() => onChange(LIKE_FOR_LIKE)}
            className="pressable min-h-10 rounded-full px-3 text-sm font-semibold text-accent hover:bg-accent-tint focus-visible:outline-2 focus-visible:outline-accent"
          >
            Reset to like for like
          </button>
        ) : null}
      </div>

      <div className="grid gap-5 md:grid-cols-2 md:gap-8">
        <div className="flex flex-col gap-2">
          <span className="text-[15px] font-medium">
            Monthly volume
          </span>
          <div className="overflow-x-auto">
            <Segmented
              label="Monthly volume"
              stretch
              value={volumeValue(scenario.volume_factor)}
              onChange={(value) => onChange({ ...scenario, volume_factor: Number(value) })}
              options={VOLUMES.map((option) => ({ ...option }))}
            />
          </div>
          <span className="text-[13px] text-secondary">Same mix of routes and services, scaled.</span>
        </div>
        <Switch
          checked={scenario.economy_for_non_urgent}
          onChange={(economy) => onChange({ ...scenario, economy_for_non_urgent: economy })}
          label="Send non-urgent parcels by Economy"
          description="International Express parcels priced as BCOM Economy. Slower, cheaper."
        />
      </div>

      <AnimatePresence initial={false}>
        {scenario.economy_for_non_urgent && summary.like_for_like_monthly_saving !== summary.monthly_saving ? (
          <motion.div
            key="economy"
            initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, height: "auto" }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={{ type: "spring", bounce: 0, duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-3 border-t border-separator pt-4">
              <p className="text-[15px]">
                <strong className="font-semibold">{formatMoney(summary.like_for_like_monthly_saving)}</strong> a month like for
                like, or <strong className="font-semibold text-accent">{formatMoney(summary.monthly_saving)}</strong> with
                non-urgent parcels by Economy
                {scenario.volume_factor !== 1 ? " (at the chosen volume)" : ""}.
              </p>
              {tradeoffs.length > 0 ? (
                <table className="w-full max-w-[560px] text-sm">
                  <caption className="pb-1.5 text-left text-[13px] text-secondary">Delivery times the prospect trades for it</caption>
                  <thead>
                    <tr className="text-left text-xs text-secondary">
                      <th scope="col" className="py-1.5 pr-3 font-medium">Region</th>
                      <th scope="col" className="py-1.5 pr-3 font-medium">Express</th>
                      <th scope="col" className="py-1.5 pr-3 font-medium">Economy</th>
                      <th scope="col" className="py-1.5 text-right font-medium">Parcels</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tradeoffs.map((row) => (
                      <tr key={row.zone_label} className="border-t border-separator">
                        <td className="py-2 pr-3 font-medium">{row.zone_label}</td>
                        <td className="py-2 pr-3">{row.express}</td>
                        <td className="py-2 pr-3">{row.economy}</td>
                        <td className="tabular py-2 text-right">{row.shipments}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {error ? (
        <p role="alert" className="text-sm font-medium text-bad">
          Could not update the figures: {error}
        </p>
      ) : null}
    </section>
  );
}
