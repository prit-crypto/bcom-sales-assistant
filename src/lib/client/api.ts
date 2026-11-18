import type { ApiErrorBody } from "@/types/api";

/** Error from one of our API routes, with a message that is safe to show. */
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

async function send(url: string, init: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new ApiRequestError("Could not reach the server. Check that the app is running.", "network_error");
  }
  if (!response.ok) throw await toApiError(response);
  return response;
}

export async function getJson<T>(url: string): Promise<T> {
  return (await send(url, { method: "GET" })).json() as Promise<T>;
}

export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await send(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return response.json() as Promise<T>;
}

export async function postForm<T>(url: string, form: FormData): Promise<T> {
  return (await send(url, { method: "POST", body: form })).json() as Promise<T>;
}

export async function postForBlob(url: string, body: unknown): Promise<Blob> {
  const response = await send(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return response.blob();
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}
