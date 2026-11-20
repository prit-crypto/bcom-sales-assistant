/**
 * Keeps the journey across a page refresh. Uses sessionStorage: one tab only, and it is cleared when
 * the tab closes, so invoice data never lingers on the device. Every access is guarded: storage can be
 * blocked (private windows, strict settings) and the app must still work without it.
 */
import type { StepId } from "@/components/ui/AppBar";
import type { MessageResponse, PartnerDetailsInput, ProviderInfo } from "@/types/api";
import type { InvoiceData } from "@/types/invoice";

const SESSION_KEY = "bcom-sales-session-v1";
const FILE_KEY = "bcom-sales-file-v1";
/** Larger invoices are not kept for the viewer after a refresh (sessionStorage holds ~5 MB). */
const MAX_FILE_BYTES = 3 * 1024 * 1024;

export type SourceKind = "pdf" | "image";

export interface SavedSession {
  version: 1;
  step: StepId;
  reached: StepId;
  extracted: { invoice: InvoiceData; provider: ProviderInfo; fileName: string } | null;
  partner: PartnerDetailsInput;
  message: MessageResponse | null;
  source: { name: string; kind: SourceKind } | null;
}

export function loadSession(): SavedSession | null {
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedSession;
    return parsed.version === 1 && parsed.extracted ? parsed : null;
  } catch {
    return null;
  }
}

export function saveSession(session: SavedSession): void {
  try {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // Full or blocked storage: the app keeps working, it just won't survive a refresh.
  }
}

export function clearSession(): void {
  try {
    window.sessionStorage.removeItem(SESSION_KEY);
    window.sessionStorage.removeItem(FILE_KEY);
  } catch {
    // Nothing to clear.
  }
}

/** Keeps a small invoice file so the viewer still works after a refresh. */
export function saveSourceFile(file: Blob): void {
  if (file.size > MAX_FILE_BYTES) {
    clearSourceFile();
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    try {
      window.sessionStorage.setItem(FILE_KEY, String(reader.result));
    } catch {
      clearSourceFile();
    }
  };
  reader.readAsDataURL(file);
}

export async function loadSourceFile(): Promise<Blob | null> {
  try {
    const dataUrl = window.sessionStorage.getItem(FILE_KEY);
    if (!dataUrl) return null;
    return await (await fetch(dataUrl)).blob();
  } catch {
    return null;
  }
}

function clearSourceFile(): void {
  try {
    window.sessionStorage.removeItem(FILE_KEY);
  } catch {
    // Nothing to clear.
  }
}

export function sourceKind(type: string): SourceKind {
  return type === "application/pdf" ? "pdf" : "image";
}
