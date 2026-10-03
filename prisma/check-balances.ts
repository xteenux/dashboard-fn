import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const ACCOUNT_NAMES = new Set(["Blu by BCA", "BCA", "BTN", "Jago", "HSBC"]);

async function main() {
  const rows = await prisma.transaction.findMany({
    select: { type: true, amount: true, rawCategory: true, account: { select: { name: true } } },
  });
  console.log("total rows:", rows.length);

  const bal: Record<string, number> = {};
  let linked = 0;
  for (const r of rows) {
    const acc = r.account?.name;
    if (!acc) { linked++; continue; }
    if (r.type === "Income") bal[acc] = (bal[acc] || 0) + r.amount;
    else if (r.type === "Expense") bal[acc] = (bal[acc] || 0) - r.amount;
    else if (r.type === "Transfer-Out") {
      bal[acc] = (bal[acc] || 0) - r.amount;
      const dest = r.rawCategory && ACCOUNT_NAMES.has(r.rawCategory) ? r.rawCategory : null;
      if (dest) bal[dest] = (bal[dest] || 0) + r.amount;
    }
  }
  console.log("unlinked rows:", linked);
  console.log("=== per-account balance (transfer paired) ===");
  let assets = 0, liabilities = 0;
  for (const [k, v] of Object.entries(bal).sort((a, b) => b[1] - a[1])) {
    console.log(k.padEnd(14), v.toFixed(2));
    if (v >= 0) assets += v; else liabilities += v;
  }
  console.log("Assets:", assets.toFixed(2), "| Liabilities:", liabilities.toFixed(2), "| Total:", (assets + liabilities).toFixed(2));
}
main().finally(() => prisma.$disconnect());