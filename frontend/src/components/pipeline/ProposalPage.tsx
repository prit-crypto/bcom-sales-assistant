"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AppBar } from "@/components/ui/AppBar";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { HeroBand } from "@/components/ui/Hero";
import { Icon } from "@/components/ui/Icon";
import { errorMessage, getFile, getJson, patchJson, saveBlob, sendNoContent } from "@/lib/client/api";
import { formatDueDate, formatMoney, formatPercent, formatWhen } from "@/lib/format";
import type { ProposalDetail, ProposalStatus } from "@/types/api";
import { STATUS_LABEL } from "./ProposalStatusPill";
import { ShareCard } from "./ShareCard";

/** Wait this long after the last keystroke before saving the notes. */
const NOTES_DELAY_MS = 800;

function volumeText(factor: number): string {
  return factor === 2
    ? "twice the volume"
    : `${factor > 1 ? "+" : "−"}${Math.round(Math.abs(factor - 1) * 100)}% volume`;
}

/** A saved proposal: where it stands, when to follow up, notes, and its files. */
export function ProposalPage({ id }: { id: string }) {
  const router = useRouter();
  const [proposal, setProposal] = useState<ProposalDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [askingLost, setAskingLost] = useState(false);
  const [lostReason, setLostReason] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [notes, setNotes] = useState("");
  const [notesState, setNotesState] = useState<"idle" | "saving" | "saved">("idle");
  const [copied, setCopied] = useState(false);
  const savedNotes = useRef("");

  useEffect(() => {
    let cancelled = false;
    getJson<ProposalDetail>(`/proposals/${id}`)
      .then((detail) => {
        if (cancelled) return;
        setProposal(detail);
        setNotes(detail.notes);
        savedNotes.current = detail.notes;
      })
      .catch((failure: unknown) => {
        if (!cancelled) setLoadError(errorMessage(failure));
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Notes save themselves a moment after typing stops.
  useEffect(() => {
    if (!proposal || notes === savedNotes.current) return;
    const timer = window.setTimeout(() => {
      setNotesState("saving");
      patchJson<ProposalDetail>(`/proposals/${id}`, { notes })
        .then((detail) => {
          savedNotes.current = notes;
          setProposal(detail);
          setNotesState("saved");
        })
        .catch((failure: unknown) => {
          setNotesState("idle");
          setActionError(errorMessage(failure));
        });
    }, NOTES_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [notes, proposal, id]);

  async function update(label: string, fields: Record<string, unknown>) {
    setBusy(label);
    setActionError(null);
    try {
      setProposal(await patchJson<ProposalDetail>(`/proposals/${id}`, fields));
      return true;
    } catch (failure) {
      setActionError(errorMessage(failure));
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function setStatus(status: ProposalStatus, extra: Record<string, unknown> = {}) {
    if (await update(status, { status, ...extra })) {
      setAskingLost(false);
      setLostReason("");
    }
  }

  async function download(kind: "pdf" | "excel") {
    setBusy(kind);
    setActionError(null);
    try {
      const { blob, fileName } = await getFile(`/proposals/${id}/${kind}`);
      saveBlob(blob, fileName ?? `${proposal?.reference ?? "proposal"}.${kind === "pdf" ? "pdf" : "xlsx"}`);
      setProposal(await getJson<ProposalDetail>(`/proposals/${id}`));
    } catch (failure) {
      setActionError(errorMessage(failure));
    } finally {
      setBusy(null);
    }
  }

  async function copyMessage() {
    if (!proposal?.message) return;
    try {
      await navigator.clipboard.writeText(proposal.message);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
      await sendNoContent(`/proposals/${id}/events`, "POST", { kind: "message_copied" });
      setProposal(await getJson<ProposalDetail>(`/proposals/${id}`));
    } catch (failure) {
      setActionError(errorMessage(failure));
    }
  }

  async function remove() {
    setBusy("delete");
    try {
      await sendNoContent(`/proposals/${id}`, "DELETE");
      router.push("/");
    } catch (failure) {
      setActionError(errorMessage(failure));
      setBusy(null);
    }
  }

  if (!proposal) {
    return (
      <div className="flex min-h-screen flex-col">
        <AppBar />
        <main className="mx-auto flex w-full max-w-[720px] flex-1 flex-col justify-center gap-4 px-4">
          {loadError ? (
            <Banner tone="error" title="Could not open this proposal">
              {loadError}{" "}
              <Link href="/" className="font-semibold underline">
                Back to proposals
              </Link>
            </Banner>
          ) : (
            <p role="status" className="text-center text-secondary">
              Opening the proposal…
            </p>
          )}
        </main>
      </div>
    );
  }

  const summary = proposal.comparison.summary;
  const scenario = proposal.scenario;
  const scenarioParts = [
    scenario.volume_factor !== 1 ? volumeText(scenario.volume_factor) : null,
    scenario.economy_for_non_urgent ? "non-urgent parcels by Economy" : null,
  ].filter(Boolean);

  return (
    <div className="flex min-h-screen flex-col">
      <AppBar
        actions={
          <Link
            href={`/proposals/${id}/edit`}
            className="pressable inline-flex min-h-11 items-center gap-2 rounded-full bg-hero-raised px-5 text-[15px] font-semibold text-gold hover:bg-hero-line focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
          >
            <Icon name="pencil" className="size-4" />
            <span>
              <span className="sr-only sm:not-sr-only">Continue </span>editing
            </span>
          </Link>
        }
      />
      <HeroBand width="max-w-[1000px]" inner="flex flex-col gap-5 pt-6 pb-24 sm:pt-8">
        <Link
          href="/"
          className="pressable inline-flex min-h-10 items-center gap-1 self-start rounded-full pr-3 text-[15px] font-medium text-gold hover:underline focus-visible:outline-2 focus-visible:outline-gold"
        >
          <Icon name="chevronLeft" className="size-4" />
          Proposals
        </Link>
        <section aria-labelledby="proposal-title" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <h1 id="proposal-title" className="type-title text-[32px] font-bold sm:text-[44px]">
                {proposal.prospect_name}
              </h1>
              <p className="text-[15px] text-hero-secondary">
                {proposal.reference} · saved {formatWhen(proposal.created_at)}
                {proposal.source_file_name ? ` from ${proposal.source_file_name}` : ""}
              </p>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-[13px] font-semibold ${
                proposal.status === "won"
                  ? "bg-hero-save text-hero"
                  : proposal.status === "sent"
                    ? "bg-gold text-on-gold"
                    : "bg-hero-raised text-hero-ink"
              }`}
            >
              {STATUS_LABEL[proposal.status]}
            </span>
          </div>
          {summary.has_saving ? (
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="type-display tabular text-[56px] font-bold sm:text-[80px]">
                {formatMoney(summary.monthly_saving, summary.currency)}
              </span>
              <span className="type-title text-2xl font-semibold text-gold">a month</span>
              <span className="w-full text-[15px] text-hero-secondary sm:text-[17px]">
                {formatMoney(summary.yearly_saving, summary.currency)} a year ·{" "}
                {formatPercent(summary.saving_pct)} less · {summary.compared_shipments} of{" "}
                {summary.total_shipments} shipments compared
                {scenarioParts.length ? ` · with ${scenarioParts.join(" and ")}` : ""}
              </span>
            </div>
          ) : (
            <p className="rounded-2xl bg-hero-raised px-4 py-3 text-[15px] text-hero-ink">
              <strong className="font-semibold">No saving to propose.</strong> BCOM is not cheaper for these
              shipments. Continue editing to check them.
            </p>
          )}
        </section>
      </HeroBand>
      <main className="mx-auto -mt-14 flex w-full max-w-[1000px] flex-1 flex-col gap-5 px-4 pb-16 sm:px-6">
        {actionError ? (
          <Banner tone="error" title="That didn't work">
            {actionError}
          </Banner>
        ) : null}

        <div className="flex min-w-0 flex-col gap-5">
          <section
            aria-labelledby="stands-title"
            className="flex flex-col gap-4 rounded-[22px] bg-surface p-5 shadow-raised sm:p-6"
          >
            <h2 id="stands-title" className="type-headline text-lg font-semibold">
              Where it stands
            </h2>
            <StatusText proposal={proposal} />
            {askingLost ? (
              <div className="flex flex-col gap-3 rounded-2xl bg-fill-soft p-4">
                <label className="flex flex-col gap-1">
                  <span className="text-[13px] text-secondary">Why was it lost? (optional)</span>
                  <input
                    value={lostReason}
                    maxLength={200}
                    onChange={(event) => setLostReason(event.target.value)}
                    placeholder="e.g. stayed with their courier"
                    className="h-11 rounded-xl border border-separator bg-surface px-3 text-[15px] outline-none focus:border-accent focus:ring-4 focus:ring-accent/20"
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="primary"
                    onClick={() => void setStatus("lost", { lost_reason: lostReason })}
                    disabled={busy !== null}
                  >
                    Mark as lost
                  </Button>
                  <Button variant="plain" onClick={() => setAskingLost(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {proposal.status === "draft" ? (
                  <Button
                    onClick={() => void setStatus("sent")}
                    disabled={busy !== null || !proposal.has_saving}
                  >
                    <Icon name="check" className="size-4" />
                    Mark as sent
                  </Button>
                ) : null}
                {proposal.status === "sent" ? (
                  <>
                    <Button onClick={() => void setStatus("won")} disabled={busy !== null}>
                      Won
                    </Button>
                    <Button variant="tinted" onClick={() => setAskingLost(true)} disabled={busy !== null}>
                      Lost
                    </Button>
                    <Button
                      variant="plain"
                      onClick={() => void setStatus("draft")}
                      disabled={busy !== null}
                    >
                      Back to draft
                    </Button>
                  </>
                ) : null}
                {proposal.status === "won" || proposal.status === "lost" ? (
                  <Button variant="tinted" onClick={() => void setStatus("sent")} disabled={busy !== null}>
                    Reopen
                  </Button>
                ) : null}
              </div>
            )}
            {proposal.status === "sent" ? (
              <label className="flex flex-wrap items-center gap-3 border-t border-separator pt-4">
                <span className="flex items-center gap-2 text-[15px] font-medium">
                  <Icon name="calendar" className="size-4 text-secondary" />
                  Follow up on
                </span>
                <input
                  type="date"
                  value={proposal.follow_up_on ?? ""}
                  onChange={(event) =>
                    void update("follow_up", { follow_up_on: event.target.value || null })
                  }
                  className="h-10 rounded-xl border border-separator bg-surface px-3 text-[15px] outline-none focus:border-accent focus:ring-4 focus:ring-accent/20"
                />
              </label>
            ) : null}
          </section>

          <section
            aria-labelledby="files-title"
            className="flex flex-col gap-3 rounded-[22px] bg-surface p-5 shadow-card sm:p-6"
          >
            <h2 id="files-title" className="type-headline text-lg font-semibold">
              Send again
            </h2>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="tinted"
                onClick={() => void download("pdf")}
                disabled={busy !== null || !proposal.has_saving}
              >
                <Icon name="download" className="size-4" />
                {busy === "pdf" ? "Preparing…" : "Download PDF"}
              </Button>
              <Button variant="tinted" onClick={() => void download("excel")} disabled={busy !== null}>
                <Icon name="download" className="size-4" />
                {busy === "excel" ? "Preparing…" : "Download Excel"}
              </Button>
              {proposal.message ? (
                <Button variant="tinted" onClick={() => void copyMessage()}>
                  <Icon name={copied ? "check" : "copy"} className="size-4" />
                  {copied ? "Copied" : "Copy message"}
                </Button>
              ) : null}
            </div>
            {proposal.message ? (
              <p
                dir={proposal.partner.language === "ar" ? "rtl" : "ltr"}
                lang={proposal.partner.language}
                className="line-clamp-4 rounded-2xl bg-fill-soft px-4 py-3 text-sm leading-relaxed whitespace-pre-line text-secondary"
              >
                {proposal.message}
              </p>
            ) : (
              <p className="text-[13px] text-secondary">
                The WhatsApp message is written on the last step of the journey.
              </p>
            )}
          </section>

          <ShareCard proposal={proposal} onChange={setProposal} />

          <section
            aria-labelledby="notes-title"
            className="flex flex-col gap-2 rounded-[22px] bg-surface p-5 shadow-card sm:p-6"
          >
            <div className="flex items-center justify-between">
              <h2 id="notes-title" className="type-headline text-lg font-semibold">
                <label htmlFor="proposal-notes">Notes</label>
              </h2>
              <span role="status" className="text-[13px] text-secondary">
                {notesState === "saving" ? "Saving…" : notesState === "saved" ? "Saved" : ""}
              </span>
            </div>
            <textarea
              id="proposal-notes"
              value={notes}
              maxLength={4000}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Anything to remember: who you spoke to, what they asked…"
              rows={4}
              className="w-full resize-y rounded-2xl border border-separator bg-surface px-4 py-3 text-[15px] leading-relaxed outline-none focus:border-accent focus:ring-4 focus:ring-accent/20"
            />
          </section>
        </div>

        <section
          aria-label="Delete"
          className="flex flex-wrap items-center justify-between gap-3 rounded-[22px] bg-surface px-5 py-4 shadow-card sm:px-6"
        >
          {confirmDelete ? (
            <>
              <span className="text-[15px]">
                <strong className="font-semibold">Delete this proposal?</strong> Its data is
                removed. This can&apos;t be undone.
              </span>
              <span className="flex gap-2">
                <Button variant="plain" onClick={() => setConfirmDelete(false)}>
                  Cancel
                </Button>
                <button
                  type="button"
                  onClick={() => void remove()}
                  disabled={busy === "delete"}
                  className="pressable inline-flex min-h-11 items-center gap-2 rounded-full bg-bad px-5 text-[15px] font-semibold text-on-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <Icon name="trash" className="size-4" />
                  {busy === "delete" ? "Deleting…" : "Delete for good"}
                </button>
              </span>
            </>
          ) : (
            <>
              <span className="text-[13px] text-secondary">
                Last change {formatWhen(proposal.updated_at)}
              </span>
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="pressable inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-bad hover:bg-bad-tint focus-visible:outline-2 focus-visible:outline-accent"
              >
                <Icon name="trash" className="size-4" />
                Delete proposal
              </button>
            </>
          )}
        </section>
      </main>
    </div>
  );
}

function StatusText({ proposal }: { proposal: ProposalDetail }) {
  let text: string;
  if (proposal.status === "draft") {
    text = proposal.has_saving
      ? "Not sent yet. Mark it as sent once the prospect has the PDF and message."
      : "Not sent: there is no saving to propose yet.";
  } else if (proposal.status === "sent") {
    const sent = proposal.sent_at ? `Sent ${formatWhen(proposal.sent_at)}.` : "Sent.";
    text = proposal.follow_up_on
      ? `${sent} Follow up ${formatDueDate(proposal.follow_up_on)}.`
      : `${sent} No follow-up date set.`;
  } else if (proposal.status === "won") {
    text = `Won${proposal.decided_at ? ` ${formatWhen(proposal.decided_at)}` : ""}.`;
    // Accepted on the customer's page: who accepted, and their note for the partner.
    const accepted = proposal.events.find((event) => event.kind === "accepted_online");
    if (accepted) {
      const detail = accepted.detail as Record<string, unknown>;
      text += ` Accepted online by ${String(detail.name)}${detail.note ? `: "${String(detail.note)}"` : "."}`;
    }
  } else {
    text = `Lost${proposal.decided_at ? ` ${formatWhen(proposal.decided_at)}` : ""}${
      proposal.lost_reason ? `: ${proposal.lost_reason}` : ""
    }.`;
  }
  return (
    <p
      className={`text-[15px] ${proposal.follow_up_due ? "font-semibold text-attention-ink" : "text-secondary"}`}
    >
      {text}
    </p>
  );
}
