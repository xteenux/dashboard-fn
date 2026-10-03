import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const accs = await prisma.account.findMany({ select: { id: true, name: true, type: true, userType: true }, orderBy: { name: "asc" } });
  console.log("=== ACCOUNTS ===");
  for (const a of accs) console.log(`${a.name} (${a.type})  id=${a.id}`);
  const users = await prisma.user.findMany({ select: { id: true, name: true, email: true, role: true } });
  console.log("\n=== USERS ===");
  for (const u of users) console.log(`${u.name} <${u.email}> role=${u.role}  id=${u.id}`);
  const cnt = await prisma.transaction.count();
  console.log("\ntransactions in DB:", cnt);
}
main().finally(() => prisma.$disconnect());
