// Prisma seed - loads transactions from money_data.json into SQLite
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";
import { resolve } from "path";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Money Manager data categories that act as account-name contamination
const ACCOUNT_NAMES = new Set(["Blu by BCA", "BCA", "BTN", "Jago", "HSBC"]);

// Map raw category string -> normalized type
function categorize(category: string, type: string): { name: string; emoji: string | null; type: string } {
  const c = category.trim();
  if (ACCOUNT_NAMES.has(c)) return { name: "Transfer", emoji: "🔄", type: "transfer" };
  switch (type) {
    case "Income":
      return { name: c, emoji: null, type: "income" };
    case "Expense":
      return { name: c, emoji: null, type: "expense" };
    case "Transfer-Out":
      return { name: "Transfer", emoji: "🔄", type: "transfer" };
    default:
      return { name: c, emoji: null, type: "expense" };
  }
}

// Derive account type from name (for display only)
function accountType(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("credit")) return "credit";
  if (n.includes("invest") || n.includes("saham") || n.includes("reksa")) return "investment";
  if (n.includes("gopay") || n.includes("ovo") || n.includes("dana") || n.includes("shopeepay") || n.includes("ewallet")) return "ewallet";
  if (n.includes("cash") || n.includes("tunai")) return "bank";
  return "bank";
}

async function main() {
  console.log("Seeding database...");
  const data = JSON.parse(readFileSync(resolve("../money_data.json"), "utf-8")) as Array<{
    date: string;
    account: string;
    category: string;
    subcategory: string;
    note: string;
    amount: number;
    type: string;
  }>;

  console.log(`Loaded ${data.length} transactions from money_data.json`);

  // Create default users: owner (Hanafi) and manager (Benjamin)
  const ownerPassword = await bcrypt.hash("owner123!", 10);
  const managerPassword = await bcrypt.hash("manager123!", 10);

  const owner = await prisma.user.upsert({
    where: { email: "hanafi@avtx.studio" },
    update: {},
    create: { name: "Hanafi (Owner)", email: "hanafi@avtx.studio", password: ownerPassword, role: "owner" },
  });

  const benjamin = await prisma.user.upsert({
    where: { email: "benjamin@avtx.studio" },
    update: {},
    create: { name: "Benjamin (Manager)", email: "benjamin@avtx.studio", password: managerPassword, role: "manager" },
  });

  console.log(`Users ready: ${owner.email} (${owner.role}), ${benjamin.email} (${benjamin.role})`);

  // Accounts: unique by name, global userType, derived type
  const accountNames = [...new Set(data.map((t) => t.account))].filter(Boolean);
  const accounts: Record<string, string> = {}; // name -> accountId
  for (const name of accountNames) {
    const account = await prisma.account.upsert({
      where: { name },
      update: {},
      create: { name, type: accountType(name), userType: "global" },
    });
    accounts[name] = account.id;
  }
  console.log(`Accounts: ${accountNames.join(", ")}`);

  // Categories
  const seen = new Set<string>();
  const categories: Record<string, string> = {}; // key: type:name -> id
  for (const t of data) {
    const cat = categorize(t.category, t.type);
    const key = `${cat.type}:${cat.name}`;
    if (!seen.has(key)) {
      seen.add(key);
      const c = await prisma.category.upsert({
        where: { name: cat.name },
        update: {},
        create: { name: cat.name, emoji: cat.emoji, type: cat.type },
      });
      categories[key] = c.id;
    }
  }
  console.log(`Categories: ${seen.size}`);

  // Seed subcategories from unique (categoryName, subcategory) pairs
  const subcatKey: Record<string, string> = {}; // "catName:subcatName" -> subcategoryId
  for (const t of data) {
    if (!t.subcategory) continue;
    const cat = categorize(t.category, t.type);
    const catId = categories[`${cat.type}:${cat.name}`];
    if (!catId) continue;
    const key = `${cat.name}:${t.subcategory}`;
    if (subcatKey[key]) continue;
    const sub = await prisma.subcategory.upsert({
      where: { name_categoryId: { name: t.subcategory, categoryId: catId } } as any,
      update: {},
      create: { name: t.subcategory, categoryId: catId },
    });
    subcatKey[key] = sub.id;
  }
  console.log(`Subcategories: ${Object.keys(subcatKey).length}`);

  // Transactions - create one by one to resolve FK
  let created = 0;
  for (const t of data) {
    const cat = categorize(t.category, t.type);
    const catKey = `${cat.type}:${cat.name}`;
    const catId = categories[catKey];
    const subcatId = t.subcategory && catId ? subcatKey[`${cat.name}:${t.subcategory}`] : null;

    await prisma.transaction.create({
      data: {
        date: new Date(t.date),
        amount: t.amount,
        type: t.type,
        note: t.note || null,
        description: null,
        categoryName: cat.name,
        subcategory: t.subcategory || null,
        rawCategory: t.category || null,
        categoryId: catId,
        subcategoryId: subcatId || undefined,
        accountId: accounts[t.account] as string | undefined,
        userId: owner.id,
      },
    });
    created++;
    if (created % 300 === 0) console.log(`  + ${created}`);
  }

  const txCount = await prisma.transaction.count();
  console.log(`\nDone. Total transactions in DB: ${txCount}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());