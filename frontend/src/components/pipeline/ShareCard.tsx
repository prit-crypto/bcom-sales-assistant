"use client";

import { useState } from "react";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { errorMessage, getJson, postJson, sendNoContent } from "@/lib/client/api";
import { formatWhen } from "@/lib/format";
import type { ProposalDetail, ShareLink } from "@/types/api";

/** The customer's link: make it, copy or open it, see when it was opened, or turn it off. */
export function ShareCard({ proposal, onChange }: { proposal: ProposalDetail; onChange: (detail: ProposalDetail) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const url = proposal.share_path && typeof window !== "undefined" ? `${window.location.origin}${proposal.share_path}` : null;

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      onChange(await getJson<ProposalDetail>(`/proposals/${proposal.id}`));
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Copying was blocked. Select the link and copy it by hand.");
    }
  }

  return (
    <section aria-labelledby="link-title" className="flex flex-col gap-3 rounded-[22px] bg-surface p-5 shadow-card sm:p-6">
      <h2 id="link-title" className="type-headline text-lg font-semibold">
        Customer link
      </h2>
      {url ? (
        <>
          <p className="text-[13px] text-secondary">
            The customer sees the savings and can accept online.{" "}
            {proposal.viewed_at
              ? `Opened ${formatWhen(proposal.viewed_at)}${proposal.view_count > 1 ? ` · ${proposal.view_count} visits` : ""}.`
              : "Not opened yet."}
          </p>
          <input
            readOnly
            aria-label="Customer link"
            value={url}
            onFocus={(event) => event.target.select()}
            className="h-10 w-full rounded-xl border border-separator bg-fill-soft px-3 text-sm text-secondary outline-none focus:border-accent"
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="tinted" onClick={() => void copy()}>
              <Icon name={copied ? "check" : "copy"} className="size-4" />
              {copied ? "Copied" : "Copy link"}
            </Button>
            <a href={proposal.share_path ?? "#"} target="_blank" rel="noopener noreferrer" className={buttonClasses("plain")}>
              Open as the customer
            </a>
            <Button
              variant="plain"
              disabled={busy}
              onClick={() => void run(() => sendNoContent(`/proposals/${proposal.id}/share`, "DELETE"))}
            >
              Turn off
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-[13px] text-secondary">
            A private web page with the savings, the PDF and an Accept button. Accepting marks the proposal as won.
          </p>
          <Button
            variant="tinted"
            className="self-start"
            disabled={busy || !proposal.has_saving}
            onClick={() => void run(() => postJson<ShareLink>(`/proposals/${proposal.id}/share`, {}))}
          >
            Create customer link
          </Button>
        </>
      )}
      {error ? (
        <p role="alert" className="text-sm font-medium text-bad">
          {error}
        </p>
      ) : null}
    </section>
  );
}
