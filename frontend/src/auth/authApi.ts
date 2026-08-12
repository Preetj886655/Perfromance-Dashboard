import { clearAccessToken, readAccessToken, saveAccessToken } from "./storage";
import type { AuthUser, LoginCredentials, LoginResponse } from "./authTypes";

const AUTH_BASE = "/api/v1/auth";

export const AUTH_EVENT_EXPIRED = "pril:auth-expired";
export const AUTH_EVENT_FORBIDDEN = "pril:auth-forbidden";

function buildHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

function emitAuthEvent(eventName: string, detail?: unknown): void {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new CustomEvent(eventName, { detail }));
}

async function parseError(response: Response): Promise<string> {
  const text = await response.text();
  if (!text) {
    return response.status === 401
      ? "Invalid authentication credentials"
      : response.status === 403
        ? "You do not have permission to access this resource"
        : `Request failed (${response.status})`;
  }

  try {
    const json = JSON.parse(text) as { detail?: string };
    if (json.detail) {
      return String(json.detail);
    }
  } catch {
    // Ignore parse issues and fall back to the raw text.
  }

  return text;
}

export async function loginWithCredentials(credentials: LoginCredentials): Promise<AuthUser> {
  const response = await fetch(`${AUTH_BASE}/login`, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify(credentials),
  });

  if (!response.ok) {
    const message = await parseError(response);
    throw new Error(message);
  }

  const payload = (await response.json()) as LoginResponse;
  const token = payload.access_token;
  if (!token) {
    throw new Error("Authentication token missing");
  }

  saveAccessToken(token);

  const user = await fetchCurrentUser(token);
  return user;
}

export async function fetchCurrentUser(token = readAccessToken() ?? undefined): Promise<AuthUser> {
  const response = await fetch(`${AUTH_BASE}/me`, {
    method: "GET",
    headers: buildHeaders(token),
  });

  if (!response.ok) {
    const message = await parseError(response);
    if (response.status === 401) {
      clearAccessToken();
      emitAuthEvent(AUTH_EVENT_EXPIRED, message);
    } else if (response.status === 403) {
      emitAuthEvent(AUTH_EVENT_FORBIDDEN, message);
    }
    throw new Error(message);
  }

  const payload = (await response.json()) as AuthUser;
  return {
    ...payload,
    roles: Array.isArray(payload.roles) ? payload.roles : [],
    permissions: Array.isArray(payload.permissions) ? payload.permissions : [],
  };
}

export function logoutClient(): void {
  clearAccessToken();
  emitAuthEvent(AUTH_EVENT_EXPIRED, "Signed out");
}
