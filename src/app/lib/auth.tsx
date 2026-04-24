import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { getCurrentUser, loginUser, logoutUser, signUpUser } from './api';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  authError: string | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  clearAuthError: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const TOKEN_STORAGE_KEY = 'medextract-auth-token';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_STORAGE_KEY));
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function hydrateUser() {
      if (!token) {
        if (isMounted) {
          setIsLoading(false);
        }
        return;
      }

      try {
        const currentUser = await getCurrentUser(token);
        if (isMounted) {
          setUser(currentUser);
        }
      } catch {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        if (isMounted) {
          setToken(null);
          setUser(null);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    hydrateUser();
    return () => {
      isMounted = false;
    };
  }, [token]);

  const login = async (email: string, password: string) => {
    setAuthError(null);
    const response = await loginUser(email, password);
    localStorage.setItem(TOKEN_STORAGE_KEY, response.token);
    setToken(response.token);
    setUser(response.user);
  };

  const signup = async (name: string, email: string, password: string) => {
    setAuthError(null);
    const response = await signUpUser(name, email, password);
    localStorage.setItem(TOKEN_STORAGE_KEY, response.token);
    setToken(response.token);
    setUser(response.user);
  };

  const logout = async () => {
    if (token) {
      try {
        await logoutUser(token);
      } catch {
        // Continue local logout even if the backend session is already gone.
      }
    }
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken(null);
    setUser(null);
    setAuthError(null);
  };

  const value = useMemo(
    () => ({
      user,
      token,
      isLoading,
      authError,
      login,
      signup,
      logout,
      clearAuthError: () => setAuthError(null),
    }),
    [user, token, isLoading, authError]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
