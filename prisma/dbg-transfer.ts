import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const owner = await prisma.user.findFirst({ where: { role: "owner" } });
  const bca = await prisma.account.findFirst({ where: { name: "BCA" } });
  const blu = await prisma.account.findFirst({ where: { name: "Blu by BCA" } });
  const transferCat = await prisma.category.findFirst({ where: { type: "transfer" } });
  console.log("owner", owner?.id, "| BCA", bca?.id, "| Blu", blu?.id, "| cat", transferCat?.id);

  // Shape A: like a FIXED modal (clean ids)
  try {
    const tx = await prisma.transaction.create({
      data: {
        date: new Date("2026-09-14"), amount: 100000, type: "Transfer-Out",
        note: "dbg-A", categoryId: transferCat?.id ?? null, subcategoryId: null,
        accountId: bca!.id, destAccountId: blu!.id, userId: owner!.id,
      },
    });
    console.log("A OK id=", tx.id);
    await prisma.transaction.delete({ where: { id: tx.id } });
  } catch (e: any) { console.log("A FAIL:", e.message.split("\n").slice(-1)[0]); }

  // Shape B: replicate the buggy empty-string FK the old API passed through
  try {
    const tx = await prisma.transaction.create({
      data: {
        date: new Date("2026-09-14"), amount: 100000, type: "Transfer-Out",
        note: "dbg-B", categoryId: "", subcategoryId: "",
        accountId: bca!.id, destAccountId: blu!.id, userId: owner!.id,
      } as any,
    });
    console.log("B OK id=", tx.id);
    await prisma.transaction.delete({ where: { id: tx.id } });
  } catch (e: any) { console.log("B FAIL:", e.message.split("\n").slice(-1)[0]); }

  // Shape C: what if userId FK is bad
  try {
    const tx = await prisma.transaction.create({
      data: {
        date: new Date("2026-09-14"), amount: 1, type: "Transfer-Out",
        accountId: bca!.id, destAccountId: blu!.id, userId: "does-not-exist",
      } as any,
    });
    console.log("C OK");
    await prisma.transaction.delete({ where: { id: tx.id } });
  } catch (e: any) { console.log("C FAIL:", e.message.split("\n").slice(-1)[0]); }
}
main().finally(() => prisma.$disconnect());
