import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  // 1. Get all existing categories
  const categories = await prisma.category.findMany({
    include: { subcategories: true },
  });
  const catByName = new Map(categories.map((c) => [c.name.trim(), c]));
  const subByNameCat = new Map<string, Map<string, any>>();
  for (const c of categories) {
    const m = new Map<string, any>();
    for (const s of c.subcategories) m.set(s.name.trim(), s);
    subByNameCat.set(c.id, m);
  }

  // 2. Iterate all transactions
  const txs = await prisma.transaction.findMany({
    select: { id: true, categoryName: true, subcategory: true },
  });

  let linked = 0;
  for (const tx of txs) {
    let cat = tx.categoryName ? catByName.get(tx.categoryName.trim()) : null;
    if (!cat) {
      // create category on-the-fly if missing
      cat = await prisma.category.create({
        data: {
          name: tx.categoryName.trim(),
          type: tx.type === "Income" ? "income" : tx.type === "Transfer-Out" ? "transfer" : "expense",
        },
      });
      catByName.set(tx.categoryName.trim(), cat);
      subByNameCat.set(cat.id, new Map());
    }

    let sub = null;
    if (tx.subcategory && subByNameCat.has(cat.id)) {
      sub = subByNameCat.get(cat.id)!.get(tx.subcategory.trim());
      if (!sub) {
        sub = await prisma.subcategory.create({
          data: { name: tx.subcategory.trim(), categoryId: cat.id },
        });
        subByNameCat.get(cat.id)!.set(tx.subcategory.trim(), sub);
      }
    }

    const data: any = { categoryId: cat.id };
    if (sub) data.subcategoryId = sub.id;
    await prisma.transaction.update({ where: { id: tx.id }, data });
    linked++;
  }

  console.log(`Linked ${linked}/${txs.length} transactions to Category/Subcategory tables.`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });