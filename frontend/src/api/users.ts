import { apiGet } from "./client";
import type { UserListResponse, UserRecord } from "../types/userManagement";

const BASE = "/api/v1/users";

export type UserCreatePayload = {
  employee_code: string;
  email: string;
  password: string;
  plant_id?: string | null;
  department_id?: string | null;
  role_codes?: string[];
};

export type UserUpdatePayload = Partial<UserCreatePayload> & {
  is_active?: boolean;
};

export function fetchUsers(): Promise<UserListResponse> {
  return apiGet<UserListResponse>(BASE);
}

export function fetchUser(userId: string): Promise<UserRecord> {
  return apiGet<UserRecord>(`${BASE}/${userId}`);
}

export async function createUser(payload: UserCreatePayload): Promise<UserRecord> {
  return fetch(`${BASE}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${window.localStorage.getItem("pril_access_token") ?? ""}`,
    },
    body: JSON.stringify(payload),
  }).then(async (response) => {
    const text = await response.text();
    const body = text ? JSON.parse(text) : null;
    if (!response.ok) {
      throw new Error(body?.detail ?? `Request failed (${response.status})`);
    }
    return body as UserRecord;
  });
}

export async function updateUser(userId: string, payload: UserUpdatePayload): Promise<UserRecord> {
  return fetch(`${BASE}/${userId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${window.localStorage.getItem("pril_access_token") ?? ""}`,
    },
    body: JSON.stringify(payload),
  }).then(async (response) => {
    const text = await response.text();
    const body = text ? JSON.parse(text) : null;
    if (!response.ok) {
      throw new Error(body?.detail ?? `Request failed (${response.status})`);
    }
    return body as UserRecord;
  });
}

export async function toggleUserStatus(userId: string, activate: boolean): Promise<UserRecord> {
  return fetch(`${BASE}/${userId}/${activate ? "activate" : "deactivate"}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${window.localStorage.getItem("pril_access_token") ?? ""}`,
    },
  }).then(async (response) => {
    const text = await response.text();
    const body = text ? JSON.parse(text) : null;
    if (!response.ok) {
      throw new Error(body?.detail ?? `Request failed (${response.status})`);
    }
    return body as UserRecord;
  });
}

export async function assignUserRoles(userId: string, roleCodes: string[]): Promise<UserRecord> {
  return fetch(`${BASE}/${userId}/roles`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${window.localStorage.getItem("pril_access_token") ?? ""}`,
    },
    body: JSON.stringify({ role_codes: roleCodes }),
  }).then(async (response) => {
    const text = await response.text();
    const body = text ? JSON.parse(text) : null;
    if (!response.ok) {
      throw new Error(body?.detail ?? `Request failed (${response.status})`);
    }
    return body as UserRecord;
  });
}

export async function assignUserPlant(userId: string, plantId: string | null): Promise<UserRecord> {
  return fetch(`${BASE}/${userId}/plant`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${window.localStorage.getItem("pril_access_token") ?? ""}`,
    },
    body: JSON.stringify({ plant_id: plantId }),
  }).then(async (response) => {
    const text = await response.text();
    const body = text ? JSON.parse(text) : null;
    if (!response.ok) {
      throw new Error(body?.detail ?? `Request failed (${response.status})`);
    }
    return body as UserRecord;
  });
}

export async function assignUserDepartment(userId: string, departmentId: string | null): Promise<UserRecord> {
  return fetch(`${BASE}/${userId}/department`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${window.localStorage.getItem("pril_access_token") ?? ""}`,
    },
    body: JSON.stringify({ department_id: departmentId }),
  }).then(async (response) => {
    const text = await response.text();
    const body = text ? JSON.parse(text) : null;
    if (!response.ok) {
      throw new Error(body?.detail ?? `Request failed (${response.status})`);
    }
    return body as UserRecord;
  });
}
