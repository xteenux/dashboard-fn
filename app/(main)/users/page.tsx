import { auth } from "@/app/auth";
import { prisma } from "@/app/lib/prisma";
import { redirect } from "next/navigation";
import { UserManagement } from "@/app/components/UserManagement";

export default async function UsersPage() {
  const session = await auth();
  const role = (session?.user as { role?: string })?.role;
  if (role !== "owner") redirect("/dashboard");

  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true },
  });
  return <UserManagement users={users} />;
}
