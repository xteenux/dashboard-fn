import { prisma } from "@/app/lib/prisma";
import { getAccountBalances } from "@/app/lib/balances";
import type { User, Prisma } from "@prisma/client";

/**
 * AI Agent data tools — read-only "scraping" layer.
 * Angka SELALU dihitung dari DB via kode (deterministic), bukan dari LLM.
 * Setiap fungsi wajib scope ke userId (non-owner hanya melihat datanya sendiri).
 */

export type AgentUser = Pick<User, "id" | "role">;

export interface AgentToolResult {
  [key: string]: unknown;
}

function rangeWhere(from?: string, to?: string): Record<string, Date> | undefined {
  if (!from && !to) return undefined;
  const f: Record<string, Date> = {};
  if (from) f.gte = new Date(from);
  if (to) f.lte = new Date(to); // inclusive-lite: same-day works when from===to uses gte only
  return Object.keys(f).length ? f : undefined;
}

/** KPI ringkas + rentang efektif yang dipakai. */
export async function getSummary(
  user: AgentUser,
  from?: string,
  to?: string,
): Promise<AgentToolResult> {
  const where: Record<string, unknown> = {};
  const df = rangeWhere(from, to);
  if (df) where.date = df;
  if (user.role !== "owner") where.userId = user.id;

  const txs = await prisma.transaction.findMany({
    where,
    select: { type: true, amount: true, date: true },
  });

  const income = txs.filter((t) => t.type === "Income").reduce((s, t) => s + t.amount, 0);
  const expense = txs.filter((t) => t.type === "Expense").reduce((s, t) => s + t.amount, 0);
  const transferOut = txs.filter((t) => t.type === "Transfer-Out").reduce((s, t) => s + t.amount, 0);
  const dates = txs.map((t) => t.date.getTime());
  const days = dates.length
    ? Math.max(1, Math.round((Math.max(...dates) - Math.min(...dates)) / 86400000) + 1)
    : 0;

  return {
    count: txs.length,
    income,
    expense,
    transferOut,
    net: income - expense,
    savingsRate: income > 0 ? ((income - expense) / income) * 100 : null,
    avgExpensePerDay: days > 0 ? expense / days : null,
    from: dates.length ? new Date(Math.min(...dates)).toISOString().slice(0, 10) : null,
    to: dates.length ? new Date(Math.max(...dates)).toISOString().slice(0, 10) : null,
  };
}

/** Saldo per akun + total aset/liabilitas (pakai engine balances.ts, handle rawCategory legacy). */
export async function getBalances(_user: AgentUser): Promise<AgentToolResult> {
  const b = await getAccountBalances();
  return {
    total: b.total,
    assets: b.assets,
    liabilities: b.liabilities,
    accounts: b.accounts.map((a) => ({ name: a.name, type: a.type, balance: a.balance })),
  };
}

/** Top kategori expense/income + delta vs periode sebelumnya (sepanjang from..to). */
export async function getCategoryBreakdown(
  user: AgentUser,
  type: "Expense" | "Income" = "Expense",
  from?: string,
  to?: string,
): Promise<AgentToolResult> {
  const where: Prisma.TransactionWhereInput = { type };
  const df = rangeWhere(from, to);
  if (df) where.date = df;
  if (user.role !== "owner") where.userId = user.id;

  // Periode pembanding: window sama panjang shifted ke belakang, atau 6-vs-6 bulan.
  const scope = user.role !== "owner" ? { userId: user.id } : {};
  let prevWhere: Prisma.TransactionWhereInput;
  if (from && to) {
    const fD = new Date(from);
    const tD = new Date(to);
    const span = tD.getTime() - fD.getTime();
    prevWhere = {
      type,
      date: {
        gte: new Date(fD.getTime() - span - 86400000),
        lte: new Date(fD.getTime() - 86400000),
      },
      ...scope,
    };
  } else {
    const now = new Date();
    prevWhere = {
      type,
      date: {
        gte: new Date(now.getFullYear(), now.getMonth() - 11, 1),
        lte: new Date(now.getFullYear(), now.getMonth() - 6, 0, 23, 59, 59),
      },
      ...scope,
    };
  }

  const [curRows, prevRows] = await Promise.all([
    prisma.transaction.groupBy({
      by: ["categoryName"],
      _sum: { amount: true },
      where,
    }),
    prisma.transaction.groupBy({
      by: ["categoryName"],
      _sum: { amount: true },
      where: prevWhere,
    }),
  ]);

  const curSum = new Map(curRows.map((c) => [c.categoryName || "Other", c._sum.amount || 0]));
  const prevSum = new Map(prevRows.map((c) => [c.categoryName || "Other", c._sum.amount || 0]));
  const rows = [...curSum.entries()]
    .map(([name, value]) => {
      const p = prevSum.get(name) || 0;
      return {
        category: name,
        value,
        prevValue: p,
        deltaPct: p > 0 ? Math.round(((value - p) / p) * 1000) / 10 : null,
      };
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  return { type, items: rows };
}

/** Cari transaksi: keyword note/kategori/subkategori, filter tipe + rentang. Max 20. */
export async function searchTransactions(
  user: AgentUser,
  query?: string,
  type?: string,
  from?: string,
  to?: string,
  limit = 20,
): Promise<AgentToolResult> {
  const where: Record<string, unknown> = {};
  if (type === "Income" || type === "Expense" || type === "Transfer-Out") where.type = type;
  const df = rangeWhere(from, to);
  if (df) where.date = df;
  if (user.role !== "owner") where.userId = user.id;
  if (query) {
    where.OR = [
      { note: { contains: query } },
      { categoryName: { contains: query } },
      { subcategory: { contains: query } },
    ];
  }
  const txs = await prisma.transaction.findMany({
    where,
    orderBy: { date: "desc" },
    take: Math.min(limit, 50),
    select: {
      id: true, date: true, amount: true, type: true,
      categoryName: true, subcategory: true, note: true,
      account: { select: { name: true } },
    },
  });
  return {
    count: txs.length,
    transactions: txs.map((t) => ({
      date: t.date.toISOString().slice(0, 10),
      type: t.type,
      amount: t.amount,
      category: t.categoryName,
      subcategory: t.subcategory,
      note: t.note,
      account: t.account?.name ?? null,
    })),
  };
}

/** Tren bulanan income/expense/net. */
export async function getMonthlySeries(user: AgentUser, months = 12): Promise<AgentToolResult> {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
  const where: Record<string, unknown> = {
    type: { not: "Transfer-Out" },
    date: { gte: start },
  };
  if (user.role !== "owner") where.userId = user.id;

  const txs = await prisma.transaction.findMany({
    where,
    select: { date: true, type: true, amount: true },
  });

  const map = new Map<string, { month: string; income: number; expense: number }>();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    map.set(key, { month: key, income: 0, expense: 0 });
  }
  for (const t of txs) {
    const key = t.date.toISOString().slice(0, 7);
    const e = map.get(key);
    if (!e) continue;
    if (t.type === "Income") e.income += t.amount;
    else e.expense += t.amount;
  }
  const series = [...map.values()].map((e) => ({ ...e, net: e.income - e.expense }));
  const withData = series.filter((e) => e.income || e.expense);
  return { months, series, first: withData[0] ?? null, last: withData[withData.length - 1] ?? null };
}

/** Registry: dipakai router LLM (function-calling) & fallback engine. */
export const AGENT_TOOLS = {
  get_summary: getSummary,
  get_balances: getBalances,
  get_category_breakdown: getCategoryBreakdown,
  search_transactions: searchTransactions,
  get_monthly_series: getMonthlySeries,
} as const;

export type AgentToolName = keyof typeof AGENT_TOOLS;
