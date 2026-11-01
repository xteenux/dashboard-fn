"use client";

import { useMemo } from "react";
import { useLanguage } from "@/app/lib/i18n";
import { formatIDR, cn } from "@/app/lib/utils";
import type { Tx } from "@/app/components/DashboardClient";
import { computeHealth, healthLabel, healthColor, ScoreRing } from "@/app/lib/health";

/**
 * Grid overview ala base Fluxo:
 * - Row 1: Income / Spending / Net Flow (+delta vs window setara sebelumnya)
 * - Row 2: Financial health (ring + stats), Burn rate (per-hari + proyeksi + bar elapsed), Top categories (share + amount)
 * Semua angka dihitung dari filtered (DB), bukan hardcoded.
 */

export interface OverviewCardsProps {
  filtered: Tx[];
  kpi: { income: number; expense: number; net: number; count: number };
  prevExpense: number | null; // total expense window setara sebelumnya (null = tanpa filter tanggal)
  prevIncome: number | null;
  prevNet: number | null;
  balances?: { total: number; assets: number } | null;
  dataRange: { min: string; max: string }; // batas data (YYYY-MM-DD) untuk elapsed %
}

function deltaPct(cur: number, prev: number | null): number | null {
  if (prev == null || prev === 0) return null;
  return ((cur - prev) / prev) * 100;
}

export function OverviewCards({
  filtered, kpi, prevExpense, prevIncome, prevNet, balances, dataRange,
}: OverviewCardsProps) {
  const { lang } = useLanguage();
  const en = lang === "en";

  // Top share kategori expense (untuk health)
  const topShare = useMemo(() => {
    const exp = filtered.filter((x) => x.type === "Expense");
    if (!exp.length) return null;
    const map = new Map<string, number>();
    let total = 0;
    for (const e of exp) {
      const k = e.categoryName || "Other";
      map.set(k, (map.get(k) || 0) + e.amount);
      total += e.amount;
    }
    if (total <= 0) return null;
    return (Math.max(...map.values()) / total) * 100;
  }, [filtered]);

  const health = useMemo(
    () => computeHealth({ income: kpi.income, expense: kpi.expense, net: kpi.net, topShare, prevExpense, balances }),
    [kpi, topShare, prevExpense, balances],
  );

  // Burn rate — berbasis rentang filter aktif (default: keseluruhan data)
  const burn = useMemo(() => {
    const from = dataRange.min;
    const to = dataRange.max;
    const days = Math.max(1, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1);
    const perDay = kpi.expense / days;
    const elapsedPct = 100; // window filter = elapsed penuh
    // Hari belanja terbesar dalam window
    const byDay = new Map<string, number>();
    for (const t of filtered) {
      if (t.type !== "Expense") continue;
      const d = t.date.slice(0, 10);
      byDay.set(d, (byDay.get(d) || 0) + t.amount);
    }
    let topDay: { d: string; v: number } | null = null;
    for (const [d, v] of byDay) if (!topDay || v > topDay.v) topDay = { d, v };
    return { days, perDay, elapsedPct, topDay };
  }, [filtered, kpi.expense, dataRange]);

  // Top categories (max 4 baris)
  const topCats = useMemo(() => {
    const map = new Map<string, number>();
    let total = 0;
    for (const t of filtered) {
      if (t.type !== "Expense") continue;
      const name = t.categoryName || "Other";
      map.set(name, (map.get(name) || 0) + t.amount);
      total += t.amount;
    }
    return [...map.entries()]
      .map(([name, value]) => ({ name, value, share: total > 0 ? (value / total) * 100 : 0 }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 4);
  }, [filtered]);

  const dInc = deltaPct(kpi.income, prevIncome);
  const dExp = deltaPct(kpi.expense, prevExpense);
  const dNet = deltaPct(kpi.net, prevNet);

  return (
    <div className="space-y-4">
      {/* Row 1: KPI trio */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiTile
          label={en ? "INCOME" : "PEMASUKAN"}
          value={formatIDR(kpi.income)}
          valueClass="text-emerald-500"
          delta={dInc}
          deltaGoodWhenUp
          en={en}
        />
        <KpiTile
          label={en ? "SPENDING" : "PENGELUARAN"}
          value={formatIDR(kpi.expense)}
          valueClass="text-rose-400"
          delta={dExp}
          deltaGoodWhenUp={false}
          en={en}
        />
        <KpiTile
          label={en ? "NET FLOW" : "ARUS BERSIH"}
          value={formatIDR(kpi.net)}
          valueClass={kpi.net >= 0 ? "text-sky-500" : "text-rose-400"}
          delta={dNet}
          deltaGoodWhenUp
          en={en}
        />
      </div>

      {/* Row 2: Health / Burn / Top cats */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Financial health */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold">{en ? "Financial health" : "Kesehatan finansial"}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {en ? `Score ${health}/100 · ` : `Skor ${health}/100 · `}{healthLabel(health, en)}
          </p>
          <div className="mt-4 flex items-center gap-4">
            <ScoreRing value={health} color={healthColor(health)} size={72} />
            <div className="space-y-1 text-xs">
              <p className="text-muted-foreground">
                {en ? "Savings rate" : "Tingkat nabung"}{" "}
                <span className="font-semibold text-foreground tabular-nums">
                  {kpi.income > 0 ? `${Math.round((kpi.net / kpi.income) * 100)}%` : "—"}
                </span>
              </p>
              <p className="text-muted-foreground">
                {en ? "Transactions" : "Transaksi"}{" "}
                <span className="font-semibold text-foreground tabular-nums">{kpi.count}</span>
              </p>
              <p className="text-muted-foreground">
                {en ? "Trend" : "Tren"}{" "}
                <span className={cn("font-semibold tabular-nums", (dExp ?? 0) <= 0 ? "text-emerald-500" : "text-amber-500")}>
                  {dExp == null ? "—" : `${dExp > 0 ? "+" : ""}${dExp.toFixed(0)}% MoM`}
                </span>
              </p>
            </div>
          </div>
        </div>

        {/* Burn rate */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold">{en ? "Burn rate" : "Laju belanja"}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {en ? `${burn.days} of ${burn.days} days elapsed` : `${burn.days} dari ${burn.days} hari berjalan`}
          </p>
          <p className="mt-3">
            <span className="text-2xl font-bold tabular-nums">{formatIDR(Math.round(burn.perDay))}</span>
            <span className="text-xs text-muted-foreground"> /{en ? "day" : "hari"}</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {en ? "Projected" : "Proyeksi"} {formatIDR(kpi.expense)} {en ? "by period end" : "hingga akhir periode"}
          </p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-sky-500" style={{ width: `${burn.elapsedPct}%` }} />
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            {en ? "Highest spend day: " : "Hari belanja terbesar: "}
            {burn.topDay
              ? <span className="font-medium text-foreground">{burn.topDay.d} ({formatIDR(burn.topDay.v)})</span>
              : "—"}
          </p>
        </div>

        {/* Top categories */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold">{en ? "Top categories" : "Kategori teratas"}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{en ? "Where the money went" : "Ke mana uang pergi"}</p>
          <div className="mt-3 space-y-2">
            {topCats.length === 0 && (
              <p className="text-xs text-muted-foreground">{en ? "No expense in range." : "Tidak ada pengeluaran di rentang ini."}</p>
            )}
            {topCats.map((c) => (
              <div key={c.name} className="flex items-center justify-between gap-2 text-xs">
                <span className="min-w-0 truncate">{c.name}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
                    {Math.round(c.share)}%
                  </span>
                  <span className="w-20 text-right font-medium tabular-nums">{formatIDR(c.value)}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiTile({
  label, value, valueClass, delta, deltaGoodWhenUp, en,
}: {
  label: string;
  value: string;
  valueClass: string;
  delta: number | null;
  deltaGoodWhenUp: boolean;
  en: boolean;
}) {
  const good = delta == null ? null : deltaGoodWhenUp ? delta > 0 : delta < 0;
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn("mt-1.5 text-2xl font-bold tabular-nums", valueClass)}>{value}</p>
      <p className="mt-1 text-xs">
        {delta == null || !isFinite(delta) ? (
          <span className="text-muted-foreground">{en ? "no prior window" : "tidak ada pembanding"}</span>
        ) : (
          <span className={cn("font-medium", good ? "text-emerald-500" : "text-rose-400")}>
            {delta > 0 ? "▲" : delta < 0 ? "▼" : "●"} {Math.abs(delta).toFixed(0)}% {en ? "vs last month" : "vs bulan lalu"}
          </span>
        )}
      </p>
    </div>
  );
}