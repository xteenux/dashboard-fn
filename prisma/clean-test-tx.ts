import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const del = await prisma.transaction.deleteMany({
    where: { note: { in: ["transfer ok", "curl repro", "test"] } },
  });
  console.log("deleted:", del.count, "| remaining:", await prisma.transaction.count());
}
main().finally(() => prisma.$disconnect());
