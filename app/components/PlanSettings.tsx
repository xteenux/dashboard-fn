"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/app/lib/i18n";
import { DEFAULT_PLAN_CONFIG, type PlanConfig } from "@/app/lib/plan-config";

/**
 * Panel pengaturan rasio AI Action Plan & Insights (owner-only).
 * URL field: percent fields disimpan sebagai 0..1 di config, ditampilkan sebagai %.
 */

const PERCENT_FIELDS: { key: keyof PlanConfig; id: string; en: string }[] = [
  { key: "foodCutPct", id: "Hemat masak (Food)", en: "Cooking cut (Food)" },
  { key: "shopCutPct", id: "Hemat aturan 72 jam (Shop)", en: "72-hour rule cut (Shop)" },
  { key: "transportCutPct", id: "Hemat gabung perjalanan", en: "Ride batching cut" },
  { key: "subscriptionCutPct", id: "Hemat rotasi langganan", en: "Subscription rotation cut" },
  { key: "autoDebitPct", id: "Auto-debit tabungan", en: "Payday auto-debit" },
  { key: "incomeStreamThreshold", id: "Ambang income stream (savings <)", en: "Income stream threshold (savings <)" },
];

const NUMBER_FIELDS: { key: keyof PlanConfig; id: string; en: string }[] = [
  { key: "minTransportTrips", id: "Min. trip transport", en: "Min. transport trips" },
  { key: "minSubscriptionCount", id: "Min. jumlah langganan", en: "Min. subscription count" },
  { key: "moverMinAbs", id: "Delta min. mover (Rp)", en: "Mover min. delta (Rp)" },
  { key: "healthySavingsRate", id: "Savings rate sehat (%, 0-100)", en: "Healthy savings rate (%, 0-100)" },
  { key: "dominantCategoryShare", id: "Share kategori dominan (%, 0-100)", en: "Dominant category share (%, 0-100)" },
];

export default function PlanSettings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { lang } = useLanguage();
  const [cfg, setCfg] = useState<PlanConfig>(DEFAULT_PLAN_CONFIG);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    fetch("/api/plan-config", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setCfg({ ...DEFAULT_PLAN_CONFIG, ...j }))
      .catch(() => setCfg(DEFAULT_PLAN_CONFIG));
  }, [open]);

  if (!open) return null;

  function setPercent(key: keyof PlanConfig, rawVal: string) {
    const v = Number(rawVal);
    if (Number.isNaN(v)) return;
    setCfg((c) => ({ ...c, [key]: Math.max(0, Math.min(100, v)) / 100 }));
    setDirty(true);
  }

  function setNumber(key: keyof PlanConfig, rawVal: string) {
    const v = Number(rawVal);
    if (Number.isNaN(v)) return;
    setCfg((c) => ({ ...c, [key]: v }));
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/plan-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cfg),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      setCfg({ ...DEFAULT_PLAN_CONFIG, ...j });
      setDirty(false);
      setMsg(lang === "en" ? "Saved — reload to apply." : "Tersimpan — muat ulang untuk menerapkan.");
    } catch (e) {
      setMsg(lang === "en" ? `Failed: ${String(e)}` : `Gagal: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  async function reset() {
    setCfg(DEFAULT_PLAN_CONFIG);
    setDirty(true);
  }

  const pct = (v: unknown) => Math.round(Number(v) * 100);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">
            {lang === "en" ? "AI Plan Settings" : "Pengaturan Rencana AI"}
          </h2>
          <button aria-label="close" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-3">
          {PERCENT_FIELDS.map(({ key, id, en }) => (
            <label key={key} className="flex items-center justify-between gap-3 text-xs">
              <span className="text-muted-foreground">{lang === "en" ? en : id}</span>
              <span className="flex items-center gap-1.5">
                <input
                  type="number" min={0} max={100} step={1}
                  value={pct(cfg[key])}
                  onChange={(e) => setPercent(key, e.target.value)}
                  className="w-16 rounded-md border border-border bg-background px-2 py-1 text-right tabular-nums"
                />
                <span className="w-6 text-muted-foreground">%</span>
              </span>
            </label>
          ))}

          <div className="border-t border-border pt-3" />

          {NUMBER_FIELDS.map(({ key, id, en }) => (
            <label key={key} className="flex items-center justify-between gap-3 text-xs">
              <span className="text-muted-foreground">{lang === "en" ? en : id}</span>
              <input
                type="number" step="any"
                value={Number(cfg[key])}
                onChange={(e) => setNumber(key, e.target.value)}
                className="w-28 rounded-md border border-border bg-background px-2 py-1 text-right tabular-nums"
              />
            </label>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            onClick={reset}
            className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent"
          >
            {lang === "en" ? "Reset defaults" : "Kembalikan default"}
          </button>
          <span className="flex items-center gap-2">
            {msg && <span className="text-[11px] text-muted-foreground">{msg}</span>}
            <button
              onClick={save}
              disabled={saving || !dirty}
              className="rounded-md border border-border bg-accent px-3 py-1.5 text-xs font-medium disabled:opacity-40"
            >
              {saving ? "…" : lang === "en" ? "Save" : "Simpan"}
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}