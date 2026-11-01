"use client";

import { useMemo } from "react";
import { useLanguage } from "@/app/lib/i18n";
import type { Tx } from "@/app/components/DashboardClient";
import { formatIDR } from "@/app/lib/utils";
import { resolvePlanConfig, type PlanConfig } from "@/app/lib/plan-config";

/**
 * AI Action Plan — rekomendasi berperingkat, dihitung deterministik dari ledger.
 * Rasio & ambang configurable via serverConfig (lihat plan-config.ts + /api/plan-config).
 */

export interface ActionPlanProps {
  filtered: Tx[];
  kpi: { income: number; expense: number; net: number; count: number };
  serverConfig?: Partial<PlanConfig> | null;
}

interface Advice {
  title: string;
  detail: string;
  impact: number;
  category?: string;
}

function money(v: number): string {
  return formatIDR(Math.round(v));
}

export function ActionPlan({ filtered, kpi, serverConfig }: ActionPlanProps) {
  const { lang } = useLanguage();
  const c = resolvePlanConfig(serverConfig);
  const advice = useMemo(
    () => buildAdvice({ filtered, kpi }, lang, c),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtered, kpi, lang, serverConfig],
  );

  if (!advice.length) return null;

  const total = advice.reduce((a, b) => a + b.impact, 0);
  const max = advice[0]?.impact || 1;

  return (
    <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div className="mb-4 flex items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">{lang === "en" ? "AI Action Plan" : "Rencana Aksi AI"}</h2>
          <p className="text-xs text-muted-foreground">
            {lang === "en"
              ? `Ranked by realistic monthly impact · ${money(total)}/mo`
              : `Diurutkan dari dampak bulanan realistis · ${money(total)}/bln`}
          </p>
        </div>
      </div>

      <ol className="space-y-3">
        {advice.map((a, i) => (
          <li key={a.title} className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold text-emerald-500 bg-emerald-500/10">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-[13px] font-semibold">
                  {a.category ? `${a.category} ` : ""}
                  {a.title}
                </p>
                <span className="text-[11px] font-bold tabular-nums text-emerald-500">
                  +{money(a.impact)}/{lang === "en" ? "mo" : "bln"}
                </span>
              </div>
              <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">{a.detail}</p>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-border">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${(a.impact / max) * 100}%`, background: "#10b981" }}
                />
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function buildAdvice(
  { filtered, kpi }: Omit<ActionPlanProps, "serverConfig">,
  lang: string,
  c: PlanConfig,
): Advice[] {
  const e = lang === "en";
  const t = (id: string, en: string) => (e ? en : id);
  const expenseTx = filtered.filter((x) => x.type === "Expense");

  const cat = (name: string) => {
    const rows = expenseTx.filter((x) => (x.categoryName || "Other") === name);
    return { total: rows.reduce((s, x) => s + x.amount, 0), count: rows.length };
  };
  const bySubcat = (kw: string) => {
    const rows = expenseTx.filter((x) => (x.subcategory || "").toLowerCase().includes(kw));
    return { total: rows.reduce((s, x) => s + x.amount, 0), count: rows.length };
  };

  const out: Advice[] = [];

  // Food → masak lebih sering
  const food = cat("🍜 Food");
  if (food.total > c.minFoodSpend) {
    const cut = food.total * c.foodCutPct;
    out.push({
      title: t("Masak 2 kali lebih sering seminggu", "Cook 2 more meals a week"),
      detail: t(
        `🍜 Food ${money(food.total)} dari ${food.count} transaksi. Masak 2x lebih sering biasanya memangkas ~${Math.round(c.foodCutPct * 100)}% biaya makan.`,
        `🍜 Food is ${money(food.total)} over ${food.count} orders. Cooking twice more weekly typically cuts ~${Math.round(c.foodCutPct * 100)}%.`,
      ),
      impact: cut,
      category: "🍜 Food",
    });
  }

  // subscription → rotasi layanan
  const subs = bySubcat("subscription");
  if (subs.count >= c.minSubscriptionCount) {
    out.push({
      title: t("Putar ke 2 layanan streaming saja", "Rotate down to 2 streaming services"),
      detail: t(
        `Kamu bayar ${subs.count} langganan (${money(subs.total)}). Menggilir perpanjangan alih-alih menumpuk menghemat ~${Math.round(c.subscriptionCutPct * 100)}%.`,
        `You pay for ${subs.count} subscriptions (${money(subs.total)}). Staggering renewals instead of stacking saves ~${Math.round(c.subscriptionCutPct * 100)}%.`,
      ),
      impact: subs.total * c.subscriptionCutPct,
      category: "💸subscription",
    });
  }

  // Shop → 72 jam
  const shop = cat("🛒Shop");
  if (shop.total > c.minShopSpend) {
    out.push({
      title: t("Terapkan aturan 72 jam untuk belanja", "Apply a 72-hour rule to purchases"),
      detail: t(
        `Belanja ${money(shop.total)}. Tunggu 3 hari sebelum beli non-esensial menghilangkan ~${Math.round(c.shopCutPct * 100)}% pembelian impulsif.`,
        `Shopping is ${money(shop.total)}. Waiting 3 days before non-essentials removes ~${Math.round(c.shopCutPct * 100)}% of impulse buys.`,
      ),
      impact: shop.total * c.shopCutPct,
      category: "🛒Shop",
    });
  }

  // Transport → gabung perjalanan
  const transport = cat("🚖 Transport");
  if (transport.count >= c.minTransportTrips) {
    out.push({
      title: t("Gabungkan perjalanan", "Batch your rides"),
      detail: t(
        `${transport.count} perjalanan transportasi senilai ${money(transport.total)}. Menggabung jadi 2x/minggu hemat ~${Math.round(c.transportCutPct * 100)}%.`,
        `${transport.count} transport trips cost ${money(transport.total)}. Combining into 2 trips a week saves ~${Math.round(c.transportCutPct * 100)}%.`,
      ),
      impact: transport.total * c.transportCutPct,
      category: "🚖 Transport",
    });
  }

  // Auto-debit tabungan
  if (kpi.expense > 0) {
    const target = kpi.expense * c.autoDebitPct;
    out.push({
      title: t("Otomatiskan tabungan saat gajian", "Automate savings on payday"),
      detail: t(
        `Pindahkan ${money(target)} — ${Math.round(c.autoDebitPct * 100)}% belanja periode ini — ke akun terpisah tepat saat pemasukan masuk.`,
        `Move ${money(target)} — ${Math.round(c.autoDebitPct * 100)}% of spending — to a separate account the day income lands.`,
      ),
      impact: target,
    });
  }

  // Tingkatkan pemasukan (bila nabung di bawah ambang)
  const savingsRate = kpi.income > 0 ? (kpi.income - kpi.expense) / kpi.income : 0;
  if (kpi.income > 0 && savingsRate < c.incomeStreamThreshold) {
    const stream = Math.max(c.incomeStreamFloor, kpi.expense * 0.12);
    out.push({
      title: t(`Tambah satu sumber pemasukan ${money(stream)}`, `Raise income by one ${money(stream)} stream`),
      detail: t(
        "Penghematan ada batasnya; pemasukan tidak. Satu invoice freelance kecil per bulan menutup selisih tabungan lebih cepat dari pemangkasan anggaran mana pun.",
        "Spending cuts are capped; income isn't. One small freelance invoice per month closes your savings gap faster than any budget trim.",
      ),
      impact: stream,
    });
  }

  return out.sort((a, b) => b.impact - a.impact).slice(0, 5);
}