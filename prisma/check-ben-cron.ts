import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const ben = await prisma.user.findFirst({
    where: { email: "benjamin@avtx.studio" },
  });
  if (!ben) {
    console.log("USER_NOT_FOUND");
    return;
  }
  console.log(
    "USER " +
      JSON.stringify({
        id: ben.id,
        name: ben.name,
        email: ben.email,
        role: ben.role,
        createdAt: ben.createdAt,
      })
  );

  const txns = await prisma.transaction.findMany({
    where: { userId: ben.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  console.log("TXN_COUNT " + txns.length);
  for (const t of txns) {
    console.log(
      "TXN " +
        JSON.stringify({
          id: t.id,
          type: t.type,
          amount: Number(t.amount),
          date: t.date,
          note: t.note,
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
        })
    );
  }

  const all = await prisma.transaction.count();
  console.log("ALL_TXN_TOTAL " + all);

  const lastAny = await prisma.transaction.findFirst({
    orderBy: { createdAt: "desc" },
  });
  console.log(
    "LAST_ANY " +
      JSON.stringify(
        lastAny
          ? { id: lastAny.id, userId: lastAny.userId, createdAt: lastAny.createdAt }
          : null
      )
  );
}

main()
  .catch((e) => {
    console.error("ERR " + (e && e.message ? e.message : e));
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
