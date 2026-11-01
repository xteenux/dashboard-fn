"use client";

import { useLanguage } from "@/app/lib/i18n";

export function LanguageToggle() {
  const { lang, setLang, t } = useLanguage();
  return (
    <button
      onClick={() => setLang(lang === "id" ? "en" : "id")}
      className="w-9 h-9 rounded-lg bg-card border border-border flex items-center justify-center hover:bg-accent transition-colors text-xs font-semibold"
      aria-label={t("toggle.lang")}
      title={t("toggle.lang")}
    >
      {lang === "id" ? "EN" : "ID"}
    </button>
  );
}