"use client";

import { useMemo } from "react";
import { useLanguage } from "@/app/lib/i18n";
import type { Tx } from "@/app/components/DashboardClient";
import { formatIDR } from "@/app/lib/utils";
import { resolvePlanConfig, type PlanConfig } from "@/app/lib/plan-config";

/**
 * AI Insights — deterministik, dari ledger (bukan LLM). Adaptasi fluxo insights.
 * Severity: positive(emerald) / warning(amber) / critical(red) / info(cyan).
 * Tidak ada budgets di dashboard-fn → "budget blown" diganti "kategori melonjak vs periode lalu".
 */

export interface InsightCardData {
  id: string;
  kind: "positive" | "warning" | "critical" | "info";
  title: string;
  detail: string;
  metric?: string;
  action?: string;
}

export interface InsightCardsProps {
  filtered: Tx[];
  kpi: { income: number; expense: number; net: number; count: number };
  monthlySeries: { month: string; income: number; expense: number; net: number }[];
  prevCatExpense: Map<string, number>; // kategori -> total expense window setara sebelumnya
  serverConfig?: Partial<PlanConfig> | null;
}

function money(v: number): string {
  return formatIDR(Math.round(v));
}

export function InsightCards({ filtered, kpi, monthlySeries, prevCatExpense, serverConfig }: InsightCardsProps) {
  const { lang } = useLanguage();
  const c = resolvePlanConfig(serverConfig);

  const insights = useMemo(
    () => buildInsights({ filtered, kpi, monthlySeries, prevCatExpense }, lang, c),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtered, kpi, monthlySeries, prevCatExpense, lang, serverConfig],
  );

  if (!insights.length) return null;

  return (
    <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div className="mb-4 flex items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">{lang === "en" ? "AI Insights" : "Wawasan AI"}</h2>
          <p className="text-xs text-muted-foreground">
            {lang === "en"
              ? `Generated from your live ledger · ${insights.length} finding${insights.length === 1 ? "" : "s"}`
              : `Dihitung dari ledger Anda · ${insights.length} temuan`}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {insights.map((c) => (
          <InsightCard key={c.id} c={c} />
        ))}
      </div>
    </section>
  );
}

const KIND_STYLES: Record<InsightCardData["kind"], { border: string; badge: string; icon: string }> = {
  positive: { border: "rgba(16,185,129,0.35)", badge: "rgba(16,185,129,0.12)", icon: "#10b981" },
  warning: { border: "rgba(217,119,6,0.35)", badge: "rgba(217,119,6,0.12)", icon: "#d97706" },
  critical: { border: "rgba(220,38,38,0.35)", badge: "rgba(220,38,38,0.12)", icon: "#dc2626" },
  info: { border: "rgba(6,182,212,0.35)", badge: "rgba(6,182,212,0.12)", icon: "#06b6d4" },
};

function InsightCard({ c }: { c: InsightCardData }) {
  const { lang } = useLanguage();
  const s = KIND_STYLES[c.kind];
  return (
    <div className="rounded-xl border p-3.5" style={{ borderColor: s.border }}>
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full" style={{ background: s.badge }}>
          <SeverityIcon kind={c.kind} color={s.icon} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <p className="text-sm font-medium">{c.title}</p>
            {c.metric && (
              <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide" style={{ background: s.badge }}>
                {c.metric}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{c.detail}</p>
          {c.action && (
            <p className="mt-1.5 text-xs font-medium" style={{ color: "#10b981" }}>
              {lang === "en" ? "→ " : "→ "}{c.action}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function SeverityIcon({ kind, color }: { kind: InsightCardData["kind"]; color: string }) {
  if (kind === "critical") {
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round">
        <path d="M5 5l14 14M19 5L5 19" />
      </svg>
    );
  }
  if (kind === "warning") {
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round">
        <path d="M12 5v9" />
        <circle cx="12" cy="18" r="1" fill={color} stroke="none" />
      </svg>
    );
  }
  if (kind === "info") {
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5" />
        <circle cx="12" cy="8" r="1" fill={color} stroke="none" />
      </svg>
    );
  }
  // positive
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12l5 5L20 6" />
    </svg>
  );
}

function buildInsights(
  { filtered, kpi, monthlySeries, prevCatExpense }: Omit<InsightCardsProps, "prevCatExpense" | "serverConfig"> & { prevCatExpense: Map<string, number> },
  lang: string,
  c: PlanConfig,
): InsightCardData[] {
  const e = lang === "en";
  const t = (id: string, en: string) => (e ? en : id);
  const out: InsightCardData[] = [];

  if (!filtered.length) {
    out.push({
      id: "empty",
      kind: "info",
      title: t("Belum ada data untuk periode ini", "No data for this period yet"),
      detail: t(
        "Tidak ada transaksi pada rentang filter ini. Ubah rentang tanggal atau tambah transaksi untuk melihat wawasan.",
        "No transactions in this filter range. Change the date range or add transactions to see insights.",
      ),
    });
    return out;
  }

  const expenseTx = filtered.filter((x) => x.type === "Expense");
  const income = kpi.income;
  const expense = kpi.expense;

  // 1) Savings rate
  if (income > 0) {
    const sr = (income - expense) / income; // 0..1
    const pct = (sr * 100).toFixed(0);
    if (sr >= c.healthySavingsRate) {
      out.push({
        id: "savings-good",
        kind: "positive",
        title: t(`Kamu menabung ${pct}% dari pemasukan`, `You're saving ${pct}% of income`),
        detail: t(
          `Bersih ${money(kpi.net)} dari ${money(income)} diperoleh. Konsisten menabung 20%+ adalah prediktor terkuat kemajuan finansial.`,
          `Net ${money(kpi.net)} kept from ${money(income)} earned. Keeping 20%+ consistently is the strongest predictor of financial progress.`,
        ),
        metric: t(`${pct}% ditabung`, `${pct}% saved`),
        action: t("Pertimbangkan auto-debit investasi untuk surplus.", "Consider an investment auto-debit for the surplus."),
      });
    } else if (sr >= 0) {
      out.push({
        id: "savings-thin",
        kind: "warning",
        title: t(`Tingkat nabung hanya ${pct}%`, `Savings rate is only ${pct}%`),
        detail: t(
          `Keluar ${money(expense)} vs masuk ${money(income)} — sisa bersih ${money(kpi.net)} (hampir habis). Memangkas pengeluaran akan mendongkrak buffer.`,
          `Outflow ${money(expense)} vs income ${money(income)} — net ${money(kpi.net)} left, nearly zero. Trimming spending lifts your buffer.`,
        ),
        metric: t(`${pct}% ditabung`, `${pct}% saved`),
        action: t("Batas dua kategori diskresioner terbesar sisa periode ini.", "Cap your two largest discretionary categories."),
      });
    } else {
      out.push({
        id: "savings-negative",
        kind: "critical",
        title: t("Pengeluaran melebihi pemasukan", "You spent more than you earned"),
        detail: t(
          `Keluar ${money(expense)} vs masuk ${money(income)} — selisih ${money(Math.abs(kpi.net))}.`,
          `Outflow ${money(expense)} vs income ${money(income)} — a ${money(Math.abs(kpi.net))} gap.`,
        ),
        metric: money(Math.abs(kpi.net)),
        action: t("Bekukan satu kategori diskresioner dan tinjau langganan hari ini.", "Freeze one discretionary category and review subscriptions."),
      });
    }
  }

  // 2) Top category
  const catMap = new Map<string, { total: number; count: number }>();
  for (const x of expenseTx) {
    const k = x.categoryName || "Other";
    const cur = catMap.get(k) || { total: 0, count: 0 };
    cur.total += x.amount;
    cur.count += 1;
    catMap.set(k, cur);
  }
  const top = [...catMap.entries()].sort((a, b) => b[1].total - a[1].total)[0];
  if (top && expense > 0) {
    const [name, v] = top;
    const share = (v.total / expense) * 100;
    out.push({
      id: "top-category",
      kind: share > (c.dominantCategoryShare * 100 + 5) ? "warning" : "info",
      title: t(`${name} memimpin pengeluaran`, `${name} leads spending`),
      detail: t(
        `${money(v.total)} dari ${v.count} transaksi — ${share.toFixed(0)}% dari total belanja. Rata-rata per transaksi ${money(v.total / v.count)}.`,
        `${money(v.total)} across ${v.count} transaction${v.count === 1 ? "" : "s"} — ${share.toFixed(0)}% of everything spent. Average ticket ${money(v.total / v.count)}.`,
      ),
      metric: t(`${share.toFixed(0)}% belanja`, `${share.toFixed(0)}% of spend`),
      action:
        share > (c.dominantCategoryShare * 100)
          ? t(`Atur anggaran untuk ${name} agar di bawah 30%.`, `Set a budget for ${name} to keep it under 30%.`)
          : t("Proporsi ini masih wajar untuk campuranmu.", "This looks proportionate for your mix."),
    });
  }

  // 3) MoM expense move
  if (monthlySeries.length >= 2) {
    const a = monthlySeries[monthlySeries.length - 2];
    const b = monthlySeries[monthlySeries.length - 1];
    if (a.expense > 0) {
      const delta = ((b.expense - a.expense) / a.expense) * 100;
      if (Math.abs(delta) >= 8) {
        const up = delta > 0;
        out.push({
          id: "mom-expense",
          kind: up ? "warning" : "positive",
          title: up
            ? t(`Belanja naik ${delta.toFixed(0)}% vs bulan lalu`, `Spending up ${delta.toFixed(0)}% vs last month`)
            : t(`Belanja turun ${Math.abs(delta).toFixed(0)}% vs bulan lalu`, `Spending down ${Math.abs(delta).toFixed(0)}% vs last month`),
          detail: up
            ? t(`${money(b.expense)} vs ${money(a.expense)} bulan lalu. Cek kategori mana yang tumbuh.`, `${money(b.expense)} vs ${money(a.expense)} last month. See which category grew.`)
            : t(`${money(b.expense)} vs ${money(a.expense)} bulan lalu. Pertahankan kebiasaan ini.`, `${money(b.expense)} vs ${money(a.expense)} last month. Lock in the habit.`),
          metric: `${delta > 0 ? "+" : ""}${delta.toFixed(0)}%`,
        });
      }
    }
  }

  // 4) Category movers vs prev window
  if (prevCatExpense.size) {
    const movers = [...catMap.entries()]
      .map(([name, v]) => ({ name, delta: v.total - (prevCatExpense.get(name) || 0), before: prevCatExpense.get(name) || 0 }))
      .filter((m) => Math.abs(m.delta) >= Math.max(c.moverMinAbs, expense * c.moverMinPctOfExpense))
      .sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta))
      .slice(0, 2);
    for (const mv of movers) {
      const up = mv.delta > 0;
      out.push({
        id: `mover-${mv.name}`,
        kind: up ? "warning" : "positive",
        title: up
          ? t(`${mv.name} naik ${money(Math.abs(mv.delta))}`, `${mv.name} grew ${money(Math.abs(mv.delta))}`)
          : t(`${mv.name} turun ${money(Math.abs(mv.delta))}`, `${mv.name} dropped ${money(Math.abs(mv.delta))}`),
        detail: t(
          `${money(mv.before)} periode lalu → ${money(mv.before + mv.delta)} sekarang. ${up ? "Ini kebocoran terbesarmu." : "Ini sumber perbaikanmu."}`,
          `${money(mv.before)} previously → ${money(mv.before + mv.delta)} now. ${up ? "This is your biggest leak." : "This is where the improvement came from."}`,
        ),
        metric: `${up ? "+" : "-"}${money(Math.abs(mv.delta))}`,
      });
    }
  }

  // 5) Largest single expense
  const biggest = [...expenseTx].sort((x, y) => y.amount - x.amount)[0];
  if (biggest && expense > 0) {
    out.push({
      id: "biggest-tx",
      kind: "info",
      title: t(`Pengeluaran terbesar: ${money(biggest.amount)}`, `Largest expense: ${money(biggest.amount)}`),
      detail: t(
        `${biggest.note ? `"${biggest.note}" di ` : ""}${biggest.categoryName || "Other"} — ${((biggest.amount / expense) * 100).toFixed(0)}% dari total belanja.`,
        `${biggest.note ? `"${biggest.note}" in ` : ""}${biggest.categoryName || "Other"} — ${((biggest.amount / expense) * 100).toFixed(0)}% of total spend.`,
      ),
      metric: money(biggest.amount),
    });
  }

  // 6) No income
  if (income === 0 && expense > 0) {
    out.push({
      id: "no-income",
      kind: "warning",
      title: t("Tidak ada pemasukan tercatat", "No income logged"),
      detail: t(
        "Tanpa pemasukan, mesin tingkat nabung dan cek keterjangkauan tidak bisa memberi saran akurat.",
        "Without income, the savings-rate engine and affordability checks can't advise accurately.",
      ),
    });
  }

  // 7) Subscription concentration
  const subs = expenseTx.filter((x) => (x.subcategory || "").toLowerCase().includes("subscription"));
  if (subs.length) {
    const total = subs.reduce((s, x) => s + x.amount, 0);
    out.push({
      id: "subs",
      kind: income > 0 && total > income * 0.05 ? "warning" : "info",
      title: t(`Langganan menghabiskan ${money(total)}/periode`, `Subscriptions cost ${money(total)}/period`),
      detail: t(
        `${subs.length} transaksi langganan aktif. Audit layanan yang sudah 30 hari tidak dibuka.`,
        `${subs.length} active subscription charge${subs.length === 1 ? "" : "s"}. Audit services unused for 30 days.`,
      ),
      metric: money(total),
    });
  }

  return out;
}