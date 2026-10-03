import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/auth";
import { prisma } from "@/app/lib/prisma";
import { getAccountBalances } from "@/app/lib/balances";

export async function GET() {
  const { accounts, assets, liabilities, total } = await getAccountBalances();
  return NextResponse.json({ accounts, assets, liabilities, total });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const role = (session?.user as { role?: string })?.role;
  if (role !== "owner" && role !== "manager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { name, type } = await req.json();
  if (!name) {
    return NextResponse.json({ error: "Missing name" }, { status: 400 });
  }
  try {
    const acc = await prisma.account.create({
      data: { name: name.trim(), type: type || "bank", userType: "global" },
    });
    return NextResponse.json(acc, { status: 201 });
  } catch (e) {
    if ((e as { code?: string })?.code === "P2002") {
      return NextResponse.json({ error: "Nama akun sudah ada" }, { status: 409 });
    }
    throw e;
  }
}