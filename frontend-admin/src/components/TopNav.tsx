import React from "react";
import { ThemeToggle } from "./ThemeToggle";

export function TopNav({
  title,
  subtitle,
  theme,
  onToggleTheme,
  logoSrc = "/logo_bhash.png",
  rightSlot,
}: {
  title: string;
  subtitle?: string;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  logoSrc?: string;
  rightSlot?: React.ReactNode;
}) {
  return (
    <div className="topnav-wrap">
      <div className="topnav-bar">
        <div className="topnav-brand">
          <img
            src={logoSrc}
            alt="BHASH"
            className="topnav-logo"
            onError={(e) => (((e.currentTarget as HTMLImageElement).style.display = "none"))}
          />
          <div className="topnav-text">
            <div className="topnav-title">{title}</div>
            {subtitle ? (
              <div className="topnav-subtitle">{subtitle}</div>
            ) : null}
          </div>
        </div>

        <div className="topnav-actions">
          {rightSlot ? rightSlot : null}
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        </div>
      </div>
    </div>
  );
}
