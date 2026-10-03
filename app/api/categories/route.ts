import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/auth";
import { prisma } from "@/app/lib/prisma";

export async function GET() {
  const categories = await prisma.category.findMany({
    include: { subcategories: { orderBy: { name: "asc" } } },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(categories);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const role = (session?.user as { role?: string })?.role;
  if (role !== "owner" && role !== "manager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { name, type, emoji } = await req.json();
  if (!name || !type) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }
  try {
    const cat = await prisma.category.create({
      data: { name: name.trim(), type, emoji: emoji || null },
      include: { subcategories: true },
    });
    return NextResponse.json(cat, { status: 201 });
  } catch (e) {
    if ((e as { code?: string })?.code === "P2002") {
      return NextResponse.json({ error: "Nama kategori sudah ada" }, { status: 409 });
    }
    throw e;
  }
}