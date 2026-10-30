/**
 * Central HTTP helper for the Vite frontend.
 * Uses VITE_API_BASE_URL when set; otherwise same-origin (Vite proxy /api).
 */

import { clearAccessToken, readAccessToken } from "../auth/storage";
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

function buildUrl(
  path: string,
  query?: Record<string, string | number | undefined | null>,
): string {
  const base = API_BASE.replace(/\/$/, "");
  const url = new URL(`${base}${path}`, window.location.origin);
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

function getTokenHeader(): Record<string, string> {
  const token = readAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function handleResponseAuthError(status: number, requestToken: string | null): void {
  // An unauthenticated request can legitimately receive 401 (for example
  // during initial app hydration). It must not clear a token that may have
  // been saved by a concurrent login flow.
  if (status === 401 && requestToken && readAccessToken() === requestToken) {
    clearAccessToken();
    window.dispatchEvent(new CustomEvent("pril:auth-expired", { detail: "Session expired" }));
  }
  if (status === 403) {
    window.dispatchEvent(new CustomEvent("pril:auth-forbidden", { detail: "Access denied" }));
  }
}

export async function apiGet<T>(
  path: string,
  query?: Record<string, string | number | undefined | null>,
): Promise<T> {
  const token = readAccessToken();
  const response = await fetch(buildUrl(path, query), {
    method: "GET",
    headers: {
      Accept: "application/json",
      ...getTokenHeader(),
    },
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
    handleResponseAuthError(response.status, token);

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
): Promise<T> {
  const token = readAccessToken();
  const response = await fetch(buildUrl(path), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...getTokenHeader(),
    },
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
    handleResponseAuthError(response.status, token);

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

export async function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  const token = readAccessToken();
  const response = await fetch(buildUrl(path), {
    method: "POST",
    headers: {
      Accept: "application/json",
      ...getTokenHeader(),
    },
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
    handleResponseAuthError(response.status, token);

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
