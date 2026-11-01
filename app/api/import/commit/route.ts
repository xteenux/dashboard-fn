import { NextRequest, NextResponse } from "next/server";
import { getApiUser } from "@/app/lib/api-auth";
import { prisma } from "@/app/lib/prisma";

export const runtime = "nodejs";

type Item = {
  date: string;
  amount: number;
  type: string; // Income | Expense | Transfer-Out
  categoryName?: string | null;
  subcategory?: string | null;
  accountName?: string | null;
  destAccountName?: string | null;
  accountId?: string | null;
  destAccountId?: string | null;
  note?: string | null;
};

export async function POST(req: NextRequest) {
  const user = await getApiUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { accountName?: string; accountId?: string; userId?: string; items?: Item[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const items = body.items;
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "No items to import" }, { status: 400 });
  }
  if (items.length > 5000) {
    return NextResponse.json({ error: "Too many items (max 5000)" }, { status: 400 });
  }

  const [categories, accounts] = await Promise.all([
    prisma.category.findMany({ select: { id: true, name: true, type: true } }),
    prisma.account.findMany({ select: { id: true, name: true } }),
  ]);
  const catByName = new Map(categories.map((c) => [c.name, c]));
  const acctByName = new Map(accounts.map((a) => [a.name, a]));

  // validasi transfer category
  const transferCat = categories.find((c) => c.type === "transfer");

  const prepared = [];
  for (const it of items) {
    const type = it.type === "Income" ? "Income" : it.type === "Expense" ? "Expense" : it.type === "Transfer-Out" ? "Transfer-Out" : null;
    if (!type) continue;
    const amount = Number(it.amount);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const date = new Date(String(it.date));
    if (Number.isNaN(date.getTime())) continue;

    // Resolve akun: explicit id > name > body default > first global
    let accountId = it.accountId || null;
    if (!accountId && it.accountName) accountId = acctByName.get(it.accountName)?.id ?? null;
    if (!accountId && body.accountId) accountId = body.accountId;
    if (!accountId && body.accountName) accountId = acctByName.get(body.accountName)?.id ?? null;
    if (!accountId && accounts.length) accountId = accounts[0].id;

    let destAccountId = it.destAccountId || null;
    if (!destAccountId && it.destAccountName) destAccountId = acctByName.get(it.destAccountName)?.id ?? null;

    let categoryName: string | null = null;
    let categoryId: string | null = null;
    let subcategory = it.subcategory || null;

    if (type === "Transfer-Out") {
      categoryName = transferCat?.name ?? null;
      categoryId = transferCat?.id ?? null;
      subcategory = null;
    } else if (it.categoryName) {
      const cat = catByName.get(it.categoryName);
      if (cat) {
        const expected = type === "Income" ? "income" : "expense";
        if (cat.type === expected) {
          categoryName = cat.name;
          categoryId = cat.id;
        }
      }
    }

    // Transfer wajib punya dua akun beda
    if (type === "Transfer-Out") {
      if (!accountId || !destAccountId) continue; // skip transfer tidak lengkap
      if (accountId === destAccountId) continue; // skip transfer ke akun sendiri
    } else {
      destAccountId = null;
    }

    prepared.push({
      date,
      amount,
      type,
      note: (it.note || "").trim() || null,
      categoryName,
      subcategory,
      categoryId,
      accountId,
      destAccountId,
      userId: user.role === "owner" ? (body.userId || user.id) : user.id,
    });
  }

  if (!prepared.length) {
    return NextResponse.json({ error: "No valid transactions to import" }, { status: 400 });
  }

  // Insert semua tanpa dedupe — user ingin duplicate tetap masuk.
  try {
    await prisma.transaction.createMany({
      data: prepared,
    });
    return NextResponse.json({ imported: prepared.length });
  } catch (e) {
    console.error("[import:commit] failed:", e);
    return NextResponse.json({ error: "Failed to import transactions" }, { status: 500 });
  }
}