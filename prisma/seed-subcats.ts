import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  // Groups: categoryName (raw with emoji) -> set of subcategories
  const txs = await prisma.transaction.findMany({
    select: { categoryName: true, subcategory: true },
  });

  const map = new Map<string, Set<string>>();
  for (const t of txs) {
    if (!t.categoryName) continue;
    if (!t.subcategory) continue;
    const key = t.categoryName.trim();
    if (!map.has(key)) map.set(key, new Set());
    map.get(key)!.add(t.subcategory.trim());
  }

  let created = 0;
  for (const [catName, subs] of map) {
    // find or create category by name
    let cat = await prisma.category.findUnique({ where: { name: catName } });
    if (!cat) {
      // infer type from a transaction
      const sample = await prisma.transaction.findFirst({ where: { categoryName: catName } });
      const type = sample?.type === "Income" ? "income" : sample?.type === "Transfer-Out" ? "transfer" : "expense";
      cat = await prisma.category.create({ data: { name: catName, type } });
    }
    for (const sub of subs) {
      const exists = await prisma.subcategory.findUnique({
        where: { name_categoryId: { name: sub, categoryId: cat.id } },
      });
      if (exists) continue;
      await prisma.subcategory.create({ data: { name: sub, categoryId: cat.id } });
      created++;
    }
  }
  console.log(`categories+subcategories synced; new subcategories created: ${created}`);
}

main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });