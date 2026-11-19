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
  } catch {
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

export async function postJson<T>(path: string, body: unknown): Promise<T> {
  return (await send(path, jsonInit(body))).json() as Promise<T>;
}

export async function postForm<T>(path: string, form: FormData): Promise<T> {
  return (await send(path, { method: "POST", body: form })).json() as Promise<T>;
}

export async function postForBlob(path: string, body: unknown): Promise<Blob> {
  return (await send(path, jsonInit(body))).blob();
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}
