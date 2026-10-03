import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const ben = await prisma.user.findFirst({ where: { email: "benjamin@avtx.studio" } });
  if (!ben) { console.log("BEN NOT FOUND"); return; }
  console.log("BEN:", JSON.stringify({ id: ben.id, name: ben.name, email: ben.email, role: ben.role, createdAt: ben.createdAt }));

  const total = await prisma.transaction.count({ where: { userId: ben.id } });
  console.log("transactions assigned to Ben:", total);

  const recent = await prisma.transaction.findMany({
    where: { userId: ben.id },
    orderBy: { date: "desc" },
    take: 12,
    include: { account: { select: { name: true } }, destAccount: { select: { name: true } } },
  });
  console.log("\nRECENT (by date desc):");
  for (const t of recent) {
    console.log(`${t.date.toISOString()} | ${t.type} | ${t.amount} | cat=${t.categoryName ?? "∅"} | sub=${t.subcategory ?? "∅"} | acct=${t.account?.name ?? "∅"} | dest=${t.destAccount?.name ?? "∅"} | note=${t.note ?? ""}`);
  }

  const created = await prisma.transaction.findMany({
    where: { userId: ben.id },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { id: true, date: true, amount: true, type: true, categoryName: true, account: { select: { name: true } }, createdAt: true },
  });
  console.log("\nCREATED most recent by Ben (by createdAt desc):");
  for (const t of created) {
    console.log(`created=${t.createdAt.toISOString()} | date=${t.date.toISOString()} | ${t.type} | ${t.amount} | cat=${t.categoryName ?? "∅"} | acct=${t.account?.name ?? "∅"}`);
  }

  // today counts
  const todayStart = new Date("2026-09-15T00:00:00+07:00");
  const today = await prisma.transaction.findMany({ where: { userId: ben.id, createdAt: { gte: todayStart } } });
  console.log("\ncreated by Ben since 2026-09-15 00:00 WIB:", today.length);
  const todayByType: Record<string, number> = {};
  let sum = 0;
  for (const t of today) {
    todayByType[t.type] = (todayByType[t.type] ?? 0) + 1;
    sum += t.amount;
  }
  console.log("today by type:", todayByType, "sum:", sum);

  // MGR WALLET info
  const mgr = await prisma.account.findFirst({ where: { name: "MGR WALLET" } });
  if (mgr) {
    const cnt = await prisma.transaction.count({ where: { OR: [{ accountId: mgr.id }, { destAccountId: mgr.id }] } });
    console.log("\nMGR WALLET:", mgr.id, "type=", mgr.type, "userType=", mgr.userType, "transactions touching:", cnt);
  }

  // all users count check
  const users = await prisma.user.findMany({ select: { email: true, role: true, name: true } });
  console.log("\nALL USERS:");
  for (const u of users) console.log(" -", u.name, "<" + u.email + ">", u.role);
}
main().finally(() => prisma.$disconnect());