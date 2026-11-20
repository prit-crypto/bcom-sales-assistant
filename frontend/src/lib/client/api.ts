import type { ApiErrorBody } from "@/types/api";

/** Base URL of the backend API, e.g. http://localhost:8000/api/v1 (set in .env.local). */
const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1").replace(/\/+$/, "");

/** Error from the backend, with a message that is safe to show. */
export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

async function toApiError(response: Response): Promise<ApiRequestError> {
  try {
    const body = (await response.json()) as ApiErrorBody;
    return new ApiRequestError(body.error.message, body.error.code);
  } catch {
    return new ApiRequestError(`Request failed (${response.status}). Please try again.`, "http_error");
  }
}

async function send(path: string, init: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, init);
  } catch (error) {
    if (isAbort(error)) throw error;
    throw new ApiRequestError("Could not reach the server. Check that the backend is running.", "network_error");
  }
  if (!response.ok) throw await toApiError(response);
  return response;
}

function jsonInit(body: unknown): RequestInit {
  return { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

export async function getJson<T>(path: string): Promise<T> {
  return (await send(path, { method: "GET" })).json() as Promise<T>;
}

export async function postJson<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  return (await send(path, { ...jsonInit(body), signal })).json() as Promise<T>;
}

export async function patchJson<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  return (await send(path, { ...jsonInit(body), method: "PATCH", signal })).json() as Promise<T>;
}

/** A last PATCH as the page closes or reloads: the browser finishes it even after the page is gone. */
export function patchOnLeave(path: string, body: unknown): void {
  void fetch(`${API_URL}${path}`, { ...jsonInit(body), method: "PATCH", keepalive: true }).catch(() => undefined);
}

/** POST or DELETE whose answer has no body (204). */
export async function sendNoContent(path: string, method: "POST" | "DELETE", body?: unknown): Promise<void> {
  await send(path, body === undefined ? { method } : { ...jsonInit(body), method });
}

/** GET that returns a file, with the file name the server suggests. */
export async function getFile(path: string): Promise<{ blob: Blob; fileName: string | null }> {
  const response = await send(path, { method: "GET" });
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const fileName = /filename="([^"]+)"/.exec(disposition)?.[1] ?? null;
  return { blob: await response.blob(), fileName };
}

export async function postForm<T>(path: string, form: FormData): Promise<T> {
  return (await send(path, { method: "POST", body: form })).json() as Promise<T>;
}

/** POST that returns a file. Pass `signal` to cancel it when a newer request replaces it. */
export async function postForBlob(path: string, body: unknown, signal?: AbortSignal): Promise<Blob> {
  return (await send(path, { ...jsonInit(body), signal })).blob();
}

/** Hands a downloaded file to the browser as a download. */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** True when a request was cancelled on purpose (a newer one replaced it). */
export function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}
