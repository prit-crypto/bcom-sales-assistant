"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ActionBar } from "@/components/ui/ActionBar";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Segmented } from "@/components/ui/Segmented";
import { formatDate, formatMoneyExact } from "@/lib/format";
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
  onBack: () => void;
  onContinue: () => void;
}

type Filter = "all" | "attention";
type CellKind = "text" | "number" | "date" | "country" | "service";
type EditableField = Exclude<keyof Shipment, "id" | "included">;

const FIELD_NAMES: Record<RequiredShipmentField, string> = {
  origin_country: "origin country",
  destination_country: "destination country",
  weight_kg: "weight",
  service: "service",
  charge: "charge",
};

const SERVICE_LABEL: Record<ServiceLevel, string> = { express: "Express", economy: "Economy" };

function parseNumber(value: string): number | null {
  if (value.trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function textOrNull(value: string): string | null {
  return value.trim() === "" ? null : value.trim();
}

/** Turns what was typed into the value stored on the shipment. */
function toValue(kind: CellKind, raw: string): string | number | null {
  switch (kind) {
    case "number":
      return parseNumber(raw);
    case "country":
      return textOrNull(raw.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2));
    case "service":
      return raw === "express" || raw === "economy" ? raw : null;
    default:
      return textOrNull(raw);
  }
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

export function ReviewStep({ invoice, fileName, comparing, error, onChange, onBack, onContinue }: ReviewStepProps) {
  const [filter, setFilter] = useState<Filter>("all");
  const currencyInvalid = invoice.currency !== null && !/^[A-Z]{3}$/.test(invoice.currency);
  const periodMissing = invoice.period_start === null || invoice.period_end === null;
  const [detailsOpen, setDetailsOpen] = useState(periodMissing || currencyInvalid);

  const missingById = useMemo(() => {
    const map = new Map<string, Set<RequiredShipmentField>>();
    invoice.shipments.forEach((shipment) => map.set(shipment.id, new Set(getMissingFields(shipment))));
    return map;
  }, [invoice.shipments]);

  const needsAttention = invoice.shipments.filter(
    (shipment) => shipment.included && (missingById.get(shipment.id)?.size ?? 0) > 0,
  );
  const includedCount = invoice.shipments.filter((shipment) => shipment.included).length;
  const readyCount = includedCount - needsAttention.length;
  const visible = filter === "attention" ? needsAttention : invoice.shipments;

  // Which details are missing, e.g. "weight (2)" — counted live, so it updates as the partner fixes rows.
  const missingSummary = useMemo(() => {
    const counts = new Map<RequiredShipmentField, number>();
    needsAttention.forEach((shipment) =>
      missingById.get(shipment.id)?.forEach((field) => counts.set(field, (counts.get(field) ?? 0) + 1)),
    );
    return [...counts.entries()].map(([field, count]) => `${FIELD_NAMES[field]} (${count})`).join(", ");
  }, [needsAttention, missingById]);

  // Reader notes still worth showing: drop the ones this screen now tracks live.
  const notes = invoice.warnings.filter((warning) => {
    if (/missing fields/i.test(warning) || /dash instead of a weight/i.test(warning)) return false;
    if (/billing period was not found/i.test(warning) && !periodMissing) return false;
    if (/currency was not found/i.test(warning) && invoice.currency !== null) return false;
    return true;
  });

  // The details card stays open while the currency is half-typed, so the problem is always in view.
  const detailsShown = detailsOpen || currencyInvalid;

  function updateHeader(field: keyof InvoiceData, value: string) {
    const cleaned = field === "currency" ? value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3) : value;
    onChange({ ...invoice, [field]: textOrNull(cleaned) });
  }

  function updateShipment(id: string, patch: Partial<Shipment>) {
    onChange({
      ...invoice,
      shipments: invoice.shipments.map((shipment) => (shipment.id === id ? { ...shipment, ...patch } : shipment)),
    });
  }

  function commit(shipment: Shipment, field: EditableField, kind: CellKind, raw: string) {
    let value = toValue(kind, raw);
    if (field === "pieces" && typeof value === "number") value = Math.max(1, Math.round(value));
    if (value !== shipment[field]) updateShipment(shipment.id, { [field]: value } as Partial<Shipment>);
  }

  const currency = invoice.currency && /^[A-Z]{3}$/.test(invoice.currency) ? invoice.currency : "AED";
  const status = currencyInvalid
    ? "Enter the currency as a 3-letter code"
    : `${readyCount} of ${invoice.shipments.length} ready${needsAttention.length ? ` · ${needsAttention.length} need attention` : ""}`;

  return (
    <>
      <main className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col gap-5 px-4 pt-8 sm:gap-6 sm:px-6 sm:pt-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1.5">
            <h1 className="type-title text-[28px] font-bold sm:text-[34px]">Check the shipments</h1>
            <p className="text-base text-secondary">
              {plural(invoice.shipments.length, "shipment")} read from <span className="font-medium text-ink">{fileName}</span>.
              Tap any value to correct it.
            </p>
          </div>
          <Segmented
            label="Show"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: `All ${invoice.shipments.length}` },
              { value: "attention", label: `Needs attention · ${needsAttention.length}` },
            ]}
          />
        </div>

        {needsAttention.length > 0 ? (
          <Banner
            tone="attention"
            title={`${plural(needsAttention.length, "shipment")} ${needsAttention.length === 1 ? "is" : "are"} missing details`}
            action={
              filter === "all" ? (
                <button
                  type="button"
                  onClick={() => setFilter("attention")}
                  className="rounded-full px-2 py-2 text-sm font-semibold hover:underline focus-visible:outline-2 focus-visible:outline-accent"
                >
                  Show them
                </button>
              ) : null
            }
          >
            Missing: {missingSummary}. Fill them in, or untick the rows to leave them out.
          </Banner>
        ) : null}

        {notes.length > 0 ? (
          <Banner tone="info" title="Notes from reading the invoice">
            <ul className="mt-1 list-disc pl-5 text-secondary">
              {notes.map((note, index) => (
                <li key={`${index}-${note}`}>{note}</li>
              ))}
            </ul>
          </Banner>
        ) : null}

        <InvoiceDetails
          invoice={invoice}
          open={detailsShown}
          onToggle={() => setDetailsOpen(!detailsShown)}
          currencyInvalid={currencyInvalid}
          periodMissing={periodMissing}
          onChange={updateHeader}
        />

        {/* Wider screens: a clean table, values become fields when tapped. */}
        <section aria-label="Shipments" className="hidden overflow-x-auto rounded-[18px] bg-surface shadow-card md:block">
          <table className="w-full min-w-[920px] border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs font-medium text-secondary">
                <th scope="col" className="w-10 py-3.5 pr-2 pl-5 font-medium">
                  <span className="sr-only">Include</span>
                </th>
                <th scope="col" className="px-2 py-3.5 font-medium">Waybill</th>
                <th scope="col" className="px-2 py-3.5 font-medium">Date</th>
                <th scope="col" className="px-2 py-3.5 font-medium">From</th>
                <th scope="col" className="px-2 py-3.5 font-medium">To</th>
                <th scope="col" className="px-2 py-3.5 font-medium">Service</th>
                <th scope="col" className="px-2 py-3.5 text-right font-medium">Pcs</th>
                <th scope="col" className="px-2 py-3.5 text-right font-medium">Weight</th>
                <th scope="col" className="py-3.5 pr-5 pl-2 text-right font-medium">Charge</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((shipment) => {
                const missing = missingById.get(shipment.id) ?? new Set();
                const isMissing = (field: RequiredShipmentField) => shipment.included && missing.has(field);
                const ref = shipment.reference ?? shipment.id;
                const cell = (field: EditableField, kind: CellKind, label: string, display: string, align: "left" | "right" = "left") => (
                  <EditableCell
                    kind={kind}
                    label={`${label} for ${ref}`}
                    value={shipment[field]}
                    display={display}
                    missing={isMissing(field as RequiredShipmentField)}
                    align={align}
                    onCommit={(raw) => commit(shipment, field, kind, raw)}
                  />
                );
                return (
                  <tr
                    key={shipment.id}
                    className={`border-t border-separator ${missing.size && shipment.included ? "bg-attention-tint/50" : ""} ${shipment.included ? "" : "text-tertiary"}`}
                  >
                    <td className="py-1.5 pr-2 pl-5">
                      <input
                        type="checkbox"
                        aria-label={`Include shipment ${ref}`}
                        checked={shipment.included}
                        onChange={(event) => updateShipment(shipment.id, { included: event.target.checked })}
                        className="size-[18px] accent-accent"
                      />
                    </td>
                    <td className="tabular px-1 py-1.5 whitespace-nowrap">{cell("reference", "text", "Waybill", shipment.reference ?? "—")}</td>
                    <td className="px-1 py-1.5 whitespace-nowrap">{cell("date", "date", "Date", formatDate(shipment.date))}</td>
                    <td className="px-1 py-1.5">
                      <div className="flex items-center gap-0.5 whitespace-nowrap">
                        {cell("origin_city", "text", "Origin city", shipment.origin_city ?? "—")}
                        {cell("origin_country", "country", "Origin country", shipment.origin_country ?? "—")}
                      </div>
                    </td>
                    <td className="px-1 py-1.5">
                      <div className="flex items-center gap-0.5 whitespace-nowrap">
                        {cell("destination_city", "text", "Destination city", shipment.destination_city ?? "—")}
                        {cell("destination_country", "country", "Destination country", shipment.destination_country ?? "—")}
                      </div>
                    </td>
                    <td className="px-1 py-1.5">{cell("service", "service", "Service", shipment.service ? SERVICE_LABEL[shipment.service] : "—")}</td>
                    <td className="tabular px-1 py-1.5">{cell("pieces", "number", "Pieces", shipment.pieces === null ? "—" : String(shipment.pieces), "right")}</td>
                    <td className="tabular px-1 py-1.5 whitespace-nowrap">
                      {cell("weight_kg", "number", "Weight in kg", shipment.weight_kg === null ? "—" : `${shipment.weight_kg} kg`, "right")}
                    </td>
                    <td className="tabular py-1.5 pr-4 pl-1 font-medium whitespace-nowrap">
                      {cell("charge", "number", "Charge", shipment.charge === null ? "—" : formatMoneyExact(shipment.charge, currency), "right")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {visible.length === 0 ? <p className="px-6 py-8 text-center text-secondary">Nothing needs attention. All set.</p> : null}
        </section>

        {/* Phones: one card per shipment. */}
        <section aria-label="Shipments" className="flex flex-col gap-2.5 md:hidden">
          {visible.map((shipment) => (
            <ShipmentCard
              key={shipment.id}
              shipment={shipment}
              currency={currency}
              missing={missingById.get(shipment.id) ?? new Set()}
              onToggleIncluded={(included) => updateShipment(shipment.id, { included })}
              onCommit={(field, kind, raw) => commit(shipment, field, kind, raw)}
            />
          ))}
          {visible.length === 0 ? <p className="py-8 text-center text-secondary">Nothing needs attention. All set.</p> : null}
        </section>

        {error ? (
          <Banner tone="error" title="Could not compare the shipments">
            {error}
          </Banner>
        ) : null}
      </main>

      <ActionBar backLabel="Upload" onBack={onBack} status={status}>
        <Button
          onClick={onContinue}
          disabled={includedCount === 0 || currencyInvalid || comparing}
          className="flex-1 md:flex-none"
        >
          {comparing ? "Comparing…" : "Compare with BCOM rates"}
        </Button>
      </ActionBar>
    </>
  );
}

/** Summary of the invoice header; opens into fields to edit. Opens by itself when the period or currency needs fixing. */
function InvoiceDetails({
  invoice,
  open,
  onToggle,
  currencyInvalid,
  periodMissing,
  onChange,
}: {
  invoice: InvoiceData;
  open: boolean;
  onToggle: () => void;
  currencyInvalid: boolean;
  periodMissing: boolean;
  onChange: (field: keyof InvoiceData, value: string) => void;
}) {
  const period =
    invoice.period_start && invoice.period_end
      ? `${formatDate(invoice.period_start)} – ${formatDate(invoice.period_end)}`
      : "Not found";
  const summary: { label: string; value: string; warn?: boolean }[] = [
    { label: "Prospect", value: invoice.customer_name ?? "—" },
    { label: "Current courier", value: invoice.carrier_name ?? "—" },
    { label: "Billing period", value: period, warn: periodMissing },
    { label: "Invoice", value: invoice.invoice_number ?? "—" },
    { label: "Currency", value: invoice.currency ?? "Not found (AED assumed)", warn: invoice.currency === null || currencyInvalid },
  ];
  const fields: { field: keyof InvoiceData; label: string; type: "text" | "date"; warn?: boolean }[] = [
    { field: "customer_name", label: "Prospect", type: "text" },
    { field: "carrier_name", label: "Current courier", type: "text" },
    { field: "invoice_number", label: "Invoice number", type: "text" },
    { field: "invoice_date", label: "Invoice date", type: "date" },
    { field: "period_start", label: "Period from", type: "date", warn: invoice.period_start === null },
    { field: "period_end", label: "Period to", type: "date", warn: invoice.period_end === null },
    { field: "currency", label: "Currency", type: "text", warn: currencyInvalid },
  ];

  return (
    <section aria-label="Invoice details" className="rounded-[18px] bg-surface shadow-card">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3 px-5 py-4 sm:px-6">
        {open ? (
          <h2 className="text-base font-semibold">Invoice details</h2>
        ) : (
          summary.map((item) => (
            <div key={item.label} className="flex min-w-0 flex-col gap-0.5">
              <span className="text-xs text-secondary">{item.label}</span>
              <span className={`flex items-center gap-1.5 text-[15px] font-medium ${item.warn ? "text-attention-ink" : ""}`}>
                {item.warn ? <span aria-hidden="true" className="size-2 rounded-full bg-attention" /> : null}
                {item.value}
              </span>
            </div>
          ))
        )}
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          disabled={open && currencyInvalid}
          className="pressable ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-accent hover:bg-accent-tint focus-visible:outline-2 focus-visible:outline-accent disabled:text-tertiary"
        >
          {open ? (
            "Done"
          ) : (
            <>
              <Icon name="pencil" className="size-4" />
              Edit details
            </>
          )}
        </button>
      </div>
      {open ? (
        <div className="grid gap-x-4 gap-y-3 border-t border-separator px-5 py-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
          {fields.map(({ field, label, type, warn }) => (
            <label key={field} className="flex flex-col gap-1">
              <span className="text-xs text-secondary">{label}</span>
              <input
                type={type}
                value={(invoice[field] as string | null) ?? ""}
                placeholder={field === "currency" ? "AED" : undefined}
                onChange={(event) => onChange(field, event.target.value)}
                className={`h-11 rounded-xl border bg-surface px-3 text-[15px] outline-none focus:border-accent focus:ring-4 focus:ring-accent/20 ${
                  warn ? "border-attention bg-attention-tint" : "border-separator"
                }`}
              />
            </label>
          ))}
          {currencyInvalid ? (
            <p className="text-sm font-medium text-attention-ink sm:col-span-2 lg:col-span-4">
              Enter the currency as a 3-letter code, for example AED.
            </p>
          ) : periodMissing ? (
            <p className="text-sm text-secondary sm:col-span-2 lg:col-span-4">
              Without a billing period the invoice counts as one month of shipping.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/**
 * Shows a value as plain text; tapping it (or Enter) turns it into a field. Enter or leaving the field
 * saves, Esc cancels. A missing required value is always shown as a field, marked with an amber dot.
 */
function EditableCell({
  kind,
  label,
  value,
  display,
  missing,
  align = "left",
  onCommit,
}: {
  kind: CellKind;
  label: string;
  value: string | number | boolean | null;
  display: string;
  missing: boolean;
  align?: "left" | "right";
  onCommit: (raw: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const input = useRef<HTMLInputElement & HTMLSelectElement>(null);
  const showField = editing || missing;

  useEffect(() => {
    if (editing) input.current?.focus();
  }, [editing]);

  function start() {
    setDraft(value === null ? "" : String(value));
    setEditing(true);
  }

  function finish(save: boolean) {
    if (save) onCommit(draft);
    setEditing(false);
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Enter") {
      event.preventDefault();
      finish(true);
    } else if (event.key === "Escape") {
      event.preventDefault();
      finish(false);
    }
  }

  const fieldClass = `h-9 rounded-lg border bg-surface px-2.5 text-sm outline-none focus:border-accent focus:ring-4 focus:ring-accent/20 ${
    missing ? "border-attention" : "border-accent"
  } ${align === "right" ? "text-right" : ""}`;
  const width = kind === "country" ? "w-14" : kind === "number" ? "w-24" : kind === "date" ? "w-36" : kind === "service" ? "w-28" : "w-32";

  if (!showField) {
    return (
      <button
        type="button"
        onClick={start}
        aria-label={`${label}: ${display}. Edit`}
        className={`rounded-lg px-2 py-1.5 hover:bg-fill-soft focus-visible:outline-2 focus-visible:outline-accent ${align === "right" ? "w-full text-right" : "text-left"}`}
      >
        {display}
      </button>
    );
  }

  const current = editing ? draft : "";
  return (
    <span className={`inline-flex items-center gap-1.5 ${align === "right" ? "w-full justify-end" : ""}`}>
      {missing ? <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-attention" /> : null}
      {kind === "service" ? (
        <select
          ref={input}
          aria-label={label}
          value={editing ? draft : (value as string | null) ?? ""}
          onChange={(event) => {
            onCommit(event.target.value);
            setEditing(false);
          }}
          onBlur={() => setEditing(false)}
          onKeyDown={onKeyDown}
          className={`${fieldClass} ${width}`}
        >
          <option value="">Choose</option>
          <option value="express">Express</option>
          <option value="economy">Economy</option>
        </select>
      ) : (
        <input
          ref={input}
          aria-label={label}
          type={kind === "date" ? "date" : "text"}
          inputMode={kind === "number" ? "decimal" : undefined}
          maxLength={kind === "country" ? 2 : undefined}
          placeholder={missing ? (kind === "number" ? "Add" : kind === "country" ? "AE" : "Add") : undefined}
          value={current}
          onFocus={() => {
            if (!editing) start();
          }}
          onChange={(event) => setDraft(kind === "country" ? event.target.value.toUpperCase() : event.target.value)}
          onBlur={() => finish(true)}
          onKeyDown={onKeyDown}
          className={`${fieldClass} ${width} ${kind === "country" ? "uppercase" : ""}`}
        />
      )}
    </span>
  );
}

/** Phone card: the route and charge at a glance, missing values as fields, everything editable when opened. */
function ShipmentCard({
  shipment,
  currency,
  missing,
  onToggleIncluded,
  onCommit,
}: {
  shipment: Shipment;
  currency: string;
  missing: Set<RequiredShipmentField>;
  onToggleIncluded: (included: boolean) => void;
  onCommit: (field: EditableField, kind: CellKind, raw: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const flagged = shipment.included && missing.size > 0;
  const ref = shipment.reference ?? shipment.id;
  const meta = [
    formatDate(shipment.date),
    shipment.service ? SERVICE_LABEL[shipment.service] : null,
    shipment.pieces ? `${shipment.pieces} pc` : null,
    shipment.weight_kg !== null ? `${shipment.weight_kg} kg` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const fields: { field: EditableField; kind: CellKind; label: string }[] = [
    { field: "reference", kind: "text", label: "Waybill" },
    { field: "date", kind: "date", label: "Date" },
    { field: "origin_city", kind: "text", label: "From city" },
    { field: "origin_country", kind: "country", label: "From country" },
    { field: "destination_city", kind: "text", label: "To city" },
    { field: "destination_country", kind: "country", label: "To country" },
    { field: "service", kind: "service", label: "Service" },
    { field: "pieces", kind: "number", label: "Pieces" },
    { field: "weight_kg", kind: "number", label: "Weight (kg)" },
    { field: "charge", kind: "number", label: `Charge (${currency})` },
  ];
  const shown = open ? fields : fields.filter(({ field }) => shipment.included && missing.has(field as RequiredShipmentField));

  return (
    <article
      className={`flex flex-col gap-2 rounded-2xl bg-surface p-3.5 ${flagged ? "shadow-[0_0_0_2px_var(--attention)]" : "shadow-card"} ${
        shipment.included ? "" : "opacity-60"
      }`}
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          aria-label={`Include shipment ${ref}`}
          checked={shipment.included}
          onChange={(event) => onToggleIncluded(event.target.checked)}
          className="mt-1 size-5 shrink-0 accent-accent"
        />
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 flex-col gap-1 text-left focus-visible:outline-2 focus-visible:outline-accent"
        >
          <span className="flex items-baseline justify-between gap-3">
            <span className="truncate text-base font-semibold">
              {shipment.origin_city ?? shipment.origin_country ?? "?"} → {shipment.destination_city ?? shipment.destination_country ?? "?"}{" "}
              <span className="text-xs font-normal text-secondary">{shipment.destination_country}</span>
            </span>
            <span className="tabular shrink-0 text-[15px] font-semibold">
              {shipment.charge === null ? "—" : formatMoneyExact(shipment.charge, currency)}
            </span>
          </span>
          <span className="text-[13px] text-secondary">{meta || "Tap to add details"}</span>
        </button>
      </div>
      {shown.length > 0 ? (
        <div className="grid grid-cols-2 gap-2.5 pt-1">
          {shown.map(({ field, kind, label }) => (
            <CardField
              key={field}
              label={label}
              kind={kind}
              value={shipment[field]}
              missing={shipment.included && missing.has(field as RequiredShipmentField)}
              onCommit={(raw) => onCommit(field, kind, raw)}
            />
          ))}
        </div>
      ) : null}
    </article>
  );
}

/** Labelled field inside a phone card; saves when you leave it or press Enter. */
function CardField({
  label,
  kind,
  value,
  missing,
  onCommit,
}: {
  label: string;
  kind: CellKind;
  value: string | number | boolean | null;
  missing: boolean;
  onCommit: (raw: string) => void;
}) {
  const [draft, setDraft] = useState(value === null ? "" : String(value));
  const [synced, setSynced] = useState(value);
  if (value !== synced) {
    setSynced(value);
    setDraft(value === null ? "" : String(value));
  }
  const className = `h-11 w-full rounded-xl border bg-surface px-3 text-[15px] outline-none focus:border-accent focus:ring-4 focus:ring-accent/20 ${
    missing ? "border-attention bg-attention-tint" : "border-separator"
  }`;
  return (
    <label className="flex flex-col gap-1">
      <span className="flex items-center gap-1.5 text-xs text-secondary">
        {missing ? <span aria-hidden="true" className="size-1.5 rounded-full bg-attention" /> : null}
        {label}
      </span>
      {kind === "service" ? (
        <select value={draft} onChange={(event) => onCommit(event.target.value)} className={className}>
          <option value="">Choose</option>
          <option value="express">Express</option>
          <option value="economy">Economy</option>
        </select>
      ) : (
        <input
          type={kind === "date" ? "date" : "text"}
          inputMode={kind === "number" ? "decimal" : undefined}
          maxLength={kind === "country" ? 2 : undefined}
          placeholder={missing ? "Add" : undefined}
          value={draft}
          onChange={(event) => setDraft(kind === "country" ? event.target.value.toUpperCase() : event.target.value)}
          onBlur={() => onCommit(draft)}
          onKeyDown={(event) => {
            if (event.key === "Enter") (event.target as HTMLInputElement).blur();
          }}
          className={`${className} ${kind === "country" ? "uppercase" : ""}`}
        />
      )}
    </label>
  );
}
