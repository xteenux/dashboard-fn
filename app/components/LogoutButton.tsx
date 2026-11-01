"use client";

import { useLanguage } from "@/app/lib/i18n";

export function LogoutButton({ action }: { action: () => Promise<void> }) {
  const { t } = useLanguage();
  return (
    <form action={action}>
      <button
        type="submit"
        className="px-2.5 sm:px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-accent transition-colors"
      >
        {t("logout")}
      </button>
    </form>
  );
}