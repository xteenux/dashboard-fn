import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getApiUser } from "@/app/lib/api-auth";

async function sessionUser(req: NextRequest) {
  const u = await getApiUser(req);
  return u ? { id: u.id, role: u.role } : null;
}

export async function GET(req: NextRequest) {
  const u = await sessionUser(req);
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const where = u.role === "owner" ? {} : { userId: u.id };
  const txs = await prisma.transaction.findMany({
    where,
    select: {
      id: true, date: true, amount: true, type: true,
      categoryName: true, subcategory: true, note: true,
      account: { select: { name: true } },
      destAccount: { select: { name: true } },
    },
    orderBy: { date: "desc" },
  });
  return NextResponse.json(txs);
}

export async function POST(req: NextRequest) {
  const u = await sessionUser(req);
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const {
    date, amount, type, note, categoryId, subcategoryId,
    accountName, userId: bodyUserId,
  } = body;
  if (!date || !amount || !type) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Empty string -> null (guard against "" causing FK errors)
  const norm = (v: unknown): string | null =>
    typeof v === "string" && v.trim() ? v.trim() : (v ? String(v) : null);

  let accountId = norm(body.accountId);
  if (!accountId && accountName) {
    const acct = await prisma.account.findFirst({ where: { name: accountName } });
    accountId = acct?.id ?? null;
  }
  let destAccountId = norm(body.destAccountId);

  if (type === "Transfer-Out") {
    if (!accountId || !destAccountId) {
      return NextResponse.json({ error: "Transfer wajib memilih akun sumber dan akun tujuan" }, { status: 400 });
    }
    if (accountId === destAccountId) {
      return NextResponse.json({ error: "Akun sumber dan tujuan tidak boleh sama" }, { status: 400 });
    }
  } else {
    destAccountId = null;
  }

  let categoryName: string | null = null;
  let subcategoryName: string | null = null;
  if (categoryId) {
    const cat = await prisma.category.findUnique({ where: { id: categoryId } });
    categoryName = cat?.name ?? null;
  } else if (type === "Transfer-Out") {
    // Auto-resolve the "Transfer" category if caller omitted categoryId
    const txCat = await prisma.category.findFirst({ where: { OR: [{ name: "Transfer" }, { type: "transfer" }] } });
    if (txCat) {
      categoryName = txCat.name;
      subcategoryName = null;
    }
  }
  if (subcategoryId) {
    const sub = await prisma.subcategory.findUnique({ where: { id: subcategoryId } });
    subcategoryName = sub?.name ?? null;
  }

  // Guard: Transfer-Out must carry both source and destination accounts
  if (type === "Transfer-Out" && (!accountId || !destAccountId)) {
    return NextResponse.json({ error: "Transfer wajib memilih akun sumber dan akun tujuan" }, { status: 400 });
  }

  const targetUserId = u.role === "owner" ? (bodyUserId || u.id) : u.id;

  try {
    const tx = await prisma.transaction.create({
      data: {
        date: new Date(date),
        amount: Number(amount),
        type: String(type),
        note: norm(note),
        categoryName,
        subcategory: subcategoryName,
        categoryId: norm(categoryId),
        subcategoryId: norm(subcategoryId),
        accountId,
        destAccountId,
        userId: targetUserId,
      },
    });
    return NextResponse.json(tx, { status: 201 });
  } catch (e) {
    console.error("[transactions:POST] create failed:", e);
    return NextResponse.json({ error: "Gagal menyimpan transaksi" }, { status: 500 });
  }
}
