import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const ben = await prisma.user.findFirst({
    where: { email: "benjamin@avtx.studio" },
  });
  if (!ben) {
    console.log("BENJAMIN_USER_NOT_FOUND");
    return;
  }
  console.log(
    JSON.stringify(
      {
        user: {
          id: ben.id,
          name: ben.name,
          email: ben.email,
          role: ben.role,
          createdAt: ben.createdAt,
          updatedAt: (ben as any).updatedAt ?? null,
        },
      },
      null,
      2,
    ),
  );

  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000);

  const txCount = await prisma.transaction.count({
    where: { userId: ben.id },
  });
  const txRecent = await prisma.transaction.count({
    where: { userId: ben.id, createdAt: { gte: since } },
  });
  const last = await prisma.transaction.findFirst({
    where: { userId: ben.id },
    orderBy: { createdAt: "desc" },
  });
  const latest = await prisma.transaction.findMany({
    where: { userId: ben.id },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  console.log(
    JSON.stringify(
      {
        transactions_total: txCount,
        transactions_last7d: txRecent,
        last_created: last?.createdAt ?? null,
        latest: latest.map((t) => ({
          date: t.date,
          amount: t.amount,
          type: t.type,
          note: t.note,
          createdAt: t.createdAt,
        })),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => console.error("ERR", e?.message ?? e))
  .finally(() => prisma.$disconnect());
