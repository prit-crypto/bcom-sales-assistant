"use client";

import { useEffect, useRef, useState } from "react";
import { errorMessage, isAbort, patchJson, patchOnLeave } from "@/lib/client/api";
import { partnerForRequest } from "@/lib/partner";
import type { PartnerDetailsInput, ProposalDetail, Scenario } from "@/types/api";
import type { InvoiceData } from "@/types/invoice";

/** Wait this long after the last change before saving. */
const SAVE_DELAY_MS = 800;

export type SaveState = "idle" | "saving" | "saved" | "error";

interface Draft {
  invoice: InvoiceData;
  scenario: Scenario;
  partner: PartnerDetailsInput;
  message: string | null;
}

/** The partner details can be saved once the prospect has a name (the partner's own may still be empty). */
export function partnerSavable(partner: PartnerDetailsInput): boolean {
  return partner.prospect_name.trim() !== "";
}

/**
 * Autosave for a saved proposal: a moment after the shipments, what-if, partner details or message stop
 * changing, only the parts that changed are sent. A newer save cancels an older one still on its way.
 */
export function useProposalSync(
  proposalId: string | null,
  draft: Draft | null,
  onSaved: (detail: ProposalDetail) => void,
): { state: SaveState; error: string | null } {
  const [state, setState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  /** What the server has, per field, as JSON — to send only what changed */
  const saved = useRef<Record<string, string>>({});
  const request = useRef<AbortController | null>(null);
  const savedFor = useRef<string | null>(null);
  /** Changes not yet confirmed by the server, sent on the way out if the page closes first */
  const pending = useRef<{ id: string; fields: Record<string, unknown> } | null>(null);
  const onSavedRef = useRef(onSaved);

  useEffect(() => {
    onSavedRef.current = onSaved;
  }, [onSaved]);

  useEffect(() => {
    if (!proposalId || !draft) return;
    const fields: Record<string, unknown> = {
      invoice: draft.invoice,
      scenario: draft.scenario,
      message: draft.message,
    };
    if (partnerSavable(draft.partner)) fields.partner = partnerForRequest(draft.partner);

    // A newly saved or opened proposal: what we hold now is what the server has.
    if (savedFor.current !== proposalId) {
      savedFor.current = proposalId;
      saved.current = Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, JSON.stringify(value)]));
      return;
    }
    const changed = Object.fromEntries(
      Object.entries(fields).filter(([key, value]) => saved.current[key] !== JSON.stringify(value)),
    );
    if (Object.keys(changed).length === 0) return;
    pending.current = { id: proposalId, fields: changed };

    // Say "Saving…" from the first change, not only once the request starts.
    const soon = window.setTimeout(() => setState("saving"), 0);
    const timer = window.setTimeout(() => {
      request.current?.abort();
      const controller = new AbortController();
      request.current = controller;
      setState("saving");
      patchJson<ProposalDetail>(`/proposals/${proposalId}`, changed, controller.signal)
        .then((detail) => {
          Object.entries(changed).forEach(([key, value]) => {
            saved.current[key] = JSON.stringify(value);
          });
          if (pending.current?.fields === changed) pending.current = null;
          setState("saved");
          setError(null);
          onSavedRef.current(detail);
        })
        .catch((failure: unknown) => {
          if (isAbort(failure)) return;
          setState("error");
          setError(errorMessage(failure));
        });
    }, SAVE_DELAY_MS);
    return () => {
      window.clearTimeout(soon);
      window.clearTimeout(timer);
    };
  }, [proposalId, draft]);

  // Closing, reloading or leaving the page inside the short wait still saves the last change.
  useEffect(() => {
    const flush = () => {
      if (pending.current) patchOnLeave(`/proposals/${pending.current.id}`, pending.current.fields);
      pending.current = null;
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      // Leaving the journey inside the app (e.g. "See proposal") doesn't fire pagehide: save here too.
      flush();
      request.current?.abort();
    };
  }, []);

  return { state, error };
}
