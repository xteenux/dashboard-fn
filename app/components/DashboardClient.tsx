"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";
import { format } from "date-fns";
import type { DashboardData } from "@/app/lib/data";
import { formatIDR, formatIDRShort, cn } from "@/app/lib/utils";
import TransactionModal from "@/app/components/TransactionModal";
import EditTransactionModal from "@/app/components/EditTransactionModal";

const PALETTE = [
  "#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6",
  "#06b6d4", "#f97316", "#84cc16", "#ec4899", "#6366f1",
];

interface Props {
  data: DashboardData;
  currentUser?: { id: string; role: string };
}

interface Tx {
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

function ChartTip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-sm shadow-lg">
      {label && <div className="font-semibold mb-1">{label}</div>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full"
            style={{ background: p.color || PALETTE[i % PALETTE.length] }}
          />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-medium">{formatIDR(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

export function DashboardClient({ data, currentUser }: Props) {
  const router = useRouter();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [segment, setSegment] = useState("All");
  const [category, setCategory] = useState("All");
  const [query, setQuery] = useState("");
  const [editTx, setEditTx] = useState<DashboardData["transactions"][number] | null>(null);
  const [toast, setToast] = useState<{ msg: string; kind: "success" | "error" } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const showToast = (msg: string, kind: "success" | "error" = "success") => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 3000);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Hapus transaksi ini? Tindakan ini tidak dapat dibatalkan.")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/transactions/${id}`, { method: "DELETE" });
      if (res.ok) {
        showToast("Transaksi dihapus");
        startTransition(() => router.refresh());
      } else {
        const d = await res.json().catch(() => ({}));
        showToast(d.error || "Gagal menghapus transaksi", "error");
      }
    } catch {
      showToast("Tidak dapat terhubung ke server", "error");
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

  const filtered = useMemo(() => {
    return data.transactions.filter((t) => {
      const d = t.date.slice(0, 10);
      if (from && d < from) return false;
      if (to && d > to) return false;
      if (segment !== "All" && t.type !== segment) return false;
      if (category !== "All" && (t.categoryName || "Other") !== category) return false;
      return true;
    });
  }, [data, from, to, segment, category]);

  // KPI
  const kpi = useMemo(() => {
    const inc = filtered.filter((t) => t.type === "Income").reduce((s, t) => s + t.amount, 0);
    const exp = filtered.filter((t) => t.type === "Expense").reduce((s, t) => s + t.amount, 0);
    const net = inc - exp;
    return { inc, exp, net, count: filtered.length };
  }, [filtered]);

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
      .map((e) => ({ ...e, label: format(new Date(e.month + "-01"), "MMM yy") }));
  }, [filtered]);

  // MoM growth
  const mom = useMemo(() => {
    if (monthlySeries.length < 2) return { income: null as number | null, expense: null as number | null };
    const a = monthlySeries[monthlySeries.length - 2];
    const b = monthlySeries[monthlySeries.length - 1];
    return {
      income: a.income ? ((b.income - a.income) / a.income) * 100 : null,
      expense: a.expense ? ((b.expense - a.expense) / a.expense) * 100 : null,
    };
  }, [monthlySeries]);

  const categoryDonut = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of filtered) {
      if (t.type === "Transfer-Out") continue;
      const name = t.categoryName || "Other";
      map.set(name, (map.get(name) || 0) + t.amount);
    }
    return [...map.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
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

  const columns = useMemo<ColumnDef<DashboardData["transactions"][number]>[]>(
    () => [
      {
        accessorKey: "date",
        header: "Date",
        cell: (info) => (
          <span className="text-sm">
            {format(new Date(info.getValue() as string), "dd MMM yyyy")}
          </span>
        ),
      },
      {
        accessorKey: "type",
        header: "Type",
        cell: (info) => {
          const v = info.getValue() as string;
          return (
            <span
              className={cn(
                "px-2 py-0.5 rounded text-xs font-medium",
                v === "Income" && "bg-green-500/15 text-green-500",
                v === "Expense" && "bg-red-500/15 text-red-500",
                v === "Transfer-Out" && "bg-blue-500/15 text-blue-500",
              )}
            >
              {v}
            </span>
          );
        },
      },
      {
        accessorKey: "accountName",
        header: "Account",
        cell: (info) => {
          const row = info.row.original as DashboardData["transactions"][number];
          if (row.type === "Transfer-Out" && row.destAccountName) {
            return <span className="text-sm">{row.accountName} → {row.destAccountName}</span>;
          }
          return <span className="text-sm">{row.accountName}</span>;
        },
      },
      { accessorKey: "categoryName", header: "Category", cell: (info) => <span className="text-sm">{(info.getValue() as string) || "—"}</span> },
      { accessorKey: "subcategory", header: "Subcategory", cell: (info) => <span className="text-sm">{(info.getValue() as string) || "—"}</span> },
      { accessorKey: "note", header: "Note", cell: (info) => <span className="max-w-[180px] truncate block text-xs text-muted-foreground">{(info.getValue() as string) || "—"}</span> },
      {
        accessorKey: "amount",
        header: "Amount",
        cell: (info) => <span className="font-medium">{formatIDR(info.getValue() as number)}</span>,
      },
      {
        id: "actions",
        header: "",
        cell: (info) => (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setEditTx(info.row.original)}
              className="px-2 py-1 text-xs rounded-md border border-border hover:bg-accent transition-colors"
            >
              Edit
            </button>
            <button
              onClick={() => handleDelete(info.row.original.id)}
              disabled={deletingId === info.row.original.id || isPending}
              className="px-2 py-1 text-xs rounded-md border border-border text-red-500 hover:bg-red-500/10 transition-colors disabled:opacity-40"
            >
              {deletingId === info.row.original.id ? "…" : "Hapus"}
            </button>
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deletingId, isPending],
  );

  const table = useReactTable({
    data: filtered,
    columns,
    state: { globalFilter: query },
    onGlobalFilterChange: setQuery,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 15 } },
  });

  const rangeLabel = `${from || minDate || "…"} → ${to || maxDate || "…"}`;

  return (
    <div className="space-y-6 pb-10">
      {/* Filters */}
      <div className="rounded-xl border border-border bg-card p-4 flex flex-wrap items-center gap-3">
        {data.transactions.length === 0 ? (
          <div className="flex-1 text-sm text-muted-foreground">
            Belum ada transaksi. Klik <span className="font-medium text-foreground">+ Transaksi</span> untuk memulai.
          </div>
        ) : (
          <>
        <div className="flex gap-1 flex-wrap">
          {[{ label: "All", fn: () => presetRange(null) }, { label: "30d", fn: () => presetRange(30) },
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
        <input
          type="date" value={from} min={minDate} max={maxDate} aria-label="Tanggal mulai"
          onChange={(e) => setFrom(e.target.value)}
          className="px-2 py-1.5 text-sm rounded-lg border border-border bg-background"
        />
        <span className="text-muted-foreground text-sm">→</span>
        <input
          type="date" value={to} min={minDate} max={maxDate} aria-label="Tanggal akhir"
          onChange={(e) => setTo(e.target.value)}
          className="px-2 py-1.5 text-sm rounded-lg border border-border bg-background"
        />
        <select
          value={segment} onChange={(e) => setSegment(e.target.value)} aria-label="Tipe transaksi"
          className="px-2 py-1.5 text-sm rounded-lg border border-border bg-background"
        >
          {["All", "Income", "Expense", "Transfer-Out"].map((s) => <option key={s}>{s}</option>)}
        </select>
        <select
          value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Kategori"
          className="px-2 py-1.5 text-sm rounded-lg border border-border bg-background max-w-[200px] truncate"
        >
          <option value="All">Semua kategori</option>
          {data.categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
        </select>
        <button
          onClick={() => { setFrom(""); setTo(""); setSegment("All"); setCategory("All"); setQuery(""); }}
          className="px-3 py-1.5 text-sm rounded-lg bg-muted hover:bg-accent transition-colors"
        >Reset</button>
          </>
        )}
        <TransactionModal
          onSaved={() => {
            showToast("Transaksi tersimpan");
            startTransition(() => router.refresh());
          }}
          categories={data.categories}
          accounts={data.accounts}
          canManageAccounts={currentUser?.role === "owner"}
        />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Total Income" value={formatIDR(kpi.inc)}
          sub={<Trend pct={mom.income} />} accent="text-green-500" />
        <KpiCard label="Total Expense" value={formatIDR(kpi.exp)}
          sub={<Trend pct={mom.expense} invert />} accent="text-red-500" />
        <KpiCard label="Net Balance" value={formatIDR(kpi.net)}
          sub={<span className="text-xs text-muted-foreground">{rangeLabel}</span>}
          accent={kpi.net >= 0 ? "text-green-500" : "text-red-500"} />
        <KpiCard label="Transactions" value={kpi.count.toLocaleString("id-ID")}
          sub={<span className="text-xs text-muted-foreground">
            {filtered.length !== data.transactions.length
              ? `Filtered from ${data.transactions.length.toLocaleString("id-ID")}`
              : "Showing all"}
          </span>} />
      </div>

      {/* Charts: Line + Donut */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-xl border border-border bg-card p-5">
          <h3 className="font-semibold mb-1">Cash Flow</h3>
          <p className="text-xs text-muted-foreground mb-4">Monthly income vs expense trend</p>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlySeries} margin={{ left: -10, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} />
                <YAxis tickFormatter={formatIDRShort} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} />
                <Tooltip content={<ChartTip />} />
                <Legend />
                <Line type="monotone" dataKey="income" name="Income" stroke="#22c55e" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                <Line type="monotone" dataKey="expense" name="Expense" stroke="#ef4444" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="font-semibold mb-1">By Category</h3>
          <p className="text-xs text-muted-foreground mb-4">Income / expense distribution</p>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={categoryDonut} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={2}>
                  {categoryDonut.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                </Pie>
                <Tooltip content={<ChartTip />} />
                <Legend layout="vertical" align="right" verticalAlign="middle" wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Bar */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="font-semibold mb-1">Top expense subcategories</h3>
        <p className="text-xs text-muted-foreground mb-4">Top 10 by total spend</p>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={subcategoryBar} layout="vertical" margin={{ left: 20, right: 30 }} barSize={20}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis type="number" tickFormatter={formatIDRShort} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} />
              <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} />
              <Tooltip content={<ChartTip />} cursor={{ fill: "var(--muted)" }} />
              <Bar dataKey="value" name="Amount" radius={[0, 4, 4, 0]}>
                {subcategoryBar.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* DataTable */}
      <div className="rounded-xl border border-border bg-card">
        <div className="p-5 pb-0 space-y-2">
          <h3 className="font-semibold">Transactions</h3>
          <p className="text-xs text-muted-foreground">{filtered.length.toLocaleString("id-ID")} of {data.transactions.length.toLocaleString("id-ID")} shown</p>
          <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center justify-between">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search notes, categories, accounts…"
              className="px-3 py-1.5 text-sm rounded-lg border border-border bg-background w-64"
            />
            <div className="text-sm text-muted-foreground">
              Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount() || 1}
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border/50">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((h) => (
                    <th
                      key={h.id}
                      onClick={h.column.getToggleSortingHandler()}
                      className="text-left px-3 py-2 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground whitespace-nowrap"
                    >
                      {flexRender(h.column.columnDef.header, h.getContext())}
                      {h.column.getIsSorted() === "asc" ? " ▲" : h.column.getIsSorted() === "desc" ? " ▼" : ""}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <tr key={row.id} className="border-b border-border/50 hover:bg-accent/50">
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-3 py-2 whitespace-nowrap">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={columns.length} className="px-3 py-12 text-center">
                    <div className="text-4xl mb-2">🔍</div>
                    <p className="text-muted-foreground font-medium">Tidak ada transaksi yang cocok</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Coba ubah filter tanggal, kategori, atau kata kunci pencarian.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-end gap-2 p-4 pt-0">
          <button
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            className="px-3 py-1 text-sm rounded-lg border border-border hover:bg-accent disabled:opacity-40 transition-colors"
          >Prev</button>
          <button
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            className="px-3 py-1 text-sm rounded-lg border border-border hover:bg-accent disabled:opacity-40 transition-colors"
          >Next</button>
        </div>
      </div>

      {editTx && (
        <EditTransactionModal
          tx={editTx}
          accounts={data.accounts}
          categories={data.categories}
          onClose={() => setEditTx(null)}
          onSaved={() => {
            setEditTx(null);
            showToast("Perubahan tersimpan");
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

function KpiCard({ label, value, sub, accent }: { label: string; value: string; sub: React.ReactNode; accent?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-2xl font-bold", accent)}>{value}</div>
      <div className="mt-1">{sub}</div>
    </div>
  );
}

function Trend({ pct, invert = false }: { pct: number | null; invert?: boolean }) {
  if (pct === null || !isFinite(pct)) return <span className="text-xs text-muted-foreground">no prev month data</span>;
  const good = !invert ? pct > 0 : pct < 0;
  return (
    <span className={cn("text-xs font-medium", good ? "text-green-500" : "text-red-500")}>
      {pct > 0 ? "▲" : pct < 0 ? "▼" : "●"} {Math.abs(pct).toFixed(1)}% vs prev month
    </span>
  );
}
