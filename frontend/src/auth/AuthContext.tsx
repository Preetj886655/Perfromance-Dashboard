import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  AUTH_EVENT_EXPIRED,
  AUTH_EVENT_FORBIDDEN,
  fetchCurrentUser,
  loginWithCredentials,
  logoutClient,
} from "./authApi";
import { AuthContext } from "./context";
import type { AuthContextValue, AuthUser, LoginCredentials } from "./authTypes";

function normalizeRoles(value: AuthUser | null | undefined): string[] {
  const roles = value?.roles ?? [];
  return roles.map((role) => String(role).trim()).filter(Boolean);
}

function normalizePermissions(value: AuthUser | null | undefined): string[] {
  const permissions = value?.permissions ?? [];
  return permissions.map((permission) => String(permission).trim()).filter(Boolean);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isForbidden, setIsForbidden] = useState(false);

  const hydrate = useCallback(async () => {
    try {
      const me = await fetchCurrentUser();
      setUser(me);
      setIsForbidden(false);
    } catch {
      setUser(null);
      setIsForbidden(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void hydrate();

    const handleExpired = () => {
      setUser(null);
      setIsForbidden(false);
      setIsLoading(false);
    };

    const handleForbidden = () => {
      setIsForbidden(true);
    };

    window.addEventListener(AUTH_EVENT_EXPIRED, handleExpired);
    window.addEventListener(AUTH_EVENT_FORBIDDEN, handleForbidden);

    return () => {
      window.removeEventListener(AUTH_EVENT_EXPIRED, handleExpired);
      window.removeEventListener(AUTH_EVENT_FORBIDDEN, handleForbidden);
    };
  }, [hydrate]);

  const login = useCallback(async (credentials: LoginCredentials) => {
    setIsLoading(true);
    setIsForbidden(false);
    try {
      const me = await loginWithCredentials(credentials);
      setUser(me);
    } catch (error) {
      setUser(null);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    logoutClient();
    setUser(null);
    setIsForbidden(false);
    setIsLoading(false);
  }, []);

  const clearForbidden = useCallback(() => {
    setIsForbidden(false);
  }, []);

  const hasRole = useCallback((wanted: string | string[]) => {
    const desired = Array.isArray(wanted) ? wanted : [wanted];
    const roles = normalizeRoles(user).map((role) => role.toUpperCase());
    return desired.some((value) => roles.includes(String(value).trim().toUpperCase()));
  }, [user]);

  const hasPermission = useCallback((module: string, action: string) => {
    const permissions = normalizePermissions(user).map((permission) => permission.toUpperCase());
    const normalized = `${String(module).trim().toUpperCase()}:${String(action).trim().toUpperCase()}`;
    return permissions.includes(normalized);
  }, [user]);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    isAuthenticated: Boolean(user && user.is_active),
    isLoading,
    isForbidden,
    login,
    logout,
    clearForbidden,
    hasRole,
    hasPermission,
  }), [user, isLoading, isForbidden, login, logout, clearForbidden, hasRole, hasPermission]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
