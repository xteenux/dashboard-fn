import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

(async () => {
  const users = await p.user.findMany({ select: { name: true, email: true, role: true } });
  const accounts = await p.account.findMany({ select: { name: true, type: true } });
  console.log("USERS:", JSON.stringify(users, null, 2));
  console.log("ACCOUNTS:", accounts.length, accounts.map((a) => `${a.name} (${a.type})`).join(", "));
  await p.$disconnect();
})();
