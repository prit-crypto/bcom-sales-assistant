"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { errorMessage, getJson, postJson } from "@/lib/client/api";
import type { EmailDraft, ProposalDetail } from "@/types/api";

interface Form {
  to: string;
  cc: string;
  subject: string;
  message: string;
  attachPdf: boolean;
  includeLink: boolean;
}

const FIELD =
  "w-full rounded-xl border border-separator bg-surface px-3 text-[15px] outline-none focus:border-accent focus:ring-4 focus:ring-accent/20";

/** Send the proposal by email: the form starts with a message in the customer's language. */
export function EmailCard({ proposal, onSent }: { proposal: ProposalDetail; onSent: (detail: ProposalDetail) => void }) {
  const [form, setForm] = useState<Form | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const rtl = proposal.partner.language === "ar";

  async function open() {
    setBusy(true);
    setError(null);
    try {
      const draft = await getJson<EmailDraft>(`/proposals/${proposal.id}/email-draft`);
      setEnabled(draft.email_enabled);
      setForm({ to: draft.to, cc: "", subject: draft.subject, message: draft.message, attachPdf: true, includeLink: true });
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    if (!form) return;
    setBusy(true);
    setError(null);
    try {
      const detail = await postJson<ProposalDetail>(`/proposals/${proposal.id}/email`, {
        to: form.to.trim(),
        cc: form.cc
          .split(/[,;\s]+/)
          .map((address) => address.trim())
          .filter(Boolean),
        subject: form.subject,
        message: form.message,
        attach_pdf: form.attachPdf,
        include_link: form.includeLink,
      });
      setSentTo(form.to.trim());
      setForm(null);
      onSent(detail);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  const update = (patch: Partial<Form>) => setForm((current) => (current ? { ...current, ...patch } : current));

  return (
    <section aria-labelledby="email-title" className="flex flex-col gap-3 rounded-[22px] bg-surface p-5 shadow-card sm:p-6">
      <h2 id="email-title" className="type-headline text-lg font-semibold">
        Send by email
      </h2>
      {sentTo && !form ? (
        <p role="status" className="flex items-center gap-2 text-[15px] font-medium text-accent">
          <Icon name="check" className="size-4" />
          Sent to {sentTo}
        </p>
      ) : null}
      {!form ? (
        <>
          <p className="text-[13px] text-secondary">
            The PDF attached and, if you like, the customer link. A draft proposal is marked as sent.
          </p>
          <Button variant="tinted" className="self-start" disabled={busy || !proposal.has_saving} onClick={() => void open()}>
            <Icon name="file" className="size-4" />
            {sentTo ? "Send again" : "Write the email"}
          </Button>
        </>
      ) : !enabled ? (
        <p className="rounded-2xl bg-fill-soft px-4 py-3 text-[13px] text-secondary">
          Email isn&apos;t set up on this server yet. Set SMTP_HOST (and the other SMTP_ settings) in the backend&apos;s .env.
          For a local test, run Mailpit: <code>docker compose up -d mailpit</code>.
        </p>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <label className="flex flex-col gap-1">
            <span className="text-[13px] text-secondary">To</span>
            <input
              type="email"
              required
              value={form.to}
              onChange={(event) => update({ to: event.target.value })}
              placeholder="name@company.ae"
              className={`${FIELD} h-11`}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[13px] text-secondary">CC (optional, separate with commas)</span>
            <input value={form.cc} onChange={(event) => update({ cc: event.target.value })} className={`${FIELD} h-11`} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[13px] text-secondary">Subject</span>
            <input
              required
              value={form.subject}
              dir={rtl ? "rtl" : "ltr"}
              onChange={(event) => update({ subject: event.target.value })}
              className={`${FIELD} h-11`}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[13px] text-secondary">Message</span>
            <textarea
              required
              rows={9}
              value={form.message}
              dir={rtl ? "rtl" : "ltr"}
              onChange={(event) => update({ message: event.target.value })}
              className={`${FIELD} py-2.5 leading-relaxed`}
            />
          </label>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-[15px]">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.attachPdf}
                onChange={(event) => update({ attachPdf: event.target.checked })}
                className="size-5 accent-accent"
              />
              Attach the PDF
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.includeLink}
                onChange={(event) => update({ includeLink: event.target.checked })}
                className="size-5 accent-accent"
              />
              Include the customer link
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy || !form.to.trim()}>
              {busy ? "Sending…" : "Send email"}
            </Button>
            <Button variant="plain" onClick={() => setForm(null)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </form>
      )}
      {error ? (
        <p role="alert" className="text-sm font-medium text-bad">
          {error}
        </p>
      ) : null}
    </section>
  );
}
