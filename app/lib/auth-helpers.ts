import { auth } from "@/app/auth";
import { redirect } from "next/navigation";

// Redirect ke login kalo belum auth
export async function requireAuth() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return session;
}

// Hanya owner yang boleh akses
export async function requireOwner() {
  const session = await requireAuth();
  const role = (session.user as { role?: string })?.role;
  if (role !== "owner") redirect("/dashboard");
  return session;
}

// Owner atau manager
export async function requireUser() {
  const session = await requireAuth();
  const role = (session.user as { role?: string })?.role;
  if (role !== "owner" && role !== "manager") redirect("/login");
  return session;
}

// Helper API: true kalau session boleh kelola akun & kategori (owner/manager)
export async function canManage() {
  const session = await auth();
  const role = (session?.user as { role?: string })?.role;
  return role === "owner" || role === "manager";
}
