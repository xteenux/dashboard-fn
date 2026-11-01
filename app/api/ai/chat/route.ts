import { NextRequest, NextResponse } from "next/server";
import { getApiUser } from "@/app/lib/api-auth";
import { executeTools, composeAnswer, deterministicAnswer, type ChatMessage } from "@/app/lib/ai/chat";
import type { AgentToolName } from "@/app/lib/ai/tools";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/ai/chat  { message: string, history?: ChatMessage[] }
 * -> { reply: string, mode: "llm" | "deterministic", tools?: string[] }
 * Read-only: hanya tool query data (lihat app/lib/ai/tools.ts). Tidak ada write.
 */
export async function POST(req: NextRequest) {
  const user = await getApiUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { message?: string; history?: ChatMessage[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const message = (body.message || "").toString().trim();
  if (!message) return NextResponse.json({ error: "Message required" }, { status: 400 });
  if (message.length > 2000) return NextResponse.json({ error: "Message too long" }, { status: 400 });
  const history = Array.isArray(body.history)
    ? body.history
        .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
        .slice(-8)
    : [];

  const langHint = `today is ${new Date().toISOString().slice(0, 10)}`;

  // 1) Plan tools — heuristic deterministik (tanpa LLM: cepat & murah).
  // planTools (LLM) ada di chat.ts sebagai eksperimen; hasilnya lambat (reasoning overhead).
  const plan: { tool: AgentToolName; args: Record<string, unknown> }[] = heuristicPlan(message);

  // 2) Eksekusi tool (angka dari DB — selalu benar)
  const toolResults = plan.length ? await executeTools(plan, user) : [];

  // 3) Jawab — LLM merangkai; gateway gagal -> deterministik
  try {
    const reply = await composeAnswer(message, history, toolResults, langHint);
    return NextResponse.json({ reply, mode: "llm", tools: plan.map((p) => p.tool) });
  } catch {
    return NextResponse.json({
      reply: deterministicAnswer(toolResults, false),
      mode: "deterministic",
      tools: plan.map((p) => p.tool),
    });
  }
}

/** Deteksi intent sederhana tanpa LLM — dipakai saat planner offline / gagal. */
function heuristicPlan(message: string): { tool: AgentToolName; args: Record<string, unknown> }[] {
  const t = message.toLowerCase();
  const plans: { tool: AgentToolName; args: Record<string, unknown> }[] = [];

  const wantsBalance = /(saldo|balance|bank|rekening|account)/.test(t);
  const wantsTrend = /(tren|trend|bulanan|monthly|per bulan)/.test(t);
  const wantsCategories = /(kategori|category|pengeluaran terbesar|paling besar|top)/.test(t);
  const wantsSearch = /(cari|search|transaksi .*di|belanja|jajan|kopi|subscription)/.test(t);

  if (wantsBalance) plans.push({ tool: "get_balances", args: {} });
  if (wantsTrend) plans.push({ tool: "get_monthly_series", args: { months: 12 } });
  if (wantsCategories) plans.push({ tool: "get_category_breakdown", args: { type: "Expense" } });
  if (wantsSearch) {
    // Ekstrak keyword: teks setelah "cari"/"kata"/"soal", buang stop words umum.
    const m = t.match(/(?:cari|search)(?:\s+transaksi)?(?:\s+(?:yang\s+)?ada\s+kata(?:\s+\w+)?)?\s+(.+?)[?.!]*$/);
    let q = m?.[1]?.trim();
    if (q) {
      const stop = new Set(["yang", "ada", "kata", "transaksi", "dengan", "note", "catatan", "tentang"]);
      q = q.split(/\s+/).filter((w) => !stop.has(w)).join(" ") || undefined;
    }
    plans.push({ tool: "search_transactions", args: { query: q, limit: 10 } });
  }
  if (!plans.length) {
    plans.push({ tool: "get_summary", args: currentMonthRange() });
  }
  return plans.slice(0, 2);
}

function currentMonthRange(): Record<string, unknown> {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(from), to: iso(to) };
}
