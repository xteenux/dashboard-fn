import { auth } from "@/app/auth";
import { getDashboardData } from "@/app/lib/data";
import { getAccountBalances } from "@/app/lib/balances";
import { DashboardClient } from "@/app/components/DashboardClient";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { resolvePlanConfig } from "@/app/lib/plan-config";

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

  const [data, balances] = await Promise.all([
    getDashboardData(params, currentUser),
    getAccountBalances(),
  ]);

  // Plan config (rasio engine AI) — file-based, owner-editable via PlanSettings.
  let planConfig: Record<string, unknown> | null = null;
  try {
    const cfgPath = path.join(process.cwd(), "data", "plan-config.json");
    if (existsSync(cfgPath)) {
      planConfig = JSON.parse(await readFile(cfgPath, "utf-8"));
    }
  } catch {
    planConfig = null;
  }

  return (
    <DashboardClient
      data={data}
      balances={balances}
      currentUser={currentUser}
      planConfig={resolvePlanConfig(planConfig)}
    />
  );
}