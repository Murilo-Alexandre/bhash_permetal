import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { fetchAppConfig, resolveLogoUrl } from "./appConfig";

type Theme = "light" | "dark";

type ThemeCtx = {
  theme: Theme;
  toggleTheme: () => void;

  primaryColor: string;
  primaryTextColor: string;
  setPrimaryColor: (color: string) => void;

  /** pronta para usar no <img src="..."> */
  resolvedLogoUrl: string;

  /** apenas para debug/controle interno (normalmente não precisa usar direto) */
  logoUrlRaw: string | null;

  /** útil no admin / telas que quiserem forçar re-sync */
  reloadAppConfig: () => Promise<void>;

  isConfigLoaded: boolean;
};

const ThemeContext = createContext<ThemeCtx | null>(null);

const THEME_KEY = "bhash_theme";
const COLOR_KEY = "bhash_primary";
const PRIMARY_TEXT_COLOR_KEY = "bhash_primary_text";

const DEFAULT_PRIMARY = "#001F3F";
const DEFAULT_PRIMARY_TEXT = "#F0F0F0";
const DEFAULT_LOGO = "/logo_bhash.png";

function getInitialTheme(): Theme {
  const saved = localStorage.getItem(THEME_KEY) as Theme | null;
  if (saved === "light" || saved === "dark") return saved;

  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
  return prefersDark ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => getInitialTheme());

  // cor pode ficar em localStorage (ok)
  const [primaryColor, setPrimaryColorState] = useState<string>(() => {
    return localStorage.getItem(COLOR_KEY) ?? DEFAULT_PRIMARY;
  });
  const [primaryTextColor, setPrimaryTextColorState] = useState<string>(() => {
    return localStorage.getItem(PRIMARY_TEXT_COLOR_KEY) ?? DEFAULT_PRIMARY_TEXT;
  });

  // ⚠️ logo NÃO fica no localStorage (pra não “travar” e impedir update do admin)
  const [logoUrlRaw, setLogoUrlRaw] = useState<string | null>(null);

  const [isConfigLoaded, setIsConfigLoaded] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.style.setProperty("--bhash-primary", primaryColor);
    document.documentElement.style.setProperty("--bhash-primary-fg", primaryTextColor);
    document.documentElement.style.setProperty("--btn-bg", primaryColor);
    document.documentElement.style.setProperty("--btn-fg", primaryTextColor);
    localStorage.setItem(COLOR_KEY, primaryColor);
    localStorage.setItem(PRIMARY_TEXT_COLOR_KEY, primaryTextColor);
  }, [primaryColor, primaryTextColor]);

  async function reloadAppConfig() {
    try {
      const cfg = await fetchAppConfig();

      if (cfg?.primaryColor) setPrimaryColorState(cfg.primaryColor);
      if (cfg?.primaryTextColor) setPrimaryTextColorState(cfg.primaryTextColor);

      // se backend manda null => volta pro default
      const resolved = resolveLogoUrl(cfg?.logoUrl);
      setLogoUrlRaw(resolved ?? DEFAULT_LOGO);
    } catch {
      // segue com o que já tem
      if (!logoUrlRaw) setLogoUrlRaw(DEFAULT_LOGO);
    } finally {
      setIsConfigLoaded(true);
    }
  }

  // carrega 1x no boot
  useEffect(() => {
    reloadAppConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resolvedLogoUrl = useMemo(() => {
    return (logoUrlRaw && logoUrlRaw.trim()) ? logoUrlRaw : DEFAULT_LOGO;
  }, [logoUrlRaw]);

  const value = useMemo<ThemeCtx>(
    () => ({
      theme,
      toggleTheme: () => setTheme((t) => (t === "dark" ? "light" : "dark")),
      primaryColor,
      primaryTextColor,
      setPrimaryColor: (color: string) => setPrimaryColorState(color),
      resolvedLogoUrl,
      logoUrlRaw,
      reloadAppConfig,
      isConfigLoaded,
    }),
    [theme, primaryColor, primaryTextColor, resolvedLogoUrl, logoUrlRaw, isConfigLoaded]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
