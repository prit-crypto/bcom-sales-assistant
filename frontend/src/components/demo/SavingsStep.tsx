"use client";

import { useState } from "react";
import { ActionBar } from "@/components/ui/ActionBar";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Disclosure } from "@/components/ui/Disclosure";
import { Icon } from "@/components/ui/Icon";
import { Segmented } from "@/components/ui/Segmented";
import { StatusPill } from "@/components/ui/StatusPill";
import { formatMoney, formatMoneyExact, formatPercent } from "@/lib/format";
import { useCountUp } from "@/lib/hooks";
import type { ComparisonResult, GroupTotal, ShipmentStatus } from "@/types/api";
import type { InvoiceData } from "@/types/invoice";

interface SavingsStepProps {
  invoice: InvoiceData;
  comparison: ComparisonResult;
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

export function SavingsStep({ invoice, comparison, onBack, onContinue }: SavingsStepProps) {
  const { summary, rows } = comparison;
  const [view, setView] = useState<GroupView>("region");
  const [shipmentsOpen, setShipmentsOpen] = useState(false);
  const [howOpen, setHowOpen] = useState(false);
  const [filter, setFilter] = useState<RowFilter>("all");
  const headline = useCountUp(Math.abs(summary.monthly_saving));

  const prospect = invoice.customer_name ?? "This prospect";
  const courier = invoice.carrier_name ?? "the current courier";

  if (summary.compared_shipments === 0) {
    const reasons = new Map<string, number>();
    rows.forEach((row) => reasons.set(row.reason ?? "Not compared", (reasons.get(row.reason ?? "Not compared") ?? 0) + 1));
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
    requestAnimationFrame(() => document.getElementById("every-shipment")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  return (
    <>
      <main className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col gap-5 px-4 pt-8 sm:gap-6 sm:px-6 sm:pt-12">
        <section
          aria-labelledby="savings-title"
          className="flex flex-wrap items-end justify-between gap-8 rounded-[28px] bg-surface p-6 shadow-raised sm:p-10"
        >
          <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-2">
            <p className="text-[15px] font-medium text-secondary">
              {sameCost ? `${prospect} would pay` : saves ? `${prospect} could save` : `With BCOM, ${prospect} would pay`}
            </p>
            <h1 id="savings-title" className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1 font-bold">
              {sameCost ? (
                <span className="type-title text-[40px] sm:text-[56px]">About the same as today</span>
              ) : (
                <>
                  <span className={`type-display tabular text-[56px] sm:text-[88px] ${saves ? "text-accent" : "text-bad"}`}>
                    <span className="sr-only">{formatMoney(Math.abs(summary.monthly_saving))}</span>
                    <span aria-hidden="true">{formatMoney(headline)}</span>
                  </span>
                  <span className="type-title text-[22px] sm:text-[30px]">{saves ? "a month" : "more a month"}</span>
                </>
              )}
            </h1>
            {sameCost ? null : (
              <p className="mt-1.5 text-lg leading-snug text-secondary">
                {formatMoney(Math.abs(summary.yearly_saving))} a year ·{" "}
                <strong className={`font-semibold ${saves ? "text-accent" : "text-bad"}`}>
                  {formatPercent(Math.abs(summary.saving_pct))} {saves ? "less" : "more"}
                </strong>{" "}
                than {courier} for the same services
              </p>
            )}
          </div>
          <dl className="grid flex-[1_1_440px] grid-cols-3 overflow-hidden rounded-[18px] bg-canvas">
            <Stat label="Today" value={formatMoney(summary.monthly_current)} detail="per month" />
            <Stat label="With BCOM" value={formatMoney(summary.monthly_proposed)} detail="per month" divider />
            <Stat
              label="Compared"
              value={`${summary.compared_shipments} of ${summary.total_shipments}`}
              detail={`${formatPercent(summary.spend_coverage_pct)} of spend`}
              divider
            />
          </dl>
        </section>

        {!saves ? (
          <Banner tone="attention" title="No saving to propose">
            BCOM is not cheaper than {courier} for these shipments, so a proposal and WhatsApp message can&apos;t be
            created. Check the shipments for reading errors, or include more of them.
          </Banner>
        ) : null}

        {summary.period_days === null ? (
          <Banner tone="info" title="Billing period unknown">
            The invoice&apos;s billing period was not found, so these figures treat it as one month of shipping. Enter the
            period on the shipments step if it covers a different length of time.
          </Banner>
        ) : null}

        <section aria-label="Coverage" className="flex flex-col gap-3 rounded-[20px] bg-surface px-6 py-5 shadow-card">
          <div aria-hidden="true" className="flex h-2 gap-0.5 overflow-hidden rounded-full">
            {COVERAGE.map(({ status, bar }) =>
              summary.status_counts[status] > 0 ? (
                <span
                  key={status}
                  className={bar}
                  style={{ width: `${(summary.status_counts[status] / summary.total_shipments) * 100}%` }}
                />
              ) : null,
            )}
          </div>
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

        <section aria-labelledby="where-title" className="overflow-hidden rounded-[22px] bg-surface shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-5 pb-3.5">
            <h2 id="where-title" className="type-headline text-[22px] font-semibold">
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
          <ul>
            {groups.map((group) => {
              const up = group.saving >= 0;
              const width = Math.max(2, Math.round((Math.abs(group.saving) / largest) * 100));
              return (
                <li
                  key={group.key}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-5 gap-y-2 border-t border-separator px-6 py-4 md:grid-cols-[minmax(180px,1.2fr)_minmax(160px,2fr)_minmax(120px,auto)]"
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-base font-semibold">{group.label}</span>
                    <span className="text-[13px] text-secondary">
                      {group.shipments} shipment{group.shipments === 1 ? "" : "s"} · {formatMoneyExact(group.current)} →{" "}
                      {formatMoneyExact(group.proposed)}
                    </span>
                  </div>
                  <div aria-hidden="true" className="col-span-2 h-2.5 overflow-hidden rounded-full bg-fill-soft md:col-span-1">
                    <div className={`h-full rounded-full ${up ? "bg-accent" : "bg-bad-bar"}`} style={{ width: `${width}%` }} />
                  </div>
                  <span
                    className={`tabular col-start-2 row-start-1 text-right text-base font-semibold whitespace-nowrap md:col-start-auto md:row-auto ${up ? "text-accent" : "text-bad"}`}
                  >
                    <span className="sr-only">{up ? "Saves" : "Costs more by"} </span>
                    {signedMoney(group.saving)}
                  </span>
                </li>
              );
            })}
          </ul>
          {summary.higher_priced_shipments > 0 ? (
            <div className="flex items-center gap-2.5 border-t border-separator bg-fill-soft px-6 py-3.5 text-[13px] text-secondary">
              <Icon name="info" className="size-4 shrink-0" />
              <span>
                BCOM costs more on {summary.higher_priced_shipments} shipment{summary.higher_priced_shipments === 1 ? "" : "s"}.
                They are included above, so the saving is honest.
              </span>
            </div>
          ) : null}
        </section>

        <div id="every-shipment" className="scroll-mt-24 overflow-hidden rounded-[20px] bg-surface shadow-card">
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
                          {shipment.origin_city ?? shipment.origin_country ?? "?"} → {shipment.destination_city ?? shipment.destination_country ?? "?"}
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
          <Disclosure title="How we calculated this" open={howOpen} onToggle={() => setHowOpen((open) => !open)}>
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
        <Button onClick={onContinue} disabled={!saves} className="flex-1 md:flex-none">
          Create proposal
        </Button>
      </ActionBar>
    </>
  );
}

function Stat({ label, value, detail, divider = false }: { label: string; value: string; detail: string; divider?: boolean }) {
  return (
    <div className={`flex min-w-0 flex-col gap-1 px-3 py-4 sm:px-5 ${divider ? "border-l border-separator" : ""}`}>
      <dt className="text-xs text-secondary">{label}</dt>
      <dd className="type-headline tabular text-[15px] font-semibold sm:text-[22px]">{value}</dd>
      <dd className="text-xs text-secondary">{detail}</dd>
    </div>
  );
}
