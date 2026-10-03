import { auth } from "@/app/auth";
import { redirect } from "next/navigation";
import AccountsClient from "@/app/components/AccountsClient";

export default async function AccountsPage() {
  const session = await auth();
  const role = (session?.user as { role?: string })?.role;
  if (role !== "owner" && role !== "manager") redirect("/dashboard");
  return <AccountsClient />;
}