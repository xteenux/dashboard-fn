"use client";

import { useTheme } from "./ThemeProvider";

export function ThemeToggle() {
  const { toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      className="w-9 h-9 rounded-lg bg-card border border-border flex items-center justify-center hover:bg-accent transition-colors"
      aria-label="Ubah tema"
      title="Ubah tema terang/gelap"
    >
      <svg data-theme-icon="sun" className="w-5 h-5 text-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1.5M12 19.5V21M4.2 4.2l1.1 1.1M18.7 18.7l1.1 1.1M3 12h1.5M19.5 12H21M4.2 19.8l1.1-1.1M18.7 5.3l1.1-1.1" />
      </svg>
      <svg data-theme-icon="moon" className="w-5 h-5 text-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.8A9 9 0 1111.2 3 7 7 0 0021 12.8z" />
      </svg>
    </button>
  );
}