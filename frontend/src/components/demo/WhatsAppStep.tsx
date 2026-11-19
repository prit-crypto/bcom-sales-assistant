"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { errorMessage, postJson } from "@/lib/client/api";
import { buildWhatsAppLink } from "@/lib/whatsapp";
import type { MessageResponse, PartnerDetailsInput } from "@/types/api";
import type { InvoiceData } from "@/types/invoice";

interface WhatsAppStepProps {
  invoice: InvoiceData;
  partner: PartnerDetailsInput;
  message: MessageResponse | null;
  onMessage: (message: MessageResponse) => void;
  onBack: () => void;
  onRestart: () => void;
}

export function WhatsAppStep({ invoice, partner, message, onMessage, onBack, onRestart }: WhatsAppStepProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [copied, setCopied] = useState(false);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  async function write() {
    setBusy(true);
    setError(null);
    try {
      onMessage(await postJson<MessageResponse>("/messages", { invoice, partner }));
    } catch (writeError) {
      setError(errorMessage(writeError));
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!message) return;
    try {
      await navigator.clipboard.writeText(message.message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked: select the text so the user can copy it by hand.
      textAreaRef.current?.select();
    }
  }

  return (
    <section className="flex flex-col gap-5" aria-labelledby="whatsapp-title">
      <div>
        <h2 id="whatsapp-title" className="text-xl font-bold">
          WhatsApp message
        </h2>
        <p className="text-sm text-muted">
          A personalised message using only the calculated numbers. Review it, then send it yourself from WhatsApp.
        </p>
      </div>

      {!message ? (
        <div>
          <Button onClick={() => void write()} disabled={busy}>
            {busy ? "Writing message…" : "Write the message"}
          </Button>
        </div>
      ) : null}

      {error ? <Notice tone="error" title="Could not write the message">{error}</Notice> : null}

      {message ? (
        <div className="flex flex-col gap-3">
          {message.notice ? <Notice tone="warn">{message.notice}</Notice> : null}
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="whatsapp-message" className="text-sm font-semibold">
              Message ({message.source === "ai" ? "written by AI" : "standard template"}) – you can edit it
            </label>
            <Button variant="ghost" onClick={() => void write()} disabled={busy}>
              {busy ? "Writing…" : "Write again"}
            </Button>
          </div>
          <textarea
            id="whatsapp-message"
            ref={textAreaRef}
            value={message.message}
            onChange={(event) => onMessage({ ...message, message: event.target.value })}
            rows={14}
            className="w-full rounded-lg border border-line bg-white p-3 text-sm leading-relaxed focus-visible:outline-2 focus-visible:outline-accent"
          />
          <label className="flex max-w-sm flex-col gap-1 text-xs font-semibold text-muted">
            Prospect WhatsApp number (optional)
            <input
              id="whatsapp-phone"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="+971 50 123 4567"
              inputMode="tel"
              className="rounded border border-line px-2 py-1.5 text-sm text-ink"
            />
          </label>
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" onClick={() => void copy()}>
              {copied ? "Copied" : "Copy message"}
            </Button>
            <a
              href={buildWhatsAppLink(message.message, phone)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded-md bg-good px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
              Open in WhatsApp
            </a>
          </div>
          <p className="text-xs text-muted">
            WhatsApp opens with the message filled in. Attach the proposal PDF there before you send. Nothing is sent
            automatically.
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap justify-between gap-3">
        <Button variant="secondary" onClick={onBack}>
          Back to proposal
        </Button>
        <Button variant="ghost" onClick={onRestart}>
          Start a new invoice
        </Button>
      </div>
    </section>
  );
}
