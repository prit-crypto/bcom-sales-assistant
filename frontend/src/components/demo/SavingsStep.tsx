"use client";

import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { ActionBar } from "@/components/ui/ActionBar";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Disclosure } from "@/components/ui/Disclosure";
import { Icon } from "@/components/ui/Icon";
import { Segmented } from "@/components/ui/Segmented";
import { StatusPill } from "@/components/ui/StatusPill";
import { errorMessage, postForBlob, saveBlob } from "@/lib/client/api";
import { formatMoney, formatMoneyExact, formatPercent } from "@/lib/format";
import { useCountUp } from "@/lib/hooks";
import type { ComparisonResult, GroupTotal, Scenario, ShipmentStatus } from "@/types/api";
import type { InvoiceData } from "@/types/invoice";
import { HeroBand } from "@/components/ui/Hero";
import { RouteMap } from "./RouteMap";
import { WhatIfPanel } from "./WhatIfPanel";

interface SavingsStepProps {
  invoice: InvoiceData;
  comparison: ComparisonResult;
  /** The what-if in force; the comparison already includes it */
  scenario: Scenario;
  /** New figures for a changed what-if are on their way */
  updating: boolean;
  scenarioError: string | null;
  onScenarioChange: (scenario: Scenario) => void;
  onBack: () => void;
  onContinue: () => void;
}

type GroupView = "region" | "route" | "service";
type RowFilter = "all" | ShipmentStatus;

const COVERAGE: { status: ShipmentStatus; label: (count: number) => string; bar: string }[] = [
  { status: "compared", label: (n) => `${n} compared`, bar: "bg-accent" },
  { status: "missing_data", label: (n) => `${n} missing data`, bar: "bg-attention" },
  { status: "not_eligible", label: (n) => `${n} not on the rate card`, bar: "bg-tertiary" },
  { status: "excluded", label: (n) => `${n} left out`, bar: "bg-fill" },
];

function signedMoney(value: number): string {
  return `${value >= 0 ? "+" : "−"} ${formatMoneyExact(Math.abs(value))}`;
}

function volumeLabel(factor: number): string {
  if (factor === 2) return "Twice the volume";
  const pct = Math.round((factor - 1) * 100);
  return `${pct > 0 ? "+" : "−"}${Math.abs(pct)}% volume`;
}

function exportFileName(prospect: string | null): string {
  return `BCOM-comparison-${(prospect ?? "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "prospect"}.xlsx`;
}

export function SavingsStep({
  invoice,
  comparison,
  scenario,
  updating,
  scenarioError,
  onScenarioChange,
  onBack,
  onContinue,
}: SavingsStepProps) {
  const { summary, rows } = comparison;
  const [view, setView] = useState<GroupView>("region");
  const [shipmentsOpen, setShipmentsOpen] = useState(false);
  const [howOpen, setHowOpen] = useState(false);
  const [filter, setFilter] = useState<RowFilter>("all");
  const headline = useCountUp(Math.abs(summary.monthly_saving));
  const reduce = useReducedMotion();
  const conversion = summary.converted_from;
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  async function downloadExcel() {
    setExporting(true);
    setExportError(null);
    try {
      saveBlob(
        await postForBlob("/exports/comparison", { invoice, scenario }),
        exportFileName(invoice.customer_name),
      );
    } catch (failure) {
      setExportError(errorMessage(failure));
    } finally {
      setExporting(false);
    }
  }

  // The two shipments that show the saving most clearly, on different routes.
  const examples = rows
    .map((row, index) => ({ row, shipment: invoice.shipments[index]! }))
    .filter(({ row }) => row.status === "compared" && (row.saving ?? 0) > 0)
    .sort((a, b) => (b.row.saving ?? 0) - (a.row.saving ?? 0))
    .filter(
      ({ shipment }, index, all) =>
        all.findIndex(
          (other) =>
            other.shipment.origin_city === shipment.origin_city &&
            other.shipment.destination_city === shipment.destination_city,
        ) === index,
    )
    .slice(0, 2);

  const scenarioChips = [
    scenario.volume_factor !== 1 ? volumeLabel(scenario.volume_factor) : null,
    scenario.economy_for_non_urgent ? "Non-urgent by Economy" : null,
  ].filter((chip): chip is string => chip !== null);

  const prospect = invoice.customer_name ?? "This prospect";
  const courier = invoice.carrier_name ?? "the current courier";

  if (summary.compared_shipments === 0) {
    const reasons = new Map<string, number>();
    rows.forEach((row) =>
      reasons.set(row.reason ?? "Not compared", (reasons.get(row.reason ?? "Not compared") ?? 0) + 1),
    );
    return (
      <>
        <main className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col gap-6 px-4 pt-8 sm:px-6 sm:pt-12">
          <h1 className="type-title text-[34px] font-bold">No shipments could be compared yet</h1>
          <Banner tone="attention" title="Why">
            <ul className="mt-1 list-disc pl-5">
              {[...reasons.entries()].map(([reason, count]) => (
                <li key={reason}>
                  {count} × {reason}
                </li>
              ))}
            </ul>
          </Banner>
        </main>
        <ActionBar backLabel="Shipments" onBack={onBack} status="Fix the shipments, then compare again" />
      </>
    );
  }

  const sameCost = summary.monthly_saving === 0;
  const saves = summary.has_saving;
  const groups: GroupTotal[] =
    view === "region" ? summary.by_zone : view === "route" ? summary.top_lanes : summary.by_service;
  const largest = Math.max(1, ...groups.map((group) => Math.abs(group.saving)));
  const visibleRows = rows
    .map((row, index) => ({ row, shipment: invoice.shipments[index]! }))
    .filter(({ row }) => filter === "all" || row.status === filter);

  function openShipments(status: RowFilter) {
    setFilter(status);
    setShipmentsOpen(true);
    requestAnimationFrame(() =>
      document.getElementById("every-shipment")?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }

  return (
    <>
      <HeroBand inner="flex flex-col gap-8 pt-12 pb-28 sm:pt-14">
        <section
          aria-labelledby="savings-title"
          aria-busy={updating}
          className={`flex flex-col gap-2.5 transition-opacity duration-200 ${updating ? "opacity-60" : ""}`}
        >
          <div className="flex flex-wrap items-center gap-2.5">
            <p className="text-[17px] text-hero-secondary sm:text-[19px]">
              {sameCost
                ? `${prospect} would pay`
                : saves
                  ? `${prospect} could save about`
                  : `With BCOM, ${prospect} would pay`}
            </p>
            {conversion ? (
              <span className="inline-flex items-center rounded-full bg-hero-raised px-2.5 py-0.5 text-xs font-semibold text-hero-ink">
                Converted from {conversion.currency}
              </span>
            ) : null}
            {scenarioChips.map((chip) => (
              <span
                key={chip}
                className="inline-flex items-center rounded-full bg-gold px-2.5 py-0.5 text-xs font-semibold text-on-gold"
              >
                {chip}
              </span>
            ))}
          </div>
          <h1 id="savings-title" className="flex flex-wrap items-baseline gap-x-4 gap-y-1 font-bold">
            {sameCost ? (
              <span className="type-title text-[40px] sm:text-[64px]">About the same as today</span>
            ) : (
              <>
                <span
                  className={`type-display tabular text-[60px] sm:text-[112px] ${saves ? "text-hero-ink" : "text-bad"}`}
                >
                  <span className="sr-only">{formatMoney(Math.abs(summary.monthly_saving))}</span>
                  <span aria-hidden="true">{formatMoney(headline)}</span>
                </span>
                <span className="type-title text-[24px] text-gold sm:text-[32px]">
                  {saves ? "a month" : "more a month"}
                </span>
              </>
            )}
          </h1>
          {sameCost ? null : (
            <p className="text-lg leading-snug text-hero-secondary sm:text-[21px]">
              <strong className="font-semibold text-hero-ink">
                {formatMoney(Math.abs(summary.yearly_saving))} a year.
              </strong>{" "}
              {formatPercent(Math.abs(summary.saving_pct))} {saves ? "less" : "more"} than {courier}
              {scenario.economy_for_non_urgent ? ", for the same parcels." : ", for the same services."}
            </p>
          )}
          {conversion ? (
            <p className="text-sm text-hero-secondary">
              {conversion.currency}{" "}
              {conversion.original_spend.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{" "}
              on the invoice, converted at {conversion.rate} AED per {conversion.currency}
              {conversion.currency === "USD" ? " (the dirham's fixed peg)" : ""}.
            </p>
          ) : null}
        </section>
        <div className="flex max-w-[760px] flex-col gap-4 rounded-[22px] bg-hero-raised p-5 sm:p-6">
          <CompareBar
            label="Today"
            value={summary.monthly_current}
            max={Math.max(summary.monthly_current, summary.monthly_proposed)}
            tone="today"
          />
          <CompareBar
            label="With BCOM"
            value={summary.monthly_proposed}
            max={Math.max(summary.monthly_current, summary.monthly_proposed)}
            tone="bcom"
          />
          <p className="text-[13px] text-hero-secondary">
            An estimate based on {summary.compared_shipments} of {summary.total_shipments} shipments ·{" "}
            {formatPercent(summary.spend_coverage_pct)} of spend
          </p>
          {examples.length > 0 ? (
            <div className="flex flex-col gap-2 border-t border-hero-line pt-4">
              <p className="text-[13px] font-semibold text-gold">For example, from this invoice</p>
              <ul className="flex flex-col gap-2">
                {examples.map(({ row, shipment }) => (
                  <li
                    key={row.shipment_id}
                    className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 text-[15px]"
                  >
                    <span className="min-w-0">
                      <span className="font-medium">
                        {shipment.origin_city ?? shipment.origin_country ?? "?"} →{" "}
                        {shipment.destination_city ?? shipment.destination_country ?? "?"}
                      </span>
                      <span className="text-hero-secondary">
                        {" "}
                        · {row.service_label}
                        {shipment.weight_kg ? ` · ${shipment.weight_kg} kg` : ""}
                      </span>
                    </span>
                    <span className="tabular whitespace-nowrap">
                      <span className="text-hero-secondary">{formatMoneyExact(row.current ?? 0)} → </span>
                      <span className="font-semibold">{formatMoneyExact(row.proposed ?? 0)}</span>
                      <span className="text-hero-save"> · save {formatMoneyExact(row.saving ?? 0)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </HeroBand>

      <main className="mx-auto -mt-16 flex w-full max-w-[1200px] flex-1 flex-col gap-5 px-4 sm:gap-6 sm:px-6">
        <WhatIfPanel
          scenario={scenario}
          updating={updating}
          error={scenarioError}
          onChange={onScenarioChange}
        />

        {exportError ? (
          <Banner tone="error" title="Could not create the Excel file">
            {exportError}
          </Banner>
        ) : null}

        {!saves ? (
          <Banner tone="attention" title="No saving to propose">
            BCOM is not cheaper than {courier} for these shipments, so a proposal and WhatsApp message
            can&apos;t be created. Check the shipments for reading errors, or include more of them.
          </Banner>
        ) : null}

        {summary.period_days === null ? (
          <Banner tone="info" title="Billing period unknown">
            The invoice&apos;s billing period was not found, so these figures treat it as one month of
            shipping. Enter the period on the shipments step if it covers a different length of time.
          </Banner>
        ) : null}

        <section
          aria-label="Coverage"
          className="flex flex-col gap-3 rounded-[20px] bg-surface px-6 py-5 shadow-card"
        >
          <motion.div
            aria-hidden="true"
            className="flex h-2 origin-left gap-0.5 overflow-hidden rounded-full"
            initial={reduce ? false : { scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ type: "spring", bounce: 0, duration: 0.6, delay: 0.15 }}
          >
            {COVERAGE.map(({ status, bar }) =>
              summary.status_counts[status] > 0 ? (
                <span
                  key={status}
                  className={bar}
                  style={{ width: `${(summary.status_counts[status] / summary.total_shipments) * 100}%` }}
                />
              ) : null,
            )}
          </motion.div>
          <div className="flex flex-wrap gap-2">
            {COVERAGE.map(({ status, label, bar }) =>
              summary.status_counts[status] > 0 ? (
                <button
                  key={status}
                  type="button"
                  onClick={() => openShipments(status)}
                  className="pressable inline-flex min-h-9 items-center gap-2 rounded-full bg-fill-soft px-3.5 text-[13px] hover:bg-fill focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <span aria-hidden="true" className={`size-2 rounded-full ${bar}`} />
                  {label(summary.status_counts[status])}
                </button>
              ) : null,
            )}
          </div>
        </section>

        <section
          aria-labelledby="where-title"
          className="overflow-hidden rounded-[28px] bg-surface shadow-raised"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-5 pb-3.5">
            <h2 id="where-title" className="type-title text-[24px] font-bold sm:text-[28px]">
              Where you save
            </h2>
            <Segmented
              label="Group by"
              value={view}
              onChange={setView}
              options={[
                { value: "region", label: "Region" },
                { value: "route", label: "Route" },
                { value: "service", label: "Service" },
              ]}
            />
          </div>
          {view === "region" ? (
            <div className="px-4 pb-4 sm:px-6">
              <RouteMap zones={summary.by_zone} currency={summary.currency} />
            </div>
          ) : null}
          <ul>
            {groups.map((group, index) => {
              const up = group.saving >= 0;
              const width = Math.max(2, Math.round((Math.abs(group.saving) / largest) * 100));
              return (
                <motion.li
                  key={group.key}
                  initial={reduce ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: "spring", bounce: 0, duration: 0.35, delay: index * 0.03 }}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-5 gap-y-2 border-t border-separator px-6 py-4 md:grid-cols-[minmax(180px,1.2fr)_minmax(160px,2fr)_minmax(120px,auto)]"
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-base font-semibold">{group.label}</span>
                    <span className="text-[13px] text-secondary">
                      {group.shipments} shipment{group.shipments === 1 ? "" : "s"} ·{" "}
                      {formatMoneyExact(group.current)} → {formatMoneyExact(group.proposed)}
                    </span>
                  </div>
                  <div
                    aria-hidden="true"
                    className="col-span-2 h-2.5 overflow-hidden rounded-full bg-fill-soft md:col-span-1"
                  >
                    {/* Grows from the left (a transform, so it stays smooth) each time the rows change. */}
                    <motion.div
                      className={`h-full origin-left rounded-full ${up ? "bg-accent" : "bg-bad-bar"}`}
                      style={{ width: `${width}%` }}
                      initial={reduce ? false : { scaleX: 0 }}
                      animate={{ scaleX: 1 }}
                      transition={{ type: "spring", bounce: 0, duration: 0.5, delay: 0.1 + index * 0.03 }}
                    />
                  </div>
                  <span
                    className={`tabular col-start-2 row-start-1 text-right text-base font-semibold whitespace-nowrap md:col-start-auto md:row-auto ${up ? "text-accent" : "text-bad"}`}
                  >
                    <span className="sr-only">{up ? "Saves" : "Costs more by"} </span>
                    {signedMoney(group.saving)}
                  </span>
                </motion.li>
              );
            })}
          </ul>
          {summary.higher_priced_shipments > 0 ? (
            <div className="flex items-center gap-2.5 border-t border-separator bg-fill-soft px-6 py-3.5 text-[13px] text-secondary">
              <Icon name="info" className="size-4 shrink-0" />
              <span>
                BCOM costs more on {summary.higher_priced_shipments} shipment
                {summary.higher_priced_shipments === 1 ? "" : "s"}. They are included above, so the saving is
                honest.
              </span>
            </div>
          ) : null}
        </section>

        <div
          id="every-shipment"
          className="scroll-mt-24 overflow-hidden rounded-[20px] bg-surface shadow-card"
        >
          <Disclosure
            title="Every shipment"
            detail={String(rows.length)}
            open={shipmentsOpen}
            onToggle={() => setShipmentsOpen((open) => !open)}
          >
            <div className="flex flex-col gap-3 border-t border-separator px-4 py-4 sm:px-6">
              <div className="overflow-x-auto">
                <Segmented
                  label="Show shipments"
                  size="small"
                  value={filter}
                  onChange={setFilter}
                  options={[
                    { value: "all", label: "All" },
                    { value: "compared", label: "Compared" },
                    { value: "missing_data", label: "Missing data" },
                    { value: "not_eligible", label: "Not on card" },
                    { value: "excluded", label: "Left out" },
                  ]}
                />
              </div>
              {visibleRows.length === 0 ? (
                <p className="py-6 text-center text-secondary">No shipments in this group.</p>
              ) : (
                <ul className="flex flex-col">
                  {visibleRows.map(({ row, shipment }) => (
                    <li
                      key={row.shipment_id}
                      className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 border-t border-separator py-3 first:border-t-0 md:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_repeat(3,minmax(96px,auto))] md:items-center"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {shipment.origin_city ?? shipment.origin_country ?? "?"} →{" "}
                          {shipment.destination_city ?? shipment.destination_country ?? "?"}
                        </p>
                        <p className="text-[13px] text-secondary">
                          {[row.service_label, row.zone_label].filter(Boolean).join(" · ") || "—"}
                        </p>
                      </div>
                      <div className="col-start-1 flex flex-wrap items-center gap-2 md:col-start-auto">
                        <StatusPill status={row.status} />
                        {row.reason ? <span className="text-xs text-secondary">{row.reason}</span> : null}
                      </div>
                      <span className="tabular row-start-1 text-right text-sm whitespace-nowrap text-secondary md:row-auto">
                        {row.current !== null ? formatMoneyExact(row.current) : "—"}
                      </span>
                      <span className="tabular hidden text-right text-sm whitespace-nowrap md:block">
                        {row.proposed !== null ? formatMoneyExact(row.proposed) : "—"}
                      </span>
                      <span
                        className={`tabular col-start-2 text-right text-sm font-semibold whitespace-nowrap md:col-start-auto ${
                          row.saving === null ? "text-tertiary" : row.saving >= 0 ? "text-accent" : "text-bad"
                        }`}
                      >
                        {row.saving !== null ? signedMoney(row.saving) : "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Disclosure>
          <Disclosure
            title="How we calculated this"
            open={howOpen}
            onToggle={() => setHowOpen((open) => !open)}
          >
            <ul className="flex list-disc flex-col gap-1.5 border-t border-separator py-4 pr-6 pl-11 text-[15px] leading-relaxed text-secondary">
              {summary.assumptions.map((assumption) => (
                <li key={assumption}>{assumption}</li>
              ))}
            </ul>
          </Disclosure>
        </div>
      </main>

      <ActionBar
        backLabel="Shipments"
        onBack={onBack}
        status={saves ? `Saving ${formatMoney(summary.monthly_saving)} a month` : "No saving to propose"}
      >
        <Button variant="tinted" onClick={() => void downloadExcel()} disabled={exporting || updating}>
          <Icon name="download" className="size-4" />
          {exporting ? (
            "Preparing…"
          ) : (
            <span>
              <span className="sr-only sm:not-sr-only">Download </span>Excel
            </span>
          )}
        </Button>
        <Button onClick={onContinue} disabled={!saves || updating} className="flex-1 md:flex-none">
          Create proposal
        </Button>
      </ActionBar>
    </>
  );
}

function CompareBar({
  label,
  value,
  max,
  tone,
}: {
  label: string;
  value: number;
  max: number;
  tone: "today" | "bcom";
}) {
  const shown = useCountUp(value);
  const reduce = useReducedMotion();
  const width = `${Math.max(4, (value / Math.max(1, max)) * 100)}%`;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-4 text-[15px]">
        <span className="text-hero-secondary">{label}</span>
        <span className={`tabular font-semibold ${tone === "bcom" ? "text-hero-save" : "text-hero-ink"}`}>
          <span className="sr-only">{formatMoney(value)} per month</span>
          <span aria-hidden="true">{formatMoney(shown)} / mo</span>
        </span>
      </div>
      <div aria-hidden="true" className="h-2.5 overflow-hidden rounded-full bg-hero-line">
        <motion.div
          className={`h-full origin-left rounded-full ${tone === "bcom" ? "bg-hero-save" : "bg-tertiary"}`}
          style={{ width }}
          initial={reduce ? false : { scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ type: "spring", bounce: 0, duration: 0.7, delay: tone === "bcom" ? 0.2 : 0.05 }}
        />
      </div>
    </div>
  );
}
