import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/auth";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { resolvePlanConfig, DEFAULT_PLAN_CONFIG } from "@/app/lib/plan-config";

export const runtime = "nodejs";

const CONFIG_PATH = path.join(process.cwd(), "data", "plan-config.json");

async function readStored(): Promise<Record<string, unknown> | null> {
  try {
    if (!existsSync(CONFIG_PATH)) return null;
    const raw = await readFile(CONFIG_PATH, "utf-8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** GET /api/plan-config -> konfigurasi aktif (stored override, fallback default). */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json(DEFAULT_PLAN_CONFIG);
  const stored = await readStored();
  return NextResponse.json(resolvePlanConfig(stored));
}

/** PUT /api/plan-config { ...PlanConfig } — hanya owner; merge default + simpan file. */
export async function PUT(req: NextRequest) {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (role !== "owner") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const cfg = resolvePlanConfig(body as Record<string, unknown>);
  await mkdir(path.dirname(CONFIG_PATH), { recursive: true });
  await writeFile(CONFIG_PATH, JSON.stringify(cfg, null, 2), "utf-8");
  return NextResponse.json(cfg);
}