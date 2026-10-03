import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
async function main() {
  const all = await p.transaction.findMany({
    where: { type: "Transfer-Out" },
    select: { amount: true, rawCategory: true, destAccountId: true, account: { select: { name: true } }, destAccount: { select: { name: true } }, date: true },
    orderBy: { date: "desc" },
    take: 20,
  });
  console.log("XFER_SAMPLE:");
  for (const r of all) console.log(`  date=${r.date.toISOString().slice(0,10)} amount=${r.amount} src=${r.account?.name} destAcct=${r.destAccountId ?? "∅"} destName=${r.destAccount?.name ?? "∅"} rawCat=${r.rawCategory ?? "∅"}`);

  const TRANSFER_DEST_NAMES = new Set(["Blu by BCA","BCA","BTN","Jago","HSBC"]);
  const rows = await p.transaction.findMany({ where: { type: "Transfer-Out" }, select: { amount: true, rawCategory: true, destAccountId: true } });
  let withDest = 0, rawMatch = 0, noDest = 0, reconSum = 0, noDestSum = 0;
  for (const r of rows) {
    if (r.destAccountId) { withDest++; reconSum += r.amount; }
    else if (r.rawCategory && TRANSFER_DEST_NAMES.has(r.rawCategory)) { rawMatch++; reconSum += r.amount; }
    else { noDest++; noDestSum += r.amount; }
  }
  console.log(`\nXFER_COUNT=${rows.length} destAccountId=${withDest} rawMatches=${rawMatch} noDest=${noDest}`);
  console.log(`RECON_SUM=${reconSum} NO_DEST_SUM=${noDestSum}`);
}
main().finally(() => p.$disconnect());
