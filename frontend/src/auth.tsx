import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createApi } from "./api";

type LoginResponse = { access_token: string };
type SavedCredentials = { username: string; password: string };

type AuthContextType = {
  token: string | null;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  logoff: () => void;
  rememberLogin: boolean;
  setRememberLogin: (enabled: boolean) => void;
  saveRememberedCredentials: (username: string, password: string) => void;
  savedCredentials: SavedCredentials | null;
  autoLoginLoading: boolean;
  api: ReturnType<typeof createApi>;
};

const AuthContext = createContext<AuthContextType | null>(null);
const TOKEN_KEY = "bhash_token";
const REMEMBER_LOGIN_KEY = "bhash_remember_login";
const SAVED_CREDENTIALS_KEY = "bhash_saved_credentials";
const MANUAL_LOGOFF_KEY = "bhash_manual_logoff";

function readSavedCredentials(): SavedCredentials | null {
  try {
    const raw = localStorage.getItem(SAVED_CREDENTIALS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedCredentials>;
    if (typeof parsed?.username !== "string" || typeof parsed?.password !== "string") return null;
    return { username: parsed.username, password: parsed.password };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [rememberLogin, setRememberLoginState] = useState<boolean>(() => localStorage.getItem(REMEMBER_LOGIN_KEY) === "1");
  const [savedCredentials, setSavedCredentials] = useState<SavedCredentials | null>(readSavedCredentials);
  const [autoLoginLoading, setAutoLoginLoading] = useState(false);
  const attemptedAutoLoginKeyRef = useRef<string | null>(null);

  const api = useMemo(() => createApi(token ?? undefined), [token]);

  const persistSavedCredentials = useCallback((username: string, password: string) => {
    const next: SavedCredentials = { username, password };
    localStorage.setItem(SAVED_CREDENTIALS_KEY, JSON.stringify(next));
    setSavedCredentials(next);
  }, []);

  const clearSavedCredentials = useCallback(() => {
    localStorage.removeItem(SAVED_CREDENTIALS_KEY);
    setSavedCredentials(null);
  }, []);

  const setRememberLogin = useCallback(
    (enabled: boolean) => {
      setRememberLoginState(enabled);
      localStorage.setItem(REMEMBER_LOGIN_KEY, enabled ? "1" : "0");
      if (!enabled) {
        clearSavedCredentials();
        localStorage.removeItem(MANUAL_LOGOFF_KEY);
        attemptedAutoLoginKeyRef.current = null;
      }
    },
    [clearSavedCredentials]
  );

  const saveRememberedCredentials = useCallback(
    (username: string, password: string) => {
      persistSavedCredentials(username.trim(), password);
    },
    [persistSavedCredentials]
  );

  const performLogin = useCallback(
    async (username: string, password: string) => {
      const user = username.trim();
      const res = await createApi().post<LoginResponse>("/auth/login", { username: user, password });
      const t = res.data.access_token;
      localStorage.setItem(TOKEN_KEY, t);
      localStorage.removeItem(MANUAL_LOGOFF_KEY);
      if (rememberLogin) persistSavedCredentials(user, password);
      else clearSavedCredentials();
      setToken(t);
    },
    [clearSavedCredentials, persistSavedCredentials, rememberLogin]
  );

  const autoLoginKey =
    rememberLogin && savedCredentials
      ? `${savedCredentials.username}\u0000${savedCredentials.password}`
      : null;

  useEffect(() => {
    if (token || !savedCredentials || !autoLoginKey) {
      setAutoLoginLoading(false);
      return;
    }
    if (localStorage.getItem(MANUAL_LOGOFF_KEY) === "1") {
      setAutoLoginLoading(false);
      return;
    }
    if (attemptedAutoLoginKeyRef.current === autoLoginKey) return;

    attemptedAutoLoginKeyRef.current = autoLoginKey;
    let active = true;
    setAutoLoginLoading(true);

    (async () => {
      try {
        await performLogin(savedCredentials.username, savedCredentials.password);
      } catch {
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
      } finally {
        if (active) setAutoLoginLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [autoLoginKey, performLogin, savedCredentials, token]);

  const value = useMemo<AuthContextType>(
    () => ({
      token,
      isAuthenticated: !!token,
      api,
      login: async (username, password) => {
        try {
          await performLogin(username, password);
        } catch (e) {
          localStorage.removeItem(TOKEN_KEY);
          setToken(null);
          throw e;
        }
      },
      logout: () => {
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
      },
      logoff: () => {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.setItem(MANUAL_LOGOFF_KEY, "1");
        setToken(null);
      },
      rememberLogin,
      setRememberLogin,
      saveRememberedCredentials,
      savedCredentials,
      autoLoginLoading,
    }),
    [
      token,
      api,
      rememberLogin,
      setRememberLogin,
      saveRememberedCredentials,
      savedCredentials,
      autoLoginLoading,
      performLogin,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
