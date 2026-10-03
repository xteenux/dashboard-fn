import { prisma } from "@/app/lib/prisma";
import type { User } from "@prisma/client";

export type TxType = "Income" | "Expense" | "Transfer-Out";

export interface FilterParams {
  from?: string; // ISO date
  to?: string;   // ISO date
  userId?: string; // owner filter
}

export async function getDashboardData(filters: FilterParams = {}, currentUser?: Pick<User, "id" | "role">) {
  const where: Record<string, unknown> = {};

  if (filters.from || filters.to) {
    const dateFilter: Record<string, Date> = {};
    if (filters.from) dateFilter.gte = new Date(filters.from);
    if (filters.to) dateFilter.lte = new Date(filters.to);
    where.date = dateFilter;
  }

  if (currentUser) {
    if (currentUser.role === "owner") {
      if (filters.userId) where.userId = filters.userId;
    } else {
      where.userId = currentUser.id;
    }
  }

  const [transactions, categories, accounts] = await Promise.all([
    prisma.transaction.findMany({
      where,
      select: {
        id: true, date: true, amount: true, type: true,
        categoryName: true, subcategory: true, note: true,
        account: { select: { id: true, name: true, type: true } },
        destAccount: { select: { id: true, name: true } },
        category: { select: { id: true, name: true, emoji: true, type: true } },
        subcategoryId: true,
      },
      orderBy: { date: "desc" },
    }),
    prisma.category.findMany({
      select: {
        id: true, name: true, emoji: true, type: true,
        subcategories: { select: { id: true, name: true }, orderBy: { name: "asc" } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.account.findMany({
      select: { id: true, name: true, type: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const income = transactions.filter((t) => t.type === "Income");
  const expense = transactions.filter((t) => t.type === "Expense");
  const transferOut = transactions.filter((t) => t.type === "Transfer-Out");

  const totalIncome = income.reduce((s, t) => s + t.amount, 0);
  const totalExpense = expense.reduce((s, t) => s + t.amount, 0);
  const totalTransfer = transferOut.reduce((s, t) => s + t.amount, 0);
  const net = totalIncome - totalExpense;

  const monthlyMap = new Map<string, { month: string; income: number; expense: number }>();
  for (const t of transactions) {
    if (t.type === "Transfer-Out") continue;
    const month = t.date.toISOString().slice(0, 7);
    if (!monthlyMap.has(month)) {
      monthlyMap.set(month, { month, income: 0, expense: 0 });
    }
    const entry = monthlyMap.get(month)!;
    if (t.type === "Income") entry.income += t.amount;
    else entry.expense += t.amount;
  }
  const monthlySeries = [...monthlyMap.values()].sort((a, b) => a.month.localeCompare(b.month));

  const catMap = new Map<string, { name: string; value: number }>();
  for (const t of expense) {
    const name = t.categoryName || "Other";
    catMap.set(name, { name, value: (catMap.get(name)?.value || 0) + t.amount });
  }
  const categoryBreakdown = [...catMap.values()].sort((a, b) => b.value - a.value);

  const subcatMap = new Map<string, number>();
  for (const t of expense) {
    const name = t.subcategory || "Other";
    subcatMap.set(name, (subcatMap.get(name) || 0) + t.amount);
  }
  const subcategoryBreakdown = [...subcatMap.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  const incomeMap = new Map<string, number>();
  for (const t of income) {
    const name = t.categoryName || "Other";
    incomeMap.set(name, (incomeMap.get(name) || 0) + t.amount);
  }
  const incomeBreakdown = [...incomeMap.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  return {
    kpi: {
      totalIncome, totalExpense, totalTransfer, net,
      txCount: transactions.length,
    },
    monthlySeries,
    categoryBreakdown,
    subcategoryBreakdown,
    incomeBreakdown,
    categories,
    accounts,
    transactions: transactions.map((t) => ({
      id: t.id,
      date: t.date.toISOString(),
      amount: t.amount,
      type: t.type,
      categoryName: t.categoryName,
      subcategory: t.subcategory,
      note: t.note,
      accountName: t.account?.name || "Unknown",
      accountId: t.account?.id ?? null,
      destAccountName: t.destAccount?.name ?? null,
      destAccountId: t.destAccount?.id ?? null,
      subcategoryId: t.subcategoryId,
      categoryId: t.category?.id ?? null,
    })),
  };
}

export type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;