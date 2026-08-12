export type AuthUser = {
  id: string;
  employee_code: string;
  email: string;
  plant_id?: string | null;
  department_id?: string | null;
  is_active: boolean;
  roles?: string[];
  permissions?: string[];
};

export type AuthContextValue = {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isForbidden: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => void;
  clearForbidden: () => void;
  hasRole: (roles: string | string[]) => boolean;
  hasPermission: (module: string, action: string) => boolean;
};

export type LoginCredentials = {
  email_or_employee_code: string;
  password: string;
};

export type LoginResponse = {
  access_token: string;
  token_type: string;
  user: AuthUser;
};
