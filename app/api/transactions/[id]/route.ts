import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getApiUser } from "@/app/lib/api-auth";

async function sessionUser(req: NextRequest) {
  const u = await getApiUser(req);
  return u ? { id: u.id, role: u.role } : null;
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await sessionUser(req);
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const existing = await prisma.transaction.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (u.role !== "owner" && existing.userId !== u.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { date, amount, type, note, categoryId, subcategoryId, accountId: bodyAccountId, accountName, destAccountId: bodyDestAccountId } = await req.json();

  let accountId: string | null | undefined;
  if (bodyAccountId !== undefined) {
    accountId = bodyAccountId || null;
  } else if (accountName !== undefined) {
    if (accountName) {
      const acct = await prisma.account.findFirst({ where: { name: accountName } });
      accountId = acct?.id ?? null;
    } else {
      accountId = null;
    }
  }

  let destAccountId: string | null | undefined;
  if (bodyDestAccountId !== undefined) {
    destAccountId = bodyDestAccountId || null;
  }

  // Server-side transfer validation
  const effectiveType = type ?? existing.type;
  const effectiveAccount = accountId !== undefined ? accountId : existing.accountId;
  const effectiveDest = destAccountId !== undefined ? destAccountId : existing.destAccountId;
  if (effectiveType === "Transfer-Out") {
    if (!effectiveAccount || !effectiveDest) {
      return NextResponse.json({ error: "Transfer wajib memiliki akun sumber dan tujuan" }, { status: 400 });
    }
    if (effectiveAccount === effectiveDest) {
      return NextResponse.json({ error: "Akun sumber dan tujuan tidak boleh sama" }, { status: 400 });
    }
  } else {
    destAccountId = null;
  }

  let categoryName: string | null | undefined;
  let catIdOut: string | null | undefined;
  if (categoryId !== undefined) {
    catIdOut = categoryId || null;
    categoryName = categoryId
      ? (await prisma.category.findUnique({ where: { id: categoryId } }))?.name ?? null
      : null;
  }

  let subcategoryName: string | null | undefined;
  let subIdOut: string | null | undefined;
  if (subcategoryId !== undefined) {
    subIdOut = subcategoryId || null;
    subcategoryName = subcategoryId
      ? (await prisma.subcategory.findUnique({ where: { id: subcategoryId } }))?.name ?? null
      : null;
  }

  const tx = await prisma.transaction.update({
    where: { id },
    data: {
      ...(date && { date: new Date(date) }),
      ...(amount !== undefined && { amount: Number(amount) }),
      ...(type && { type: String(type) }),
      ...(note !== undefined && { note: note ? String(note) : null }),
      ...(categoryName !== undefined && { categoryName }),
      ...(catIdOut !== undefined && { categoryId: catIdOut }),
      ...(subcategoryName !== undefined && { subcategory: subcategoryName }),
      ...(subIdOut !== undefined && { subcategoryId: subIdOut }),
      ...(accountId !== undefined && { accountId }),
      ...(destAccountId !== undefined && { destAccountId }),
    },
  });
  return NextResponse.json(tx);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await sessionUser(req);
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const existing = await prisma.transaction.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (u.role !== "owner" && existing.userId !== u.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await prisma.transaction.delete({ where: { id } });
  return NextResponse.json({ success: true });
}