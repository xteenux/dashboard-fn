import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

async function main() {
  const byType = await p.transaction.groupBy({ by: ['type'], _sum: { amount: true }, _count: true });
  console.log('BY_TYPE', JSON.stringify(byType));

  const accts = await p.account.findMany({ select: { id: true, name: true, type: true } });
  for (const a of accts) {
    const ins = await p.transaction.aggregate({ where: { accountId: a.id, type: 'Income' }, _sum: { amount: true } });
    const outs = await p.transaction.aggregate({ where: { accountId: a.id, type: { in: ['Expense', 'Transfer-Out'] } }, _sum: { amount: true } });
    const net = (ins._sum.amount || 0) - (outs._sum.amount || 0);
    console.log('ACCT', a.name, a.type, 'net=' + net);
  }

  const topExp = await p.transaction.groupBy({ by: ['categoryName'], where: { type: 'Expense' }, _sum: { amount: true }, orderBy: { _sum: { amount: 'desc' } }, take: 12 });
  console.log('TOP_EXP', JSON.stringify(topExp));

  // monthly cash flow last 6 months
  const txns = await p.transaction.findMany({ select: { date: true, amount: true, type: true } });
  const months: Record<string, { inc: number; exp: number }> = {};
  for (const t of txns) {
    const k = t.date.toISOString().slice(0, 7);
    months[k] = months[k] || { inc: 0, exp: 0 };
    if (t.type === 'Income') months[k].inc += t.amount;
    else if (t.type === 'Expense') months[k].exp += t.amount;
  }
  console.log('MONTHLY', JSON.stringify(Object.entries(months).sort()));
}
main().finally(() => p.$disconnect());
