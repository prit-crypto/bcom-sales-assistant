"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { ActionBar } from "@/components/ui/ActionBar";
import { Banner } from "@/components/ui/Banner";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { errorMessage, postJson } from "@/lib/client/api";
import { buildWhatsAppLink } from "@/lib/whatsapp";
import type { MessageResponse, PartnerDetailsInput } from "@/types/api";
import type { InvoiceData } from "@/types/invoice";
import type { ProposalFile } from "./ProposalStep";

interface WhatsAppStepProps {
  invoice: InvoiceData;
  partner: PartnerDetailsInput;
  proposal: ProposalFile | null;
  message: MessageResponse | null;
  onMessage: (message: MessageResponse) => void;
  onBack: () => void;
}

export function WhatsAppStep({ invoice, partner, proposal, message, onMessage, onBack }: WhatsAppStepProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [copied, setCopied] = useState(false);
  const [edited, setEdited] = useState(false);
  const textArea = useRef<HTMLTextAreaElement>(null);
  const started = useRef(false);
  const reduce = useReducedMotion();

  async function write() {
    setBusy(true);
    setError(null);
    try {
      onMessage(await postJson<MessageResponse>("/messages", { invoice, partner }));
      setEdited(false);
    } catch (writeError) {
      setError(errorMessage(writeError));
    } finally {
      setBusy(false);
    }
  }

  // Write the message straight away the first time this step opens: one less thing to click.
  useEffect(() => {
    if (!message && !started.current) {
      started.current = true;
      void write();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function copy() {
    if (!message) return;
    try {
      await navigator.clipboard.writeText(message.message);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked: select the text so it can be copied by hand.
      textArea.current?.select();
    }
  }

  const source = message ? (message.source === "ai" ? "Written by AI" : "Standard template") : null;

  return (
    <>
      <main className="mx-auto flex w-full max-w-[720px] flex-1 flex-col gap-5 px-4 pt-8 sm:px-6 sm:pt-12">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1.5">
            <h1 className="type-title text-[28px] font-bold sm:text-[34px]">WhatsApp message</h1>
            <p className="text-base text-secondary">This is what the prospect will see. Tap the message to edit it.</p>
          </div>
          <button
            type="button"
            onClick={() => void write()}
            disabled={busy}
            className="pressable inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-accent hover:bg-accent-tint focus-visible:outline-2 focus-visible:outline-accent disabled:text-tertiary"
          >
            <Icon name="refresh" className="size-4" />
            {busy ? "Writing…" : "Write again"}
          </button>
        </div>

        {message?.notice ? <Banner tone="attention">{message.notice}</Banner> : null}
        {error ? (
          <Banner tone="error" title="Could not write the message">
            {error}
          </Banner>
        ) : null}

        <div className="overflow-hidden rounded-3xl bg-surface shadow-raised">
          <label className="flex items-center gap-3 border-b border-separator px-5 py-3.5">
            <span className="text-[15px] text-secondary">To:</span>
            <input
              id="whatsapp-phone"
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="Prospect's WhatsApp number (optional)"
              className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-tertiary"
            />
          </label>

          <div className="flex flex-col items-end gap-3 bg-chat px-4 pt-6 pb-8 sm:px-6">
            {source ? (
              <span className="self-center rounded-lg bg-surface/85 px-3 py-1 text-xs text-secondary">
                {source}
                {edited ? " · edited" : ""}
              </span>
            ) : null}
            {message ? (
              <motion.div
                initial={reduce ? false : { opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "spring", bounce: 0.15, duration: 0.35 }}
                style={{ transformOrigin: "bottom right" }}
                className="flex w-full max-w-[520px] flex-col gap-1 rounded-[14px] rounded-br-[4px] bg-bubble px-3.5 pt-2.5 pb-1.5 text-bubble-ink shadow-[0_1px_1px_rgba(0,0,0,0.08)] focus-within:ring-2 focus-within:ring-accent/40 focus-within:ring-offset-2 focus-within:ring-offset-chat">
                <label htmlFor="whatsapp-message" className="sr-only">
                  Message text
                </label>
                <textarea
                  id="whatsapp-message"
                  ref={textArea}
                  value={message.message}
                  onChange={(event) => {
                    setEdited(true);
                    onMessage({ ...message, message: event.target.value });
                  }}
                  rows={12}
                  className="min-h-48 w-full resize-none bg-transparent text-[15px] leading-relaxed outline-none [field-sizing:content]"
                />
                <span className="self-end text-[11px] opacity-70">Draft</span>
              </motion.div>
            ) : (
              <div
                role="status"
                aria-label="Writing the message"
                className="flex items-center gap-1.5 rounded-[14px] rounded-br-[4px] bg-bubble px-4 py-3.5"
              >
                {[0, 1, 2].map((dot) => (
                  <span
                    key={dot}
                    aria-hidden="true"
                    className="size-2 animate-pulse rounded-full bg-bubble-ink/50"
                    style={{ animationDelay: `${dot * 180}ms` }}
                  />
                ))}
              </div>
            )}
          </div>

          {proposal ? (
            <div className="flex items-center gap-3 border-t border-separator px-5 py-3.5">
              <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-bad-tint text-bad">
                <Icon name="file" className="size-[18px]" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-sm font-medium">{proposal.fileName}</span>
                <span className="text-xs text-secondary">Attach it in WhatsApp before you send. Nothing is sent automatically.</span>
              </span>
              <a
                href={proposal.url}
                download={proposal.fileName}
                className="pressable rounded-full px-2 py-2 text-sm font-semibold text-accent hover:bg-accent-tint focus-visible:outline-2 focus-visible:outline-accent"
              >
                Download
              </a>
            </div>
          ) : null}
        </div>
      </main>

      <ActionBar backLabel="Proposal" onBack={onBack} status={copied ? "Copied to the clipboard" : "You send it yourself from WhatsApp"}>
        <Button variant="tinted" onClick={() => void copy()} disabled={!message}>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={copied ? "copied" : "copy"}
              className="inline-flex items-center gap-2"
              initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.85 }}
              transition={{ duration: 0.18 }}
            >
              <Icon name={copied ? "check" : "copy"} className="size-4" />
              {copied ? "Copied" : "Copy"}
            </motion.span>
          </AnimatePresence>
        </Button>
        {message ? (
          <a
            href={buildWhatsAppLink(message.message, phone)}
            target="_blank"
            rel="noopener noreferrer"
            className={`${buttonClasses("whatsapp")} flex-1 md:flex-none`}
          >
            Open in WhatsApp
          </a>
        ) : (
          <Button variant="whatsapp" disabled className="flex-1 md:flex-none">
            Open in WhatsApp
          </Button>
        )}
      </ActionBar>
    </>
  );
}
