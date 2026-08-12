export type RoleCode = "SUPER_ADMIN" | "MANAGEMENT" | "PLANT_HEAD" | "DEPT_HEAD" | "SUPERVISOR" | "OPERATOR" | "ENGINEER" | "VIEWER";

export type UserRoleSummary = {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
};

export type UserRecord = {
  id: string;
  employee_code: string;
  email: string;
  plant_id: string | null;
  department_id: string | null;
  is_active: boolean;
  roles: UserRoleSummary[];
  created_at?: string | null;
  updated_at?: string | null;
};

export type UserListResponse = {
  items: UserRecord[];
  count: number;
};

export type UserDraft = {
  employee_code: string;
  email: string;
  password: string;
  plant_id: string;
  department_id: string;
  role_codes: string[];
};
