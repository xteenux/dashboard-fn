import { auth } from "@/app/auth";
import { getDashboardData } from "@/app/lib/data";
import { DashboardClient } from "@/app/components/DashboardClient";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; userId?: string }>;
}) {
  const params = await searchParams;
  const session = await auth();
  const currentUser = session?.user
    ? {
        id: (session.user as { id?: string })?.id as string,
        role: (session.user as { role?: string })?.role as string,
      }
    : undefined;

  const data = await getDashboardData(params, currentUser);
  return <DashboardClient data={data} currentUser={currentUser} />;
}