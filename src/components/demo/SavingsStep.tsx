"use client";

import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { StatusPill } from "@/components/ui/StatusPill";
import { formatMoney, formatMoneyExact, formatPercent } from "@/lib/format";
import type { ComparisonResult, GroupTotal, ShipmentStatus } from "@/lib/pricing/comparison";
import { SERVICE_LABELS, zoneLabel } from "@/lib/pricing/rate-card";
import type { InvoiceData } from "@/types/invoice";

interface SavingsStepProps {
  invoice: InvoiceData;
  comparison: ComparisonResult;
  onBack: () => void;
  onContinue: () => void;
}

const COVERAGE_SEGMENTS: { status: ShipmentStatus; label: string; className: string }[] = [
  { status: "compared", label: "Compared", className: "bg-good" },
  { status: "missing_data", label: "Missing data", className: "bg-warn" },
  { status: "not_eligible", label: "Not on rate card", className: "bg-muted/60" },
  { status: "excluded", label: "Excluded", className: "bg-line" },
];

export function SavingsStep({ invoice, comparison, onBack, onContinue }: SavingsStepProps) {
  const { summary, rows } = comparison;

  if (summary.comparedShipments === 0) {
    const reasons = new Map<string, number>();
    rows.forEach((row) => reasons.set(row.reason ?? "Not compared", (reasons.get(row.reason ?? "Not compared") ?? 0) + 1));
    return (
      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-bold">Savings</h2>
        <Notice tone="warn" title="No shipments could be compared yet">
          <ul className="list-disc pl-5">
            {[...reasons.entries()].map(([reason, count]) => (
              <li key={reason}>
                {count} x {reason}
              </li>
            ))}
          </ul>
        </Notice>
        <div>
          <Button variant="secondary" onClick={onBack}>
            Back to shipments
          </Button>
        </div>
      </section>
    );
  }

  const monthlyCurrent = summary.currentSpend * summary.monthlyFactor;
  const monthlyProposed = summary.proposedSpend * summary.monthlyFactor;
  const savingPositive = summary.saving >= 0;

  return (
    <section className="flex flex-col gap-6" aria-labelledby="savings-title">
      <div className="rounded-lg border border-line bg-white p-6">
        <p className="text-sm font-semibold text-muted">
          {invoice.customerName ?? "Prospect"} · based on {summary.comparedShipments} of {summary.totalShipments} shipments
        </p>
        <h2 id="savings-title" className="mt-1 text-3xl font-bold text-balance">
          {savingPositive ? "Save about " : "BCOM costs about "}
          <span className={savingPositive ? "text-accent" : "text-bad"}>{formatMoney(Math.abs(summary.monthlySaving))}</span>
          {savingPositive ? " every month" : " more every month"}
        </h2>
        <p className="mt-2 text-muted">
          About {formatMoney(Math.abs(summary.yearlySaving))} a year · {formatPercent(Math.abs(summary.savingPct))}{" "}
          {savingPositive ? "less" : "more"} than the current courier for the same services.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Current spend / month" value={formatMoney(monthlyCurrent)} />
        <Kpi label="With BCOM / month" value={formatMoney(monthlyProposed)} />
        <Kpi
          label="Saving / month"
          value={formatMoney(summary.monthlySaving)}
          tone={savingPositive ? "good" : "bad"}
        />
        <Kpi
          label="Coverage"
          value={`${summary.comparedShipments} / ${summary.totalShipments}`}
          detail={`${formatPercent(summary.spendCoveragePct)} of invoice spend`}
        />
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-line bg-white p-4">
        <p className="text-sm font-semibold">Eligible shipment coverage</p>
        <div className="flex h-3 overflow-hidden rounded-full bg-band" aria-hidden="true">
          {COVERAGE_SEGMENTS.map(({ status, className }) =>
            summary.statusCounts[status] > 0 ? (
              <div
                key={status}
                className={className}
                style={{ width: `${(summary.statusCounts[status] / summary.totalShipments) * 100}%` }}
              />
            ) : null,
          )}
        </div>
        <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
          {COVERAGE_SEGMENTS.map(({ status, label, className }) => (
            <li key={status} className="flex items-center gap-2">
              <span className={`size-2.5 rounded-full ${className}`} aria-hidden="true" />
              {label}: <strong className="tabular">{summary.statusCounts[status]}</strong>
            </li>
          ))}
        </ul>
      </div>

      {summary.higherPricedShipments > 0 ? (
        <Notice tone="info" title={`BCOM is more expensive on ${summary.higherPricedShipments} shipments`}>
          These are included in the totals above, so the saving is shown honestly. Look for red values in the tables
          below.
        </Notice>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <GroupTable title="By region" groups={summary.byZone} />
        <GroupTable title="Busiest routes" groups={summary.topLanes} />
      </div>

      <GroupTable title="By service" groups={summary.byService} />

      <details className="rounded-lg border border-line bg-white">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">Every shipment ({rows.length})</summary>
        <div className="max-h-[60vh] overflow-auto border-t border-line" tabIndex={0} aria-label="Every shipment">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="sticky top-0 z-10 bg-band text-left text-xs text-muted uppercase">
              <tr>
                <th className="px-3 py-2">Route</th>
                <th className="px-3 py-2">Service</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">Today</th>
                <th className="px-3 py-2 text-right">With BCOM</th>
                <th className="px-3 py-2 text-right">Saving</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const shipment = invoice.shipments[index]!;
                return (
                  <tr key={row.shipmentId} className="border-t border-line">
                    <td className="px-3 py-2">
                      {shipment.originCity ?? shipment.originCountry ?? "?"} to{" "}
                      {shipment.destinationCity ?? shipment.destinationCountry ?? "?"}
                      {row.zone ? <span className="text-muted"> · {zoneLabel(row.zone)}</span> : null}
                    </td>
                    <td className="px-3 py-2">{row.service ? SERVICE_LABELS[row.service] : "–"}</td>
                    <td className="px-3 py-2">
                      <StatusPill status={row.status} />
                      {row.reason ? <span className="block text-xs text-muted">{row.reason}</span> : null}
                    </td>
                    <td className="tabular px-3 py-2 text-right whitespace-nowrap">{row.current !== null ? formatMoneyExact(row.current) : "–"}</td>
                    <td className="tabular px-3 py-2 text-right whitespace-nowrap">{row.proposed !== null ? formatMoneyExact(row.proposed) : "–"}</td>
                    <td
                      className={`tabular px-3 py-2 text-right font-semibold whitespace-nowrap ${
                        row.saving === null ? "" : row.saving >= 0 ? "text-good" : "text-bad"
                      }`}
                    >
                      {row.saving !== null ? formatMoneyExact(row.saving) : "–"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>

      <div className="rounded-lg border border-line bg-white p-4">
        <p className="text-sm font-semibold">Assumptions</p>
        <ul className="mt-2 list-disc pl-5 text-sm text-muted">
          {summary.assumptions.map((assumption) => (
            <li key={assumption}>{assumption}</li>
          ))}
        </ul>
      </div>

      <div className="flex flex-wrap justify-between gap-3">
        <Button variant="secondary" onClick={onBack}>
          Back to shipments
        </Button>
        <Button onClick={onContinue}>Create customer proposal</Button>
      </div>
    </section>
  );
}

function Kpi({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: "good" | "bad";
}) {
  return (
    <div className="rounded-lg border border-line bg-white p-4">
      <p className="text-xs font-semibold tracking-wide text-muted uppercase">{label}</p>
      <p
        className={`tabular mt-1 text-2xl font-bold ${tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : ""}`}
      >
        {value}
      </p>
      {detail ? <p className="text-xs text-muted">{detail}</p> : null}
    </div>
  );
}

function GroupTable({ title, groups }: { title: string; groups: GroupTotal[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-white">
      <p className="px-4 pt-3 text-sm font-semibold">{title}</p>
      <table className="mt-2 w-full min-w-[460px] text-sm">
        <thead className="bg-band text-left text-xs text-muted uppercase">
          <tr>
            <th className="px-3 py-2">Name</th>
            <th className="px-3 py-2 text-right">Shipments</th>
            <th className="px-3 py-2 text-right">Today</th>
            <th className="px-3 py-2 text-right">With BCOM</th>
            <th className="px-3 py-2 text-right">Saving</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <tr key={group.key} className="border-t border-line">
              <td className="px-3 py-2">{group.label}</td>
              <td className="tabular px-3 py-2 text-right whitespace-nowrap">{group.shipments}</td>
              <td className="tabular px-3 py-2 text-right whitespace-nowrap">{formatMoneyExact(group.current)}</td>
              <td className="tabular px-3 py-2 text-right whitespace-nowrap">{formatMoneyExact(group.proposed)}</td>
              <td className={`tabular px-3 py-2 text-right font-semibold whitespace-nowrap ${group.saving >= 0 ? "text-good" : "text-bad"}`}>
                {formatMoneyExact(group.saving)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
