/**
 * Central HTTP helper for the Vite frontend.
 * Uses VITE_API_BASE_URL when set; otherwise same-origin (Vite proxy /api).
 */

import { readAccessToken } from "../auth/storage";
import type { ApiError } from "../types/dashboard";

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";

export class ApiRequestError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
  }

  toApiError(): ApiError {
    return { status: this.status, message: this.message };
  }
}

export function buildApiUrl(
  path: string,
  query?: Record<string, string | number | undefined | null>,
): string {
  const base = API_BASE.replace(/\/$/, "");
  const relativePath = `${base}${path}`;
  const origin = typeof window === "undefined" ? "http://localhost" : window.location.origin;
  const url = new URL(relativePath, origin);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(key, String(value));
    }
  }
  if (base.startsWith("http://") || base.startsWith("https://")) {
    return url.href;
  }
  return `${url.pathname}${url.search}`;
}

function mergeHeaders(
  defaultHeaders: Record<string, string>,
  optionsHeaders: HeadersInit | undefined,
  token: string | null,
): Headers {
  const headers = new Headers(defaultHeaders);
  if (optionsHeaders) {
    new Headers(optionsHeaders).forEach((value, key) => headers.set(key, value));
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return headers;
}

function handleResponseAuthError(status: number): void {
  if (status === 403) {
    window.dispatchEvent(new CustomEvent("pril:auth-forbidden", { detail: "Access denied" }));
  }
}

type ApiRequestOptions = Omit<RequestInit, "body" | "method">;

export async function apiGet<T>(
  path: string,
  query?: Record<string, string | number | undefined | null>,
  options?: ApiRequestOptions,
): Promise<T> {
  const token = readAccessToken();
  const response = await fetch(buildApiUrl(path, query), {
    ...options,
    method: "GET",
    headers: mergeHeaders({
      Accept: "application/json",
    }, options?.headers, token),
  });

  let body: unknown = null;
  const text = await response.text();
  if (text) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = text;
    }
  }

  if (!response.ok) {
    handleResponseAuthError(response.status);

    const detail =
      body &&
      typeof body === "object" &&
      body !== null &&
      "detail" in body &&
      (body as { detail: unknown }).detail !== undefined
        ? String((body as { detail: unknown }).detail)
        : `Request failed (${response.status})`;
    throw new ApiRequestError(response.status, detail);
  }

  return body as T;
}

export async function apiPost<T>(
  path: string,
  body: Record<string, unknown>,
  options?: ApiRequestOptions,
): Promise<T> {
  const token = readAccessToken();
  const response = await fetch(buildApiUrl(path), {
    ...options,
    method: "POST",
    headers: mergeHeaders({
      "Content-Type": "application/json",
      Accept: "application/json",
    }, options?.headers, token),
    body: JSON.stringify(body),
  });

  let responseBody: unknown = null;
  const text = await response.text();
  if (text) {
    try {
      responseBody = JSON.parse(text) as unknown;
    } catch {
      responseBody = text;
    }
  }

  if (!response.ok) {
    handleResponseAuthError(response.status);

    const detail =
      responseBody &&
      typeof responseBody === "object" &&
      responseBody !== null &&
      "detail" in responseBody &&
      (responseBody as { detail: unknown }).detail !== undefined
        ? String((responseBody as { detail: unknown }).detail)
        : `Request failed (${response.status})`;
    throw new ApiRequestError(response.status, detail);
  }

  return responseBody as T;
}

export async function apiUpload<T>(
  path: string,
  formData: FormData,
  options?: ApiRequestOptions,
): Promise<T> {
  const token = readAccessToken();
  const response = await fetch(buildApiUrl(path), {
    ...options,
    method: "POST",
    headers: mergeHeaders({
      Accept: "application/json",
    }, options?.headers, token),
    body: formData,
  });

  let responseBody: unknown = null;
  const text = await response.text();
  if (text) {
    try {
      responseBody = JSON.parse(text) as unknown;
    } catch {
      responseBody = text;
    }
  }

  if (!response.ok) {
    handleResponseAuthError(response.status);

    const detail =
      responseBody &&
      typeof responseBody === "object" &&
      responseBody !== null &&
      "detail" in responseBody &&
      (responseBody as { detail: unknown }).detail !== undefined
        ? String((responseBody as { detail: unknown }).detail)
        : `Request failed (${response.status})`;
    throw new ApiRequestError(response.status, detail);
  }

  return responseBody as T;
}

export function getApiBase(): string {
  return API_BASE;
}
