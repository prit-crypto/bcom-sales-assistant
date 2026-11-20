"use client";

import { useState } from "react";
import type { SourceKind } from "@/lib/session";
import { Icon } from "./Icon";

export interface InvoiceSource {
  url: string;
  name: string;
  kind: SourceKind;
}

/**
 * The original invoice, shown beside the shipments so values can be checked against it.
 * PDFs use the browser's own viewer (zoom, pages, search); photos get simple zoom controls.
 */
export function InvoiceViewer({ source, onClose, className = "" }: { source: InvoiceSource; onClose?: () => void; className?: string }) {
  const [zoom, setZoom] = useState(1);

  return (
    <section aria-label="Original invoice" className={`flex flex-col overflow-hidden rounded-[18px] bg-surface shadow-card ${className}`}>
      <div className="flex items-center justify-between gap-3 border-b border-separator px-4 py-2.5">
        <span className="flex min-w-0 items-center gap-2 text-sm font-semibold">
          <Icon name="file" className="size-4 shrink-0 text-secondary" />
          <span className="truncate">{source.name}</span>
        </span>
        <span className="flex items-center gap-1.5">
          {source.kind === "image" ? (
            <>
              <ZoomButton label="Zoom out" onClick={() => setZoom((value) => Math.max(1, value - 0.5))} disabled={zoom <= 1}>
                −
              </ZoomButton>
              <span className="tabular w-11 text-center text-xs text-secondary">{Math.round(zoom * 100)}%</span>
              <ZoomButton label="Zoom in" onClick={() => setZoom((value) => Math.min(3, value + 0.5))} disabled={zoom >= 3}>
                +
              </ZoomButton>
            </>
          ) : null}
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="pressable ml-1 rounded-full px-2.5 py-1.5 text-sm font-medium text-accent hover:bg-accent-tint focus-visible:outline-2 focus-visible:outline-accent"
            >
              Hide
            </button>
          ) : null}
        </span>
      </div>
      <div className="min-h-0 flex-1 bg-fill">
        {source.kind === "pdf" ? (
          <iframe title={`Invoice ${source.name}`} src={`${source.url}#view=FitH`} className="h-full w-full bg-white" />
        ) : (
          <div className="h-full overflow-auto p-3" tabIndex={0} aria-label="Invoice image, scroll to move around">
            {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL, not an optimisable asset */}
            <img
              src={source.url}
              alt={`Invoice ${source.name}`}
              className="mx-auto max-w-none origin-top-left rounded bg-white shadow"
              style={{ width: `${zoom * 100}%` }}
            />
          </div>
        )}
      </div>
    </section>
  );
}

function ZoomButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled: boolean; children: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="pressable flex size-8 items-center justify-center rounded-lg bg-fill-soft text-base hover:bg-fill focus-visible:outline-2 focus-visible:outline-accent disabled:text-tertiary"
    >
      {children}
    </button>
  );
}
