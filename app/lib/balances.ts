import { prisma } from "@/app/lib/prisma";

// Account names that can be the destination of a Transfer-Out (rawCategory)
const TRANSFER_DEST_NAMES = new Set(["Blu by BCA", "BCA", "BTN", "Jago", "HSBC"]);

export type AccountWithBalance = {
  id: string;
  name: string;
  type: string;
  balance: number;
};

export type BalanceSummary = {
  accounts: AccountWithBalance[];
  assets: number;
  liabilities: number;
  total: number;
};

/**
 * Derived per-account balance from transactions:
 *  - Income      -> +amount to the transaction's account
 *  - Expense     -> -amount from the transaction's account
 *  - Transfer-Out-> -amount from source account, +amount to destination account
 *                    (destination = rawCategory name when it matches a known account)
 */
export async function getAccountBalances(): Promise<BalanceSummary> {
  const [accounts, rows] = await Promise.all([
    prisma.account.findMany({
      select: { id: true, name: true, type: true },
      orderBy: { name: "asc" },
    }),
    prisma.transaction.findMany({
      select: { type: true, amount: true, rawCategory: true, accountId: true, destAccountId: true },
    }),
  ]);

  const byName = new Map(accounts.map((a) => [a.name, a.id]));
  const bal: Record<string, number> = {};
  for (const a of accounts) bal[a.id] = 0;

  for (const r of rows) {
    if (r.type === "Income" && r.accountId) {
      bal[r.accountId] = (bal[r.accountId] || 0) + r.amount;
    } else if (r.type === "Expense" && r.accountId) {
      bal[r.accountId] = (bal[r.accountId] || 0) - r.amount;
    } else if (r.type === "Transfer-Out") {
      if (r.accountId) bal[r.accountId] = (bal[r.accountId] || 0) - r.amount;
      // Prefer explicit destAccountId (new data); fallback rawCategory name match (legacy)
      let destId: string | null | undefined = r.destAccountId;
      if (!destId) {
        const destName = r.rawCategory && TRANSFER_DEST_NAMES.has(r.rawCategory) ? r.rawCategory : null;
        destId = destName ? byName.get(destName) : null;
      }
      if (destId) bal[destId] = (bal[destId] || 0) + r.amount;
    }
  }

  const withBalance: AccountWithBalance[] = accounts.map((a) => ({ ...a, balance: bal[a.id] || 0 }));
  const assets = withBalance.filter((a) => a.balance >= 0).reduce((s, a) => s + a.balance, 0);
  const liabilities = withBalance.filter((a) => a.balance < 0).reduce((s, a) => s + a.balance, 0);
  return { accounts: withBalance, assets, liabilities, total: assets + liabilities };
}