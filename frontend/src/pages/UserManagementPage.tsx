import { useCallback, useEffect, useMemo, useState } from "react";

import { fetchDepartments, fetchPlants } from "../api/dashboard";
import { ApiRequestError } from "../api/client";
import {
  assignUserDepartment,
  assignUserPlant,
  assignUserRoles,
  createUser,
  fetchUsers,
  toggleUserStatus,
  updateUser,
} from "../api/users";
import { useAuth } from "../auth/useAuth";
import type { UserRecord } from "../types/userManagement";

const DEFAULT_FORM = {
  employee_code: "",
  email: "",
  password: "",
  plant_id: "",
  department_id: "",
  role_codes: [] as string[],
  is_active: true,
};

type FormState = typeof DEFAULT_FORM;

const FALLBACK_ROLE_CODES = [
  "SUPER_ADMIN",
  "MANAGEMENT",
  "PLANT_HEAD",
  "DEPT_HEAD",
  "SUPERVISOR",
  "OPERATOR",
  "ENGINEER",
  "VIEWER",
] as const;

function messageForError(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.status === 401) return "Session expired. Please sign in again.";
    if (error.status === 403) return "You do not have permission to manage users.";
    if (error.status === 409) return error.message || "A duplicate user value was detected.";
    if (error.status === 422) return error.message || "The submitted values are invalid.";
    if (error.status >= 500) return "A server error occurred. Please try again.";
    return error.message || "Request failed.";
  }

  if (error instanceof Error) {
    return error.message || "Request failed.";
  }

  return "Request failed.";
}

function prettyDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function UserManagementPage() {
  const { logout, hasPermission } = useAuth();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [plants, setPlants] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [departments, setDepartments] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [formState, setFormState] = useState<FormState>(DEFAULT_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const canManageUsers = hasPermission("users", "MANAGE");

  const roleOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const roleCode of FALLBACK_ROLE_CODES) {
      seen.set(roleCode, roleCode);
    }
    for (const entry of users) {
      for (const role of entry.roles ?? []) {
        if (role.code) {
          seen.set(role.code, role.code);
        }
      }
    }
    return [...seen.keys()].sort();
  }, [users]);

  const plantLookup = useMemo(
    () => new Map(plants.map((entry) => [entry.id, entry])),
    [plants],
  );

  const departmentLookup = useMemo(
    () => new Map(departments.map((entry) => [entry.id, entry])),
    [departments],
  );

  const loadReferenceData = useCallback(async () => {
    const [plantResponse, departmentResponse] = await Promise.all([
      fetchPlants(),
      fetchDepartments(),
    ]);
    setPlants(plantResponse.items ?? []);
    setDepartments(departmentResponse.items ?? []);
  }, []);

  const loadUsers = useCallback(async () => {
    try {
      const response = await fetchUsers();
      setUsers(response.items ?? []);
      setError(null);
    } catch (caught) {
      setError(messageForError(caught));
    }
  }, []);

  useEffect(() => {
    const bootstrap = async () => {
      setIsLoading(true);
      try {
        await Promise.all([loadReferenceData(), loadUsers()]);
      } finally {
        setIsLoading(false);
      }
    };

    if (canManageUsers) {
      void bootstrap();
    }
  }, [canManageUsers, loadReferenceData, loadUsers]);

  const filteredUsers = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    if (!needle) return users;
    return users.filter((entry) => {
      const roleText = (entry.roles ?? []).map((role) => role.code).join(" ");
      const plantName = plantLookup.get(entry.plant_id ?? "")?.name ?? "";
      const departmentName = departmentLookup.get(entry.department_id ?? "")?.name ?? "";
      const haystack = [
        entry.employee_code,
        entry.email,
        roleText,
        plantName,
        departmentName,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [departmentLookup, plantLookup, searchTerm, users]);

  const resetForm = useCallback(() => {
    setFormState(DEFAULT_FORM);
    setFormError(null);
  }, []);

  const openCreateForm = useCallback(() => {
    resetForm();
    setSelectedUserId(null);
    setShowCreateForm(true);
  }, [resetForm]);

  const openEditForm = useCallback((entry: UserRecord) => {
    setSelectedUserId(entry.id);
    setShowCreateForm(false);
    setFormState({
      employee_code: entry.employee_code,
      email: entry.email,
      password: "",
      plant_id: entry.plant_id ?? "",
      department_id: entry.department_id ?? "",
      role_codes: entry.roles?.map((role) => role.code) ?? [],
      is_active: entry.is_active,
    });
    setFormError(null);
  }, []);

  const handleFormChange = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setFormState((prev) => ({ ...prev, [field]: value }));
  };

  const handleRoleToggle = (roleCode: string) => {
    setFormState((prev) => {
      const next = prev.role_codes.includes(roleCode)
        ? prev.role_codes.filter((code) => code !== roleCode)
        : [...prev.role_codes, roleCode];
      return { ...prev, role_codes: next };
    });
  };

  const saveCreateUser = async () => {
    const employee_code = formState.employee_code.trim();
    const email = formState.email.trim();
    const password = formState.password.trim();

    if (!employee_code || !email || !password) {
      setFormError("Employee code, email, and password are required.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFormError("Please enter a valid email address.");
      return;
    }
    if (password.length < 8) {
      setFormError("Password must be at least 8 characters long.");
      return;
    }
    if (!formState.role_codes.length) {
      setFormError("Select at least one role.");
      return;
    }

    setFormError(null);
    setIsSubmitting(true);

    try {
      await createUser({
        employee_code,
        email,
        password,
        plant_id: formState.plant_id || null,
        department_id: formState.department_id || null,
        role_codes: formState.role_codes,
      });
      await loadUsers();
      setShowCreateForm(false);
      resetForm();
    } catch (caught) {
      setFormError(messageForError(caught));
    } finally {
      setIsSubmitting(false);
    }
  };

  const saveEditUser = async () => {
    if (!selectedUserId) return;
    const employee_code = formState.employee_code.trim();
    const email = formState.email.trim();

    if (!employee_code || !email) {
      setFormError("Employee code and email are required.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFormError("Please enter a valid email address.");
      return;
    }

    setFormError(null);
    setIsSubmitting(true);

    try {
      const payload = {
        employee_code,
        email,
        plant_id: formState.plant_id || null,
        department_id: formState.department_id || null,
        is_active: formState.is_active,
        role_codes: formState.role_codes,
      };
      await updateUser(selectedUserId, payload);
      await loadUsers();
      setSelectedUserId(null);
      resetForm();
    } catch (caught) {
      setFormError(messageForError(caught));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStatusToggle = async (entry: UserRecord, activate: boolean) => {
    const action = activate ? "activate" : "deactivate";
    const confirmed = window.confirm(`Are you sure you want to ${action} ${entry.employee_code}?`);
    if (!confirmed) return;

    try {
      setIsSubmitting(true);
      await toggleUserStatus(entry.id, activate);
      await loadUsers();
    } catch (caught) {
      setError(messageForError(caught));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRoleAssignment = async (entry: UserRecord) => {
    const nextRoles = entry.roles?.map((role) => role.code) ?? [];
    const selected = window.prompt(
      `Assign roles for ${entry.employee_code}\nUse a comma-separated list (for example: SUPER_ADMIN,VIEWER)`,
      nextRoles.join(", "),
    );

    if (selected === null) return;
    const sanitized = selected
      .split(",")
      .map((role) => role.trim())
      .filter(Boolean);

    try {
      setIsSubmitting(true);
      await assignUserRoles(entry.id, sanitized);
      await loadUsers();
    } catch (caught) {
      setError(messageForError(caught));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePlantAssign = async (entry: UserRecord, nextPlantId: string) => {
    try {
      setIsSubmitting(true);
      await assignUserPlant(entry.id, nextPlantId || null);
      await loadUsers();
    } catch (caught) {
      setError(messageForError(caught));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDepartmentAssign = async (entry: UserRecord, nextDepartmentId: string) => {
    try {
      setIsSubmitting(true);
      await assignUserDepartment(entry.id, nextDepartmentId || null);
      await loadUsers();
    } catch (caught) {
      setError(messageForError(caught));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!canManageUsers) {
    return (
      <div className="panel panel--error auth-denied">
        <h2>Access denied</h2>
        <p>You do not have permission to manage users.</p>
      </div>
    );
  }

  const formTitle = selectedUserId ? "Edit user" : "Add user";

  return (
    <section className="user-page">
      <div className="dash-header user-header">
        <div>
          <p className="dash-header__eyebrow">Administration</p>
          <h1 className="dash-header__title">User Management</h1>
        </div>
        <div className="header-actions">
          <button type="button" className="btn btn--primary" onClick={openCreateForm}>
            Add User
          </button>
          <button type="button" className="btn btn--ghost" onClick={logout}>
            Sign out
          </button>
        </div>
      </div>

      {error ? <div className="alert alert--error">{error}</div> : null}

      {showCreateForm || selectedUserId ? (
        <div className="panel user-form-panel">
          <div className="panel__head">
            <h2>{formTitle}</h2>
            <p className="panel__desc">Create or update user access, assignments, and roles.</p>
          </div>

          {formError ? <div className="alert alert--error">{formError}</div> : null}

          <div className="user-form-grid">
            <label className="field">
              <span className="field__label">Employee code</span>
              <input
                value={formState.employee_code}
                onChange={(event) => handleFormChange("employee_code", event.target.value)}
              />
            </label>

            <label className="field">
              <span className="field__label">Email</span>
              <input
                type="email"
                value={formState.email}
                onChange={(event) => handleFormChange("email", event.target.value)}
              />
            </label>

            {!selectedUserId ? (
              <label className="field">
                <span className="field__label">Password</span>
                <input
                  type="password"
                  value={formState.password}
                  onChange={(event) => handleFormChange("password", event.target.value)}
                  placeholder="At least 8 characters"
                />
              </label>
            ) : null}

            <label className="field">
              <span className="field__label">Plant</span>
              <select
                value={formState.plant_id}
                onChange={(event) => handleFormChange("plant_id", event.target.value)}
              >
                <option value="">Unassigned</option>
                {plants.map((plant) => (
                  <option key={plant.id} value={plant.id}>
                    {plant.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="field__label">Department</span>
              <select
                value={formState.department_id}
                onChange={(event) => handleFormChange("department_id", event.target.value)}
              >
                <option value="">Unassigned</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
            </label>

            {selectedUserId ? (
              <label className="field">
                <span className="field__label">Active</span>
                <select
                  value={String(formState.is_active)}
                  onChange={(event) => handleFormChange("is_active", event.target.value === "true")}
                >
                  <option value="true">Active</option>
                  <option value="false">Inactive</option>
                </select>
              </label>
            ) : null}
          </div>

          <div className="role-checkboxes">
            <span className="field__label">Role(s)</span>
            <div className="role-grid">
              {roleOptions.map((roleCode) => (
                <label key={roleCode} className="checkbox-pill">
                  <input
                    type="checkbox"
                    checked={formState.role_codes.includes(roleCode)}
                    onChange={() => handleRoleToggle(roleCode)}
                  />
                  <span>{roleCode}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="form-actions">
            <button
              type="button"
              className="btn btn--primary"
              disabled={isSubmitting}
              onClick={selectedUserId ? saveEditUser : saveCreateUser}
            >
              {isSubmitting ? "Saving..." : selectedUserId ? "Save changes" : "Create user"}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setShowCreateForm(false);
                setSelectedUserId(null);
                resetForm();
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <div className="panel user-table-panel">
        <div className="panel__head user-toolbar">
          <div>
            <h2>User list</h2>
            <p className="panel__desc">{users.length} total users</p>
          </div>
          <label className="field field--search">
            <span className="field__label">Search</span>
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Employee, email, role, plant..."
            />
          </label>
        </div>

        {isLoading ? (
          <div className="empty-state">Loading users…</div>
        ) : filteredUsers.length === 0 ? (
          <div className="empty-state">No users match the current filter.</div>
        ) : (
          <div className="table-wrap">
            <table className="user-table">
              <thead>
                <tr>
                  <th>Employee Code</th>
                  <th>Email</th>
                  <th>Role(s)</th>
                  <th>Plant</th>
                  <th>Department</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((entry) => {
                  const plantName = entry.plant_id ? plantLookup.get(entry.plant_id)?.name ?? "—" : "—";
                  const departmentName = entry.department_id ? departmentLookup.get(entry.department_id)?.name ?? "—" : "—";
                  const rolesText = (entry.roles ?? []).map((role) => role.code).join(", ") || "—";

                  return (
                    <tr key={entry.id}>
                      <td>{entry.employee_code}</td>
                      <td>{entry.email}</td>
                      <td>{rolesText}</td>
                      <td>{plantName}</td>
                      <td>{departmentName}</td>
                      <td>
                        <span className={entry.is_active ? "status-badge status-badge--active" : "status-badge status-badge--inactive"}>
                          {entry.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td>{prettyDate(entry.created_at ?? undefined)}</td>
                      <td>{prettyDate(entry.updated_at ?? undefined)}</td>
                      <td>
                        <div className="action-stack">
                          <button type="button" className="btn btn--small" onClick={() => openEditForm(entry)}>
                            Edit
                          </button>
                          <button
                            type="button"
                            className="btn btn--small"
                            onClick={() => handleStatusToggle(entry, !entry.is_active)}
                          >
                            {entry.is_active ? "Deactivate" : "Activate"}
                          </button>
                          <button type="button" className="btn btn--small" onClick={() => handleRoleAssignment(entry)}>
                            Roles
                          </button>
                          <select
                            className="inline-select"
                            value={entry.plant_id ?? ""}
                            onChange={(event) => void handlePlantAssign(entry, event.target.value)}
                            aria-label={`Plant for ${entry.employee_code}`}
                          >
                            <option value="">Unassigned</option>
                            {plants.map((plant) => (
                              <option key={plant.id} value={plant.id}>
                                {plant.name}
                              </option>
                            ))}
                          </select>
                          <select
                            className="inline-select"
                            value={entry.department_id ?? ""}
                            onChange={(event) => void handleDepartmentAssign(entry, event.target.value)}
                            aria-label={`Department for ${entry.employee_code}`}
                          >
                            <option value="">Unassigned</option>
                            {departments.map((department) => (
                              <option key={department.id} value={department.id}>
                                {department.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
