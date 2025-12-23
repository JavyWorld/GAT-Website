export interface AuthUser {
  id: string;
  name: string;
  firstName?: string;
  email?: string;
}

export function useAuth() {
  const user: AuthUser = { id: "demo", name: "Demo User", firstName: "Demo", email: "demo@example.com" };
  const logout = () => {};
  return { user, isAuthenticated: true, isAdmin: false, isLoading: false, logout };
}
