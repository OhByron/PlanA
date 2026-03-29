import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { api, getToken, setToken, clearToken } from '../lib/api-client';
import { toMe, type MeResponse } from '../lib/api-transforms';

interface AuthState {
  user: MeResponse | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (token: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<MeResponse | null>(null);
  const [token, setTokenState] = useState<string | null>(getToken);
  const [isLoading, setIsLoading] = useState(!!getToken());

  const fetchUser = useCallback(async () => {
    try {
      const raw = await api.get('/me');
      setUser(toMe(raw));
    } catch {
      clearToken();
      setTokenState(null);
      setUser(null);
    }
  }, []);

  // On mount: validate existing token
  useEffect(() => {
    if (token) {
      fetchUser().finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const login = useCallback(async (newToken: string) => {
    setToken(newToken);
    setTokenState(newToken);
    const raw = await api.get('/me');
    setUser(toMe(raw));
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.delete('/auth/logout');
    } catch {
      // Logout API failure is non-fatal
    }
    clearToken();
    setTokenState(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isAuthenticated: !!user,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
