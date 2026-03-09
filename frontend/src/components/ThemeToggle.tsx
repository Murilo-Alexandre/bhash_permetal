function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="2" />
      <path
        d="M12 2v2M12 20v2M4 12H2M22 12h-2M5.6 5.6 4.2 4.2M18.4 5.6l1.4-1.4M5.6 18.4 4.2 19.8M18.4 18.4l1.4 1.4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M21 13.5A8.5 8.5 0 0 1 10.5 3a7 7 0 1 0 10.5 10.5Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ThemeToggle({
  theme,
  onToggle,
}: {
  theme: "light" | "dark";
  onToggle: () => void;
}) {
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={onToggle}
      className={`toggle ${isDark ? "toggle--dark" : ""}`}
      aria-label="Alternar tema"
      title="Alternar tema"
    >
      <span className="toggle__icon toggle__icon--left" aria-hidden="true">
        <SunIcon />
      </span>

      <span className="toggle__icon toggle__icon--right" aria-hidden="true">
        <MoonIcon />
      </span>

      <span className="toggle__knob" />
    </button>
  );
}
