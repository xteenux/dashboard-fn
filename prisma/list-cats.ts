import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const cats = await prisma.category.findMany({
    select: { id: true, name: true, emoji: true, type: true,
      subcategories: { select: { id: true, name: true }, orderBy: { name: "asc" } } },
    orderBy: { name: "asc" },
  });
  for (const c of cats) {
    const prefix = `${c.emoji ?? "•"} ${c.name} (${c.type})`;
    if (c.subcategories.length === 0) {
      console.log(`${prefix}  id=${c.id}`);
    } else {
      console.log(`${prefix}  id=${c.id}`);
      for (const s of c.subcategories) {
        console.log(`    └─ ${s.name}  id=${s.id}`);
      }
    }
  }
  console.log(`\nTotal: ${cats.length} kategori`);
}
main().finally(() => prisma.$disconnect());
