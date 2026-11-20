/**
 * Reads an invoice with live progress: the backend's `/invoices/extract/stream` sends server-sent events
 * (`stage`, then `done` or `error`). EventSource can only GET, so this reads the stream from fetch. If the
 * stream can't be used (an old proxy, a dropped connection), it falls back to the plain `/invoices/extract`.
 */
import type { ExtractResponse } from "@/types/api";
import { API_URL, ApiRequestError, postForm } from "./api";

export type ReadingStage = "received" | "checked" | "reading" | "cleaning" | "checking";

export interface StageEvent {
  stage: ReadingStage;
  /** For "reading": what is happening, e.g. "Gemini is reading the invoice" */
  label?: string;
  /** For "reading": how long reads usually take with this reader, when known */
  typical_seconds?: number | null;
}

function parseBlock(block: string): { name: string; data: unknown } | null {
  let name = "message";
  const data: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith(":")) continue; // heartbeat comment
    if (line.startsWith("event:")) name = line.slice(6).trim();
    else if (line.startsWith("data:")) data.push(line.slice(5).trim());
  }
  if (data.length === 0) return null;
  try {
    return { name, data: JSON.parse(data.join("\n")) };
  } catch {
    return null;
  }
}

async function readError(response: Response): Promise<ApiRequestError> {
  try {
    const body = (await response.json()) as { error: { code: string; message: string } };
    return new ApiRequestError(body.error.message, body.error.code);
  } catch {
    return new ApiRequestError(`Request failed (${response.status}). Please try again.`, "http_error");
  }
}

/** Reads `file`, calling `onStage` as each stage starts. Refusals (wrong file, too big…) are thrown as usual. */
export async function readInvoiceWithProgress(
  file: File,
  onStage: (event: StageEvent) => void,
): Promise<ExtractResponse> {
  const form = new FormData();
  form.append("file", file);
  let response: Response;
  try {
    response = await fetch(`${API_URL}/invoices/extract/stream`, { method: "POST", body: form });
  } catch {
    // Something between here and the server may not allow streams: the plain read says what is wrong.
    return fallback(file);
  }
  if (!response.ok) throw await readError(response);
  if (!response.body || !response.headers.get("content-type")?.startsWith("text/event-stream")) {
    return fallback(file);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      let end = buffer.indexOf("\n\n");
      while (end !== -1) {
        const event = parseBlock(buffer.slice(0, end));
        buffer = buffer.slice(end + 2);
        end = buffer.indexOf("\n\n");
        if (!event) continue;
        if (event.name === "stage") onStage(event.data as StageEvent);
        else if (event.name === "done") return event.data as ExtractResponse;
        else if (event.name === "error") {
          const error = event.data as { code: string; message: string };
          throw new ApiRequestError(error.message, error.code);
        }
      }
    }
  } catch (error) {
    if (error instanceof ApiRequestError) throw error;
    // The stream broke: read again the plain way rather than failing.
    return fallback(file);
  }
  return fallback(file);
}

function fallback(file: File): Promise<ExtractResponse> {
  const form = new FormData();
  form.append("file", file);
  return postForm<ExtractResponse>("/invoices/extract", form);
}
