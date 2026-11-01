import { MJOLMILE_SYSTEM_PROMPT } from "./persona";
import {
  AGENT_TOOLS,
  getCategoryBreakdown,
  getMonthlySeries,
  getSummary,
  getBalances,
  searchTransactions,
  type AgentToolName,
  type AgentUser,
} from "./tools";

/**
 * Mjolmile chat engine.
 * Alur: system prompt + hasil tool (angka dari DB, dihitung kode) -> LLM lokal -> jawaban.
 * LLM TIDAK PERNAH mengenerate angka sendiri; kalau gateway mati, fallback deterministik.
 */

const BASE_URL = process.env.LOCAL_LLM_BASE_URL || "http://127.0.0.1:20128/v1";
const API_KEY = process.env.LOCAL_LLM_API_KEY || "";
const MODEL = process.env.LOCAL_LLM_MODEL || "Combo";
const TIMEOUT_MS = Number(process.env.LOCAL_LLM_TIMEOUT_MS || 45000);

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ToolCallPlan {
  tool: AgentToolName;
  args: Record<string, unknown>;
}

/** Planner: LLM memilih tool + argumen (JSON murni), TIDAK menjawab langsung. */
export async function planTools(
  message: string,
  history: ChatMessage[],
  langHint: string,
): Promise<ToolCallPlan[]> {
  const toolSpec = `Available tools:
- get_summary {from?: "YYYY-MM-DD", to?: "YYYY-MM-DD"} — totals: income, expense, net, savingsRate, avgExpensePerDay, count for a date range (no range = all time)
- get_balances {} — current balance per account + total assets/liabilities
- get_category_breakdown {type?: "Expense"|"Income", from?, to?} — top categories with % change vs previous period
- search_transactions {query?, type?, from?, to?, limit?} — find transactions by note/category/subcategory keyword
- get_monthly_series {months?: number} — monthly income/expense/net trend (default 12)`;

  const sys = `${MJOLMILE_SYSTEM_PROMPT}

## Your task NOW
You are the PLANNER, not the answerer. Read the user's message and decide which tool calls are needed to gather the NUMBERS for answering. Respond ONLY with a JSON array, no prose, no markdown fence:
[{"tool": "tool_name", "args": {...}}]
Rules:
- 1-2 calls max. Omit optional args unless the user clearly specifies a period/type/keyword.
- Relative periods: "bulan ini" = ${langHint}; for "bulan lalu" use the first and last day of last month.
- If the user only greets or chats with no data need, return [].
- If intent is unclear, pick the single most likely tool.

${toolSpec}`;

  const messages = [
    { role: "system", content: sys },
    ...history.slice(-4).map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: message },
  ];

  const raw = await callLLM(messages, 500);
  const jsonStart = raw.indexOf("[");
  const jsonEnd = raw.lastIndexOf("]");
  if (jsonStart === -1 || jsonEnd === -1) return [];
  try {
    const arr = JSON.parse(raw.slice(jsonStart, jsonEnd + 1)) as ToolCallPlan[];
    const valid = arr
      .filter((p) => p && typeof p.tool === "string" && p.tool in AGENT_TOOLS)
      .slice(0, 2);
    return valid;
  } catch {
    return [];
  }
}

/** Eksekusi plan → hasil tool (angka verifikasi dari DB). */
export async function executeTools(plan: ToolCallPlan[], user: AgentUser) {
  const results: { tool: string; data: unknown }[] = [];
  const userMsg = user.role === "owner" ? "owner view (all users)" : "own data only";
  for (const p of plan.slice(0, 2)) {
    try {
      const data = await dispatchTool(p.tool, p.args || {}, user);
      results.push({ tool: p.tool, data });
    } catch (e) {
      results.push({ tool: p.tool, data: { error: String(e), note: userMsg } });
    }
  }
  return results;
}

/** dispatch: peta args objek -> parameter posisi tiap tool. */
async function dispatchTool(
  tool: string,
  args: Record<string, unknown>,
  user: AgentUser,
): Promise<unknown> {
  const s = (v: unknown): string | undefined =>
    typeof v === "string" && v.trim() ? v.trim() : undefined;
  const n = (v: unknown): number | undefined =>
    typeof v === "number" && Number.isFinite(v) ? v : undefined;
  switch (tool) {
    case "get_summary":
      return getSummary(user, s(args.from), s(args.to));
    case "get_balances":
      return getBalances(user);
    case "get_category_breakdown": {
      const type = args.type === "Income" ? "Income" : "Expense";
      return getCategoryBreakdown(user, type, s(args.from), s(args.to));
    }
    case "search_transactions":
      return searchTransactions(
        user,
        s(args.query),
        typeof args.type === "string" ? args.type : undefined,
        s(args.from),
        s(args.to),
        n(args.limit) ?? 20,
      );
    case "get_monthly_series":
      return getMonthlySeries(user, n(args.months) ?? 12);
    default:
      throw new Error(`Unknown tool: ${tool}`);
  }
}

/** Jawaban final: LLM merangkai bahasa dari angka tool. */
export async function composeAnswer(
  message: string,
  history: ChatMessage[],
  toolResults: { tool: string; data: unknown }[],
  langHint: string,
): Promise<string> {
  const sys = `${MJOLMILE_SYSTEM_PROMPT}

## Context
- Current date: ${langHint}
- Tool results below are VERIFIED numbers computed from the dashboard database. Quote only these figures.
- If results contain an "error" field, tell the user which data could not be retrieved — do not guess.`;

  const messages = [
    { role: "system", content: sys },
    ...history.slice(-6).map((m) => ({ role: m.role, content: m.content })),
    {
      role: "user",
      content: `[TOOL RESULTS]\n${JSON.stringify(toolResults)}\n\n[USER MESSAGE]\n${message}`,
    },
  ];

  return callLLM(messages, 700);
}

/** Fallback deterministik — gateway mati / LLM gagal: jawab dari angka tool mentah. */
export function deterministicAnswer(
  toolResults: { tool: string; data: unknown }[],
  isEnglish: boolean,
): string {
  if (!toolResults.length) {
    return isEnglish
      ? "LLM gateway is unreachable and I could not determine which data to fetch. Try rephrasing with a period (e.g. this month). — Mjolmile (deterministic mode)"
      : "Gateway LLM tidak terjangkau dan aku tidak bisa menentukan data yang dimaksud. Coba sebutkan periode (mis. bulan ini). — Mjolmile (mode deterministik)";
  }
  const lines: string[] = [];
  for (const r of toolResults) {
    if (r.tool === "get_summary") {
      const d = r.data as Record<string, number | null>;
      const fmt = (v: unknown) => `Rp ${Math.round(Number(v || 0)).toLocaleString("id-ID")}`;
      lines.push(
        isEnglish
          ? `Income ${fmt(d.income)} · Expense ${fmt(d.expense)} · Net ${fmt(d.net)} (${d.savingsRate == null ? "n/a" : `${Number(d.savingsRate).toFixed(1)}%`}) · ${d.count} tx (${d.from} → ${d.to})`
          : `Pemasukan ${fmt(d.income)} · Pengeluaran ${fmt(d.expense)} · Bersih ${fmt(d.net)} (${d.savingsRate == null ? "n/a" : `${Number(d.savingsRate).toFixed(1)}%`}) · ${d.count} tx (${d.from} → ${d.to})`,
      );
    } else if (r.tool === "get_balances") {
      const d = r.data as { total: number; accounts: { name: string; balance: number }[] };
      const fmt = (v: number) => `Rp ${Math.round(v).toLocaleString("id-ID")}`;
      lines.push(
        `${isEnglish ? "Total balance" : "Total saldo"}: ${fmt(d.total)} — ` +
          d.accounts.map((a) => `${a.name} ${fmt(a.balance)}`).join(" · "),
      );
    } else if (r.tool === "get_monthly_series") {
      const d = r.data as { series: { month: string; income: number; expense: number; net: number }[] };
      const last = d.series.filter((s) => s.income || s.expense).slice(-3);
      for (const s of last) {
        const fmt = (v: number) => `Rp ${Math.round(v).toLocaleString("id-ID")}`;
        lines.push(`${s.month}: +${fmt(s.income)} / −${fmt(s.expense)} = ${fmt(s.net)}`);
      }
    } else {
      lines.push(JSON.stringify(r.data).slice(0, 600));
    }
  }
  return (
    (isEnglish ? "(deterministic mode — LLM offline)\n" : "(mode deterministik — LLM offline)\n") +
    lines.join("\n") +
    "\n— Mjolmile"
  );
}

/** Client gateway OpenAI-compatible lokal (model Combo => gemini-3.8-flash). */
async function callLLM(
  messages: { role: string; content: string }[],
  maxTokens: number,
): Promise<string> {
  if (!API_KEY) throw new Error("LOCAL_LLM_API_KEY not set");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ model: MODEL, messages, max_tokens: maxTokens }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
    // Gateway kadang menambahkan jejak SSE ("data: [DONE]") pada respons non-stream.
    const raw = await res.text();
    const body = raw.split("data: [DONE]")[0].trim();
    const json = extractLastJson(body);
    const msg = json?.choices?.[0]?.message;
    const content = msg?.content || msg?.reasoning_content || "";
    if (!content) throw new Error("LLM empty content");
    return content.trim();
  } finally {
    clearTimeout(timer);
  }
}

function extractLastJson(body: string): {
  choices?: { message?: { content?: string | null; reasoning_content?: string | null } }[];
} | null {
  // Normal: satu objek JSON (mungkin diawali teks/whitespace).
  const first = body.search(/[[{]/);
  if (first === -1) return null;
  try {
    return JSON.parse(body.slice(first));
  } catch {
    // LANGKA: JSON tergabung {"..."}{"..."} - lewati objek pertama (balanced), parse sisanya.
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let i = first; i < body.length; i++) {
      const ch = body[i];
      if (esc) { esc = false; continue; }
      if (ch === "\\") { esc = true; continue; }
      if (ch === '"') inStr = !inStr;
      if (inStr) continue;
      if (ch === "{" || ch === "[") depth++;
      else if (ch === "}" || ch === "]") {
        depth--;
        if (depth === 0) {
          const rest = body.slice(i + 1);
          const next = rest.search(/[[{]/);
          if (next === -1) return null;
          return extractLastJson(rest.slice(next));
        }
      }
    }
    return null;
  }
}
