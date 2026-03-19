import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { fetchAppConfig, resolveLogoUrl } from "./appConfig";

type Theme = "light" | "dark";

type ThemeCtx = {
  theme: Theme;
  toggle: () => void;

  primaryColor: string;
  primaryTextColor: string;

  logoUrl: string; // resolvida e pronta
  logoUrlRaw: string | null;

  reloadAppConfig: () => Promise<void>;
  isConfigLoaded: boolean;
};

const ThemeContext = createContext<ThemeCtx | null>(null);

const THEME_KEY = "bhash_admin_theme";
const COLOR_KEY = "bhash_admin_primary";
const PRIMARY_TEXT_COLOR_KEY = "bhash_admin_primary_text";

const DEFAULT_PRIMARY = "#001F3F";
const DEFAULT_PRIMARY_TEXT = "#F0F0F0";
const DEFAULT_LOGO = "/logo_bhash.png";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem(THEME_KEY) as Theme | null;
    return saved ?? "dark";
  });

  const [primaryColor, setPrimaryColor] = useState<string>(() => {
    return localStorage.getItem(COLOR_KEY) ?? DEFAULT_PRIMARY;
  });
  const [primaryTextColor, setPrimaryTextColor] = useState<string>(() => {
    return localStorage.getItem(PRIMARY_TEXT_COLOR_KEY) ?? DEFAULT_PRIMARY_TEXT;
  });

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

      if (cfg?.primaryColor) setPrimaryColor(cfg.primaryColor);
      if (cfg?.primaryTextColor) setPrimaryTextColor(cfg.primaryTextColor);

      const resolved = resolveLogoUrl(cfg?.logoUrl);
      setLogoUrlRaw(resolved ?? DEFAULT_LOGO);
    } catch {
      if (!logoUrlRaw) setLogoUrlRaw(DEFAULT_LOGO);
    } finally {
      setIsConfigLoaded(true);
    }
  }

  useEffect(() => {
    reloadAppConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logoUrl = useMemo(() => {
    return (logoUrlRaw && logoUrlRaw.trim()) ? logoUrlRaw : DEFAULT_LOGO;
  }, [logoUrlRaw]);

  const value = useMemo(
    () => ({
      theme,
      toggle: () => setTheme((t) => (t === "dark" ? "light" : "dark")),
      primaryColor,
      primaryTextColor,
      logoUrl,
      logoUrlRaw,
      reloadAppConfig,
      isConfigLoaded,
    }),
    [theme, primaryColor, primaryTextColor, logoUrl, logoUrlRaw, isConfigLoaded]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
