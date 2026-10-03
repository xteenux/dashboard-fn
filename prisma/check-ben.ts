import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const ben = await prisma.user.findFirst({ where: { email: "benjamin@avtx.studio" } });
  if (!ben) { console.log("NOT FOUND"); return; }
  console.log(JSON.stringify({ id: ben.id, name: ben.name, email: ben.email, role: ben.role, createdAt: ben.createdAt }, null, 2));
}
main().finally(() => prisma.$disconnect());
