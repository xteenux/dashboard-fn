import { auth } from "@/app/auth";
import { redirect } from "next/navigation";
import CategoriesClient from "@/app/components/CategoriesClient";

export default async function CategoriesPage() {
  const session = await auth();
  const role = (session?.user as { role?: string })?.role;
  if (role !== "owner" && role !== "manager") redirect("/dashboard");
  return <CategoriesClient />;
}