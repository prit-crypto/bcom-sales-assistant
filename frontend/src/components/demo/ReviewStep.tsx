"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { getMissingFields } from "@/lib/validation";
import type { InvoiceData, RequiredShipmentField, ServiceLevel, Shipment } from "@/types/invoice";

interface ReviewStepProps {
  invoice: InvoiceData;
  fileName: string;
  /** The backend is comparing the invoice */
  comparing: boolean;
  /** Error from the last comparison attempt */
  error: string | null;
  onChange: (invoice: InvoiceData) => void;
  onContinue: () => void;
}

type HeaderField = "carrier_name" | "customer_name" | "invoice_number" | "invoice_date" | "period_start" | "period_end" | "currency";

const HEADER_FIELDS: { field: HeaderField; label: string; type: "text" | "date" }[] = [
  { field: "customer_name", label: "Customer (prospect)", type: "text" },
  { field: "carrier_name", label: "Current courier", type: "text" },
  { field: "invoice_number", label: "Invoice number", type: "text" },
  { field: "invoice_date", label: "Invoice date", type: "date" },
  { field: "period_start", label: "Period from", type: "date" },
  { field: "period_end", label: "Period to", type: "date" },
  { field: "currency", label: "Currency", type: "text" },
];

const cellBase =
  "w-full rounded border bg-white px-2 py-1 text-sm focus-visible:outline-2 focus-visible:outline-accent";

function cellClass(missing: boolean): string {
  return `${cellBase} ${missing ? "border-warn bg-warn-soft" : "border-line"}`;
}

function parseNumber(value: string): number | null {
  if (value.trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function textOrNull(value: string): string | null {
  return value.trim() === "" ? null : value;
}

export function ReviewStep({ invoice, fileName, comparing, error, onChange, onContinue }: ReviewStepProps) {
  const [onlyProblems, setOnlyProblems] = useState(false);
  // The backend needs a full 3-letter code (or none, which it treats as AED with a note).
  const currencyInvalid = invoice.currency !== null && !/^[A-Z]{3}$/.test(invoice.currency);

  const missingById = useMemo(() => {
    const map = new Map<string, Set<RequiredShipmentField>>();
    invoice.shipments.forEach((shipment) => map.set(shipment.id, new Set(getMissingFields(shipment))));
    return map;
  }, [invoice.shipments]);

  const needsAttention = invoice.shipments.filter(
    (shipment) => shipment.included && (missingById.get(shipment.id)?.size ?? 0) > 0,
  ).length;
  const includedCount = invoice.shipments.filter((shipment) => shipment.included).length;
  const visible = onlyProblems
    ? invoice.shipments.filter((shipment) => (missingById.get(shipment.id)?.size ?? 0) > 0)
    : invoice.shipments;

  function updateHeader(field: HeaderField, value: string) {
    const cleaned = field === "currency" ? value.toUpperCase().slice(0, 3) : value;
    onChange({ ...invoice, [field]: textOrNull(cleaned) });
  }

  function updateShipment(id: string, patch: Partial<Shipment>) {
    onChange({
      ...invoice,
      shipments: invoice.shipments.map((shipment) => (shipment.id === id ? { ...shipment, ...patch } : shipment)),
    });
  }

  return (
    <section className="flex flex-col gap-5" aria-labelledby="review-title">
      <div>
        <h2 id="review-title" className="text-xl font-bold">
          Check the shipments
        </h2>
        <p className="text-sm text-muted">
          Read from <strong>{fileName}</strong>. Fix anything that looks wrong. Highlighted cells are missing and are
          needed for the comparison.
        </p>
      </div>

      {invoice.warnings.length > 0 ? (
        <Notice tone="warn" title="Please check">
          <ul className="list-disc pl-5">
            {invoice.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </Notice>
      ) : null}

      <div className="grid gap-3 rounded-lg border border-line bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
        {HEADER_FIELDS.map(({ field, label, type }) => (
          <label key={field} className="flex flex-col gap-1 text-xs font-semibold text-muted">
            {label}
            <input
              type={type}
              value={invoice[field] ?? ""}
              onChange={(event) => updateHeader(field, event.target.value)}
              className={cellClass(
                (field === "currency" && currencyInvalid) ||
                  ((field === "period_start" || field === "period_end") && invoice[field] === null),
              )}
            />
          </label>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm">
          <strong>{invoice.shipments.length}</strong> shipments · <strong>{includedCount}</strong> included ·{" "}
          <span className={needsAttention > 0 ? "font-semibold text-warn" : "text-good"}>
            {needsAttention > 0 ? `${needsAttention} need attention` : "all complete"}
          </span>
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={onlyProblems} onChange={(event) => setOnlyProblems(event.target.checked)} />
          Show only rows with missing data
        </label>
      </div>

      {/* Fixed-height box: both scrollbars stay on screen, header and first columns stay visible. */}
      <div className="max-h-[62vh] overflow-auto rounded-lg border border-line bg-white" tabIndex={0} aria-label="Shipments table">
        <table className="w-full min-w-[1120px] border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-20 bg-band text-left text-xs text-muted uppercase">
            <tr>
              <th className="sticky left-0 z-30 w-10 bg-band px-2 py-2">Use</th>
              <th className="sticky left-10 z-30 bg-band px-2 py-2 shadow-[1px_0_0_var(--color-line)]">AWB / ref</th>
              <th className="px-2 py-2">Date</th>
              <th className="px-2 py-2">From city</th>
              <th className="px-2 py-2">From</th>
              <th className="px-2 py-2">To city</th>
              <th className="px-2 py-2">To</th>
              <th className="px-2 py-2">Service</th>
              <th className="px-2 py-2 text-right">Pcs</th>
              <th className="px-2 py-2 text-right">Weight kg</th>
              <th className="px-2 py-2 text-right">Charge</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((shipment) => {
              const missing = missingById.get(shipment.id) ?? new Set();
              const isMissing = (field: RequiredShipmentField) => shipment.included && missing.has(field);
              return (
                <tr key={shipment.id} className={`[&>td]:border-t [&>td]:border-line ${shipment.included ? "" : "[&>td>*]:opacity-50"}`}>
                  <td className="sticky left-0 z-10 w-10 bg-white px-2 py-1">
                    <input
                      type="checkbox"
                      aria-label={`Include shipment ${shipment.reference ?? shipment.id}`}
                      checked={shipment.included}
                      onChange={(event) => updateShipment(shipment.id, { included: event.target.checked })}
                    />
                  </td>
                  <td className="sticky left-10 z-10 w-40 bg-white px-2 py-1 shadow-[1px_0_0_var(--color-line)]">
                    <input
                      aria-label="Reference"
                      value={shipment.reference ?? ""}
                      onChange={(event) => updateShipment(shipment.id, { reference: textOrNull(event.target.value) })}
                      className={cellClass(false)}
                    />
                  </td>
                  <td className="w-36 px-2 py-1">
                    <input
                      type="date"
                      aria-label="Date"
                      value={shipment.date ?? ""}
                      onChange={(event) => updateShipment(shipment.id, { date: textOrNull(event.target.value) })}
                      className={cellClass(false)}
                    />
                  </td>
                  <td className="w-28 px-2 py-1">
                    <input
                      aria-label="Origin city"
                      value={shipment.origin_city ?? ""}
                      onChange={(event) => updateShipment(shipment.id, { origin_city: textOrNull(event.target.value) })}
                      className={cellClass(false)}
                    />
                  </td>
                  <td className="w-14 px-2 py-1">
                    <CountryInput
                      label="Origin country"
                      value={shipment.origin_country}
                      missing={isMissing("origin_country")}
                      onChange={(value) => updateShipment(shipment.id, { origin_country: value })}
                    />
                  </td>
                  <td className="w-32 px-2 py-1">
                    <input
                      aria-label="Destination city"
                      value={shipment.destination_city ?? ""}
                      onChange={(event) => updateShipment(shipment.id, { destination_city: textOrNull(event.target.value) })}
                      className={cellClass(false)}
                    />
                  </td>
                  <td className="w-14 px-2 py-1">
                    <CountryInput
                      label="Destination country"
                      value={shipment.destination_country}
                      missing={isMissing("destination_country")}
                      onChange={(value) => updateShipment(shipment.id, { destination_country: value })}
                    />
                  </td>
                  <td className="w-32 px-2 py-1">
                    <select
                      aria-label="Service"
                      value={shipment.service ?? ""}
                      onChange={(event) =>
                        updateShipment(shipment.id, { service: (event.target.value || null) as ServiceLevel | null })
                      }
                      className={cellClass(isMissing("service"))}
                    >
                      <option value="">–</option>
                      <option value="express">Express</option>
                      <option value="economy">Economy</option>
                    </select>
                  </td>
                  <td className="w-14 px-2 py-1">
                    <NumberInput
                      label="Pieces"
                      value={shipment.pieces}
                      missing={false}
                      step="1"
                      onChange={(value) => updateShipment(shipment.id, { pieces: value === null ? null : Math.round(value) })}
                    />
                  </td>
                  <td className="w-24 px-2 py-1">
                    <NumberInput
                      label="Weight in kg"
                      value={shipment.weight_kg}
                      missing={isMissing("weight_kg")}
                      step="0.1"
                      onChange={(value) => updateShipment(shipment.id, { weight_kg: value })}
                    />
                  </td>
                  <td className="w-28 px-2 py-1">
                    <NumberInput
                      label="Charge"
                      value={shipment.charge}
                      missing={isMissing("charge")}
                      step="0.01"
                      onChange={(value) => updateShipment(shipment.id, { charge: value })}
                    />
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-4 py-6 text-center text-muted">
                  No rows with missing data.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {error ? <Notice tone="error" title="Could not compare the shipments">{error}</Notice> : null}

      <div className="flex flex-wrap items-center justify-end gap-3">
        {currencyInvalid ? (
          <p className="text-sm font-semibold text-warn">Enter the currency as a 3-letter code, e.g. AED.</p>
        ) : needsAttention > 0 ? (
          <p className="text-sm text-muted">Rows with missing data are left out of the savings until you fix them.</p>
        ) : null}
        <Button onClick={onContinue} disabled={includedCount === 0 || currencyInvalid || comparing}>
          {comparing ? "Comparing…" : "Compare with BCOM rates"}
        </Button>
      </div>
    </section>
  );
}

function CountryInput({
  label,
  value,
  missing,
  onChange,
}: {
  label: string;
  value: string | null;
  missing: boolean;
  onChange: (value: string | null) => void;
}) {
  return (
    <input
      aria-label={label}
      value={value ?? ""}
      maxLength={2}
      placeholder="AE"
      onChange={(event) => onChange(textOrNull(event.target.value.toUpperCase().replace(/[^A-Z]/g, "")))}
      className={`${cellClass(missing)} uppercase`}
    />
  );
}

function NumberInput({
  label,
  value,
  missing,
  step,
  onChange,
}: {
  label: string;
  value: number | null;
  missing: boolean;
  step: string;
  onChange: (value: number | null) => void;
}) {
  // Keep what the user is typing (e.g. "1.") separately from the parsed number.
  const [draft, setDraft] = useState(value?.toString() ?? "");
  const [syncedValue, setSyncedValue] = useState(value);
  if (value !== syncedValue) {
    setSyncedValue(value);
    if (parseNumber(draft) !== value) setDraft(value?.toString() ?? "");
  }

  return (
    <input
      type="number"
      inputMode="decimal"
      min="0"
      step={step}
      aria-label={label}
      value={draft}
      onChange={(event) => {
        setDraft(event.target.value);
        onChange(parseNumber(event.target.value));
      }}
      className={`${cellClass(missing)} tabular text-right`}
    />
  );
}
