import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/auth";
import { prisma } from "@/app/lib/prisma";

// POST body: { name, categoryId }
export async function POST(req: NextRequest) {
  const session = await auth();
  const role = (session?.user as { role?: string })?.role;
  if (role !== "owner" && role !== "manager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { name, categoryId } = await req.json();
  if (!name || !categoryId) {
    return NextResponse.json({ error: "Missing name/categoryId" }, { status: 400 });
  }
  try {
    const sub = await prisma.subcategory.create({
      data: { name, categoryId },
      include: { category: true },
    });
    return NextResponse.json(sub, { status: 201 });
  } catch (e: any) {
    if (e?.code === "P2002") {
      return NextResponse.json({ error: "Subkategori ini sudah ada" }, { status: 409 });
    }
    return NextResponse.json({ error: "Category not found" }, { status: 400 });
  }
}

// PUT body: { id, name }
export async function PUT(req: NextRequest) {
  const { id, name } = await req.json();
  if (!id || !name) {
    return NextResponse.json({ error: "Missing id/name" }, { status: 400 });
  }
  const sub = await prisma.subcategory.update({
    where: { id },
    data: { name },
    include: { category: true },
  });
  return NextResponse.json(sub);
}

// DELETE via query ?id=
export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  await prisma.subcategory.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}