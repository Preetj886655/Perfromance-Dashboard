/**
 * Central HTTP helper for the Vite frontend.
 * Uses VITE_API_BASE_URL when set; otherwise same-origin (Vite proxy /api).
 */

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

export async function apiGet<T>(
  path: string,
  query?: Record<string, string | number | undefined | null>,
): Promise<T> {
  const response = await fetch(buildUrl(path, query), {
    method: "GET",
    headers: { Accept: "application/json" },
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

export function getApiBase(): string {
  return API_BASE;
}
