"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { format } from "date-fns";
import type { DashboardData } from "@/app/lib/data";
import type { BalanceSummary } from "@/app/lib/balances";
import { formatIDR, formatIDRShort, cn } from "@/app/lib/utils";
import { useLanguage } from "@/app/lib/i18n";
import TransactionModal from "@/app/components/TransactionModal";
import ImportModal from "@/app/components/ImportModal";
import EditTransactionModal from "@/app/components/EditTransactionModal";
import { DashboardHero } from "@/app/components/DashboardHero";
import { InsightCards } from "@/app/components/InsightCards";
import { ActionPlan } from "@/app/components/ActionPlan";
import { OverviewCards } from "@/app/components/OverviewCards";
import { NaturalLanguageEntry } from "@/app/components/NaturalLanguageEntry";
import { type PlanConfig } from "@/app/lib/plan-config";
import PlanSettings from "@/app/components/PlanSettings";

// Single neutral ramp for categorical share charts (one hue, ink based).
// Income and expense keep their semantic colour on the cash-flow line only.
const RAMP = ["#334155", "#475569", "#64748b", "#94a3b8", "#cbd5e1", "#e2e8f0"];
const INK = "#334155";
const LINE_INCOME = "#16a34a";
const LINE_EXPENSE = "#dc2626";

interface Props {
  data: DashboardData;
  balances: BalanceSummary;
  currentUser?: { id: string; role: string };
  planConfig?: PlanConfig;
}

export interface Tx {
  id: string;
  date: string;
  amount: number;
  type: string;
  categoryName: string | null;
  subcategory: string | null;
  note: string | null;
  accountName: string;
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color?: string }>;
  label?: string;
}

/** Range 30 hari terakhir (anchor = tanggal transaksi terbaru). Local-date math, bebas bug UTC. */
function lastNDays(txs: { date: string }[], days = 30): { from: string; to: string } {
  if (!txs.length) return { from: "", to: "" };
  const newest = txs[0].date.slice(0, 10);
  const [y, m, d] = newest.split("-").map(Number);
  const start = new Date(y, m - 1, d);
  start.setDate(start.getDate() - days);
  const f = (n: number) => String(n).padStart(2, "0");
  return {
    from: `${start.getFullYear()}-${f(start.getMonth() + 1)}-${f(start.getDate())}`,
    to: newest,
  };
}

function ChartTip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-sm shadow-lg">
      {label && <div className="font-semibold mb-1">{label}</div>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full"
            style={{ background: p.color || RAMP[i % RAMP.length] }}
          />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-medium">{formatIDR(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

export function DashboardClient({ data, balances, currentUser, planConfig }: Props) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const router = useRouter();
  const { t, lang } = useLanguage();
  const [from, setFrom] = useState(() => lastNDays(data.transactions).from);
  const [to, setTo] = useState(() => lastNDays(data.transactions).to);
  const [segment, setSegment] = useState("All");
  const [category, setCategory] = useState("All");
  const [account, setAccount] = useState("All");
  const [query, setQuery] = useState("");
  const [editTx, setEditTx] = useState<DashboardData["transactions"][number] | null>(null);
  const [toast, setToast] = useState<{ msg: string; kind: "success" | "error" } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const showToast = (msg: string, kind: "success" | "error" = "success") => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 3000);
  };

  const typeLabel = (v: string) =>
    v === "Income" ? t("type.income") : v === "Expense" ? t("type.expense") : v === "Transfer-Out" ? t("type.transfer") : v;

  const handleDelete = async (id: string) => {
    if (!confirm(t("tx.confirmDelete"))) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/transactions/${id}`, { method: "DELETE" });
      if (res.ok) {
        showToast(t("toast.deleted"));
        startTransition(() => router.refresh());
      } else {
        const d = await res.json().catch(() => ({}));
        showToast(d.error || t("toast.deleteFail"), "error");
      }
    } catch {
      showToast(t("toast.connError"), "error");
    }
    setDeletingId(null);
  };

  const minDate = data.transactions.length
    ? data.transactions[data.transactions.length - 1].date.slice(0, 10)
    : "";
  const maxDate = data.transactions.length
    ? data.transactions[0].date.slice(0, 10)
    : "";

  const presetRange = (days: number | null) => {
    if (days === null) { setFrom(""); setTo(""); return; }
    const end = new Date(maxDate);
    const start = new Date(end);
    start.setDate(start.getDate() - days);
    setFrom(start.toISOString().slice(0, 10));
    setTo(maxDate);
  };

  // Bulan filter: pilih bulan -> isi from = 1 awal bulan, to = hari terakhir bulan
  const [month, setMonth] = useState("");

  const availableMonths = useMemo(() => {
    const s = new Set<string>();
    for (const t of data.transactions) {
      const d = t.date.slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(d)) s.add(d.slice(0, 7));
    }
    return Array.from(s).sort().reverse();
  }, [data.transactions]);

  const applyMonth = (ym: string) => {
    setMonth(ym);
    if (!ym) { setFrom(""); setTo(""); return; }
    const [y, m] = ym.split("-").map(Number);
    const last = new Date(y, m, 0).getDate(); // day 0 bulan berikutnya = hari akhir bulan ini
    const mm = String(m).padStart(2, "0");
    const dd = String(last).padStart(2, "0");
    setFrom(`${y}-${mm}-01`);
    setTo(`${y}-${mm}-${dd}`);
  };

  const monthLabel = (ym: string) => {
    const [y, m] = ym.split("-").map(Number);
    const d = new Date(y, m - 1, 1);
    return d.toLocaleDateString(lang === "id" ? "id-ID" : "en-US", { month: "long", year: "numeric" });
  };

  const filtered = useMemo(() => {
    return data.transactions.filter((t) => {
      const d = t.date.slice(0, 10);
      if (from && d < from) return false;
      if (to && d > to) return false;
      if (segment !== "All" && t.type !== segment) return false;
      if (category !== "All" && (t.categoryName || "Other") !== category) return false;
      if (account !== "All" && t.accountName !== account && t.destAccountName !== account) return false;
      return true;
    });
  }, [data, from, to, segment, category, account]);

  // KPI
  const kpi = useMemo(() => {
    const inc = filtered.filter((t) => t.type === "Income").reduce((s, t) => s + t.amount, 0);
    const exp = filtered.filter((t) => t.type === "Expense").reduce((s, t) => s + t.amount, 0);
    const net = inc - exp;
    return { inc, exp, net, count: filtered.length };
  }, [filtered]);

  // Hero (Fluxo-style): KPI alias + prev expense window sepanjang from..to sebelumnya
  const heroKpi = useMemo(
    () => ({ income: kpi.inc, expense: kpi.exp, net: kpi.net, count: kpi.count }),
    [kpi],
  );
  const heroPrevExpense = useMemo(() => {
    if (!from || !to) return null;
    const fD = new Date(from);
    const tD = new Date(to);
    const span = tD.getTime() - fD.getTime();
    const pf = new Date(fD.getTime() - span - 86400000).toISOString().slice(0, 10);
    const pt = new Date(fD.getTime() - 86400000).toISOString().slice(0, 10);
    return data.transactions
      .filter((t) => t.type === "Expense" && t.date.slice(0, 10) >= pf && t.date.slice(0, 10) <= pt)
      .reduce((s, t) => s + t.amount, 0);
  }, [data, from, to]);

  // prev income & net (window setara sebelumnya) — untuk OverviewCards delta.
  const prevIncomeNet = useMemo(() => {
    if (!from || !to) return { income: null as number | null, net: null as number | null };
    const fD = new Date(from);
    const tD = new Date(to);
    const span = tD.getTime() - fD.getTime();
    const pf = new Date(fD.getTime() - span - 86400000).toISOString().slice(0, 10);
    const pt = new Date(fD.getTime() - 86400000).toISOString().slice(0, 10);
    let income = 0;
    let expense = 0;
    for (const t of data.transactions) {
      const d = t.date.slice(0, 10);
      if (d < pf || d > pt) continue;
      if (t.type === "Income") income += t.amount;
      else if (t.type === "Expense") expense += t.amount;
    }
    return { income, net: income - expense };
  }, [data, from, to]);

  // prev kategori expense (window setara sebelumnya) — untuk InsightCards movers.
  const prevCatExpense = useMemo(() => {
    const map = new Map<string, number>();
    if (!from || !to) {
      // Tanpa filter: sama dgn logic breakdown — 6 bulan lalu vs sekarang (perlu prev 6 bln).
      const now = new Date();
      const pf = new Date(now.getFullYear(), now.getMonth() - 11, 1).toISOString().slice(0, 10);
      const pt = new Date(now.getFullYear(), now.getMonth() - 6, 0, 23, 59, 59).toISOString().slice(0, 10);
      for (const t of data.transactions) {
        if (t.type !== "Expense") continue;
        const d = t.date.slice(0, 10);
        if (d < pf || d > pt) continue;
        const k = t.categoryName || "Other";
        map.set(k, (map.get(k) || 0) + t.amount);
      }
      return map;
    }
    const fD = new Date(from);
    const tD = new Date(to);
    const span = tD.getTime() - fD.getTime();
    const pf = new Date(fD.getTime() - span - 86400000).toISOString().slice(0, 10);
    const pt = new Date(fD.getTime() - 86400000).toISOString().slice(0, 10);
    for (const t of data.transactions) {
      if (t.type !== "Expense") continue;
      const d = t.date.slice(0, 10);
      if (d < pf || d > pt) continue;
      const k = t.categoryName || "Other";
      map.set(k, (map.get(k) || 0) + t.amount);
    }
    return map;
  }, [data, from, to]);

  // Monthly trend
  const monthlySeries = useMemo(() => {
    const map = new Map<string, { month: string; income: number; expense: number }>();
    for (const t of filtered) {
      if (t.type === "Transfer-Out") continue;
      const m = t.date.slice(0, 7);
      if (!map.has(m)) map.set(m, { month: m, income: 0, expense: 0 });
      const e = map.get(m)!;
      if (t.type === "Income") e.income += t.amount;
      else e.expense += t.amount;
    }
    return [...map.values()]
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((e) => ({
        ...e,
        net: e.income - e.expense,
        label: format(new Date(e.month + "-01"), "MMM yy"),
      }));
  }, [filtered]);

  const categoryDonut = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of filtered) {
      if (t.type !== "Expense") continue;
      const name = t.categoryName || "Other";
      map.set(name, (map.get(name) || 0) + t.amount);
    }
    const sorted = [...map.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
    if (sorted.length <= 6) return sorted;
    const top = sorted.slice(0, 5);
    const rest = sorted.slice(5).reduce((sum, item) => sum + item.value, 0);
    return [...top, { name: "Other", value: rest }];
  }, [filtered]);

  const subcategoryBar = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of filtered) {
      if (t.type === "Expense") {
        const name = t.subcategory || "Other";
        map.set(name, (map.get(name) || 0) + t.amount);
      }
    }
    return [...map.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [filtered]);

  // Top income sources by category (respects active filter)
  const incomeBar = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of filtered) {
      if (t.type === "Income") {
        const name = t.categoryName || "Other";
        map.set(name, (map.get(name) || 0) + t.amount);
      }
    }
    return [...map.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [filtered]);

  // Emoji kategori: gabung kolom `emoji` (Transfer simpan di sini) + prefix dari name (sebagian lain).
  // Ambil semua karakter non-huruf/angka di awal (termasuk skin-tone/ZWJ).
  const emojiOf = (name: string | null): string | null => {
    if (!name) return null;
    const m = name.match(/^([^\p{L}\p{N}]+)/u);
    return m ? m[1].trim() : null;
  };

  const catEmoji = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of data.categories) {
      const e = c.emoji || emojiOf(c.name);
      if (e) m.set(c.name, e);
    }
    return m;
  }, [data.categories]);

  // Emoji transaksi: prefer emoji kategori asli (semua tipe), fallback penanda tipe.
  const emojiFor = (row: DashboardData["transactions"][number]): string => {
    const byName = row.categoryName ? catEmoji.get(row.categoryName) : null;
    if (byName) return byName;
    if (row.type === "Transfer-Out") return "⇄";
    if (row.type === "Income") return "↓";
    return "·";
  };

  const catNameNoEmoji = (name: string | null): string => {
    if (!name) return "—";
    return name.replace(/^[^\p{L}\p{N}]+/u, "").trim() || name;
  };

  const typeTone = (v: string) =>
    v === "Income" ? "text-emerald-500" : v === "Transfer-Out" ? "text-blue-500" : "text-rose-500";

  // Group transaksi per tanggal (desc), tiap grup punya total expense harian
  const groupedByDate = useMemo(() => {
    const map = new Map<string, DashboardData["transactions"]>();
    for (const t of filtered) {
      const d = t.date.slice(0, 10);
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(t);
    }
    return [...map.entries()]
      .map(([date, items]) => {
        const dayExpense = items
          .filter((t) => t.type === "Expense")
          .reduce((s, t) => s + t.amount, 0);
        const dayIncome = items
          .filter((t) => t.type === "Income")
          .reduce((s, t) => s + t.amount, 0);
        return { date, items, dayExpense, dayIncome };
      })
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [filtered]);

  return (
    <div className="space-y-6 pb-10">
      <OverviewCards
        filtered={filtered}
        kpi={heroKpi}
        prevExpense={heroPrevExpense}
        prevIncome={prevIncomeNet.income}
        prevNet={prevIncomeNet.net}
        balances={{ total: balances.total, assets: balances.assets }}
        dataRange={{ min: minDate, max: maxDate }}
      />

      {/* Filters */}
      <div className="rounded-xl border border-border bg-card p-4 flex flex-wrap items-center gap-3">
        {data.transactions.length === 0 ? (
          <div className="flex-1 text-sm text-muted-foreground">
            {t("noTxYet")}
          </div>
        ) : (
          <>
        <div className="flex gap-1 flex-wrap">
          {[{ label: t("filter.all"), fn: () => presetRange(null) }, { label: "30d", fn: () => presetRange(30) },
            { label: "90d", fn: () => presetRange(90) }, { label: "180d", fn: () => presetRange(180) }]
            .map(({ label, fn }) => (
              <button
                key={label}
                onClick={fn}
                className="px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-accent transition-colors"
              >
                {label}
              </button>
            ))}
        </div>
        <select
          value={month} onChange={(e) => applyMonth(e.target.value)} aria-label={t("filter.monthAria")}
          className="px-2 py-1.5 text-sm rounded-lg border border-border bg-background"
        >
          <option value="">{t("filter.month")}</option>
          {availableMonths.map((ym) => <option key={ym} value={ym}>{monthLabel(ym)}</option>)}
        </select>
        <input
          type="date" value={from} min={minDate} max={maxDate} aria-label={t("filter.startDate")}
          onChange={(e) => setFrom(e.target.value)}
          className="px-2 py-1.5 text-sm rounded-lg border border-border bg-background"
        />
        <span className="text-muted-foreground text-sm">→</span>
        <input
          type="date" value={to} min={minDate} max={maxDate} aria-label={t("filter.endDate")}
          onChange={(e) => setTo(e.target.value)}
          className="px-2 py-1.5 text-sm rounded-lg border border-border bg-background"
        />
        <select
          value={segment} onChange={(e) => setSegment(e.target.value)} aria-label={t("filter.typeAria")}
          className="px-2 py-1.5 text-sm rounded-lg border border-border bg-background"
        >
          {["All", "Income", "Expense", "Transfer-Out"].map((s) => <option key={s} value={s}>{s === "All" ? t("filter.all") : typeLabel(s)}</option>)}
        </select>
        <select
          value={category} onChange={(e) => setCategory(e.target.value)} aria-label={t("filter.categoryAria")}
          className="px-2 py-1.5 text-sm rounded-lg border border-border bg-background max-w-[200px] truncate"
        >
          <option value="All">{t("filter.categoryPlaceholder")}</option>
          {data.categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
        </select>
        <select
          value={account} onChange={(e) => setAccount(e.target.value)} aria-label={t("filter.accountAria")}
          className="px-2 py-1.5 text-sm rounded-lg border border-border bg-background max-w-[180px] truncate"
        >
          <option value="All">{t("filter.accountPlaceholder")}</option>
          {data.accounts.map((a) => <option key={a.id} value={a.name}>{a.name}</option>)}
        </select>
        <button
          onClick={() => { setFrom(""); setTo(""); setSegment("All"); setCategory("All"); setAccount("All"); setQuery(""); setMonth(""); }}
          className="px-3 py-1.5 text-sm rounded-lg bg-muted hover:bg-accent transition-colors"
        >{t("filter.reset")}</button>
          </>
        )}
        <TransactionModal
          onSaved={() => {
            showToast(t("toast.saved"));
            startTransition(() => router.refresh());
          }}
          categories={data.categories}
          accounts={data.accounts}
          canManageAccounts={currentUser?.role === "owner"}
        />
        <ImportModal
          onImported={() => {
            showToast("Impor selesai");
            startTransition(() => router.refresh());
          }}
        />
      </div>

      {/* Charts: Line + Donut */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-xl border border-border bg-card p-5">
          <h3 className="font-semibold mb-1">{t("cashflow.title")}</h3>
          <p className="text-xs text-muted-foreground mb-4">{t("cashflow.subtitle")}</p>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlySeries} margin={{ left: -10, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} />
                <YAxis tickFormatter={formatIDRShort} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} />
                <Tooltip content={<ChartTip />} />
                <Legend />
                <Line type="monotone" dataKey="income" name={t("chart.income")} stroke={LINE_INCOME} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                <Line type="monotone" dataKey="expense" name={t("chart.expense")} stroke={LINE_EXPENSE} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                <Line type="monotone" dataKey="net" name={t("chart.net")} stroke={INK} strokeWidth={2} strokeDasharray="4 4" dot={false} activeDot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="font-semibold mb-1">{t("expenseByCat.title")}</h3>
          <p className="text-xs text-muted-foreground mb-4">{t("expenseByCat.subtitle")}</p>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={categoryDonut} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={2}>
                  {categoryDonut.map((_, i) => <Cell key={i} fill={RAMP[i % RAMP.length]} />)}
                </Pie>
                <Tooltip content={<ChartTip />} />
                <Legend layout="vertical" align="right" verticalAlign="middle" wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Bar: expense + income */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="font-semibold mb-1">{t("topSubcat.title")}</h3>
          <p className="text-xs text-muted-foreground mb-4">{t("topSubcat.subtitle")}</p>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={subcategoryBar} layout="vertical" margin={{ left: 20, right: 30 }} barSize={20}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis type="number" tickFormatter={formatIDRShort} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} />
                <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} />
                <Tooltip content={<ChartTip />} cursor={{ fill: "var(--muted)" }} />
                <Bar dataKey="value" name={t("chart.amount")} fill={INK} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="font-semibold mb-1">{t("incomeSource.title")}</h3>
          <p className="text-xs text-muted-foreground mb-4">{t("incomeSource.subtitle")}</p>
          <div className="h-[300px]">
            {incomeBar.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={incomeBar} layout="vertical" margin={{ left: 20, right: 30 }} barSize={20}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis type="number" tickFormatter={formatIDRShort} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} />
                  <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} />
                  <Tooltip content={<ChartTip />} cursor={{ fill: "var(--muted)" }} />
                  <Bar dataKey="value" name={t("chart.amount")} fill={LINE_INCOME} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                {t("incomeSource.empty")}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Saldo Akun */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-baseline justify-between mb-4">
          <div>
            <h3 className="font-semibold mb-1">{t("balance.title")}</h3>
            <p className="text-xs text-muted-foreground">{t("balance.subtitle")}</p>
          </div>
          <div className="text-right">
            <div className={cn("text-2xl font-bold tabular-nums", balances.total >= 0 ? "text-green-500" : "text-red-500")}>
              {formatIDR(balances.total)}
            </div>
            <div className="text-xs text-muted-foreground">{t("balance.totalLabel")}</div>
          </div>
        </div>
        <div className="space-y-2">
          {balances.accounts.map((a) => (
            <div key={a.id} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
              <span className="text-sm">{a.name}</span>
              <span className={cn("text-sm font-medium tabular-nums", a.balance >= 0 ? "text-foreground" : "text-red-500")}>
                {formatIDR(a.balance)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Transactions — grouped list per tanggal (ala base Fluxo) */}
      <div className="rounded-xl border border-border bg-card">
        <div className="p-5 pb-0 space-y-2">
          <h3 className="font-semibold">{t("table.title")}</h3>
          <p className="text-xs text-muted-foreground">{t("table.shown", { shown: filtered.length.toLocaleString("id-ID"), total: data.transactions.length.toLocaleString("id-ID") })}</p>
          <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center justify-between pb-4">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("table.searchPlaceholder")}
              className="px-3 py-1.5 text-sm rounded-lg border border-border bg-background w-64"
            />
          </div>
        </div>

        <div className="max-h-[560px] overflow-y-auto px-5 pb-5 space-y-5">
          {groupedByDate.length ? (
            groupedByDate.map(({ date, items, dayExpense, dayIncome }) => (
              <div key={date}>
                <div className="mb-1.5 flex items-baseline justify-between border-b border-border pb-1">
                  <span className="text-xs font-semibold text-muted-foreground">
                    {format(new Date(date + "T00:00:00"), "EEEE, dd MMM yyyy")}
                  </span>
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    {dayIncome > 0 && <span className="text-emerald-500">+{formatIDR(dayIncome)}</span>}
                    {dayIncome > 0 && dayExpense > 0 && " · "}
                    {dayExpense > 0 && <span>−{formatIDR(dayExpense)}</span>}
                  </span>
                </div>
                <ul className="space-y-1">
                  {items.map((tx) => (
                    <li
                      key={tx.id}
                      className={`group flex items-center gap-3 rounded-lg px-2 py-1.5 transition hover:bg-accent/50 ${
                        deletingId === tx.id ? "opacity-40" : ""
                      }`}
                    >
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-sm ${
                          tx.type === "Income"
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
                            : tx.type === "Transfer-Out"
                              ? "border-blue-500/30 bg-blue-500/10 text-blue-500"
                              : "border-border bg-muted text-foreground"
                        }`}
                      >
                        {emojiFor(tx)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{tx.note || catNameNoEmoji(tx.categoryName) || "Transaksi"}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {catNameNoEmoji(tx.categoryName)}
                          {" · "}
                          {tx.type === "Transfer-Out" && tx.destAccountName
                            ? `${tx.accountName} → ${tx.destAccountName}`
                            : tx.accountName}
                          {tx.subcategory ? ` · ${tx.subcategory}` : ""}
                        </p>
                      </div>
                      <span className={`w-28 shrink-0 text-right text-sm font-semibold tabular-nums ${typeTone(tx.type)}`}>
                        {tx.type === "Income" ? "+" : tx.type === "Transfer-Out" ? "⇄" : "−"}
                        {formatIDR(tx.amount)}
                      </span>
                      <div className="flex w-14 shrink-0 justify-end gap-0.5 opacity-0 transition group-hover:opacity-100">
                        <button
                          onClick={() => setEditTx(tx)}
                          aria-label={t("table.edit")}
                          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDelete(tx.id)}
                          disabled={deletingId === tx.id}
                          aria-label={t("table.delete")}
                          className="rounded p-1 text-muted-foreground hover:bg-red-500/10 hover:text-red-500 transition-colors disabled:opacity-40"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z" />
                          </svg>
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          ) : (
            <div className="py-12 text-center">
              <svg className="w-6 h-6 mx-auto mb-2 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" /></svg>
              <p className="text-muted-foreground font-medium">{t("table.emptyTitle")}</p>
              <p className="text-sm text-muted-foreground mt-1">{t("table.emptyDesc")}</p>
            </div>
          )}
        </div>
      </div>

      {/* AI suite (bawah) — Money Assistant, NL entry, Insights, Action Plan */}
      <DashboardHero
        filtered={filtered}
      />

      <NaturalLanguageEntry
        categories={data.categories}
        accounts={data.accounts}
        onSaved={() => {
          showToast(t("toast.saved"));
          startTransition(() => router.refresh());
        }}
      />

      <InsightCards
        filtered={filtered}
        kpi={heroKpi}
        monthlySeries={monthlySeries}
        prevCatExpense={prevCatExpense}
        serverConfig={planConfig}
      />

      <div className="relative">
        <ActionPlan filtered={filtered} kpi={heroKpi} serverConfig={planConfig} />
        {currentUser?.role === "owner" && (
          <button
            onClick={() => setSettingsOpen(true)}
            aria-label={lang === "en" ? "AI plan settings" : "Pengaturan rencana AI"}
            className="absolute right-4 top-4 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            {lang === "en" ? "Configure" : "Atur"}
          </button>
        )}
      </div>

      <PlanSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {editTx && (
        <EditTransactionModal
          tx={editTx}
          accounts={data.accounts}
          categories={data.categories}
          onClose={() => setEditTx(null)}
          onSaved={() => {
            setEditTx(null);
            showToast(t("toast.updated"));
            startTransition(() => router.refresh());
          }}
        />
      )}

      {/* Toast */}
      {toast && (
        <div
          role="status"
          className={cn(
            "fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium border",
            toast.kind === "success"
              ? "bg-green-500/15 border-green-500/30 text-green-500"
              : "bg-red-500/15 border-red-500/30 text-red-500",
          )}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}
