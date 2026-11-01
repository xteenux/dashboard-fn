import { NextRequest, NextResponse } from "next/server";
import { getApiUser } from "@/app/lib/api-auth";
import { prisma } from "@/app/lib/prisma";
import {
  buildPreview,
  dupKey,
  gridToRows,
  isFluxoHeader,
  markDuplicates,
  parseFluxo,
  type ImportPreviewItem,
  type RawBankRow,
} from "@/app/lib/import-parse";

export const runtime = "nodejs";
export const maxDuration = 60;

const BASE_URL = process.env.LOCAL_LLM_BASE_URL || "http://127.0.0.1:20128/v1";
const API_KEY = process.env.LOCAL_LLM_API_KEY || "";
const MODEL = process.env.LOCAL_LLM_MODEL || "Combo";
const TIMEOUT_MS = Number(process.env.LOCAL_LLM_TIMEOUT_MS || 30000);

/** Ambil semua kategori (nama) + akun untuk dipakai klasifikasi & tampilan. */
async function loadRefs() {
  const [categories, accounts] = await Promise.all([
    prisma.category.findMany({ select: { id: true, name: true, type: true } }),
    prisma.account.findMany({ select: { id: true, name: true } }),
  ]);
  return { categories, accounts };
}

/** Duplikat set dari DB existing (untuk deteksi duplikat). */
async function loadExistingKeys(userId: string) {
  const txs = await prisma.transaction.findMany({
    where: { userId },
    select: { date: true, amount: true, note: true, description: true },
  });
  const keys = new Set<string>();
  for (const t of txs) {
    const desc = t.note || t.description || "";
    const key = dupKey(t.date.toISOString(), t.amount, desc);
    keys.add(key);
  }
  return keys;
}

/** LLM: ubah teks mentah statement (PDF/teks) -> array baris bank. */
async function llmStatementToRows(text: string): Promise<RawBankRow[]> {
  if (!API_KEY) throw new Error("LLM API key not configured");
  const sys = `You are a bank statement parser. Convert the raw statement text into a JSON array of rows.
Each row: {"date": "YYYY-MM-DD" or null, "description": string, "debit": number (money out, positive, else 0), "credit": number (money in, positive, else 0)}.
Rules:
- Amounts are in IDR, strip currency symbols and thousand separators.
- "debit" = money leaving (expense/withdrawal); "credit" = money entering (deposit/income).
- If a line is a balance total or header, skip it.
- If a date is missing, set date to null.
- description = clean short merchant/note, no trailing punctuation.
Output ONLY a JSON array, no markdown fence, no surrounding text.`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "system", content: sys }, { role: "user", content: text.slice(0, 12000) }],
        max_tokens: 2000,
        temperature: 0.1,
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
    const raw = await res.text();
    const bodyText = raw.split("data: [DONE]")[0].trim();
    const js = bodyText.search(/\[/);
    const je = bodyText.lastIndexOf("]");
    if (js === -1 || je === -1) throw new Error("No JSON array in LLM response");
    const outer = JSON.parse(bodyText.slice(js));
    const content = outer?.choices?.[0]?.message?.content || outer?.choices?.[0]?.message?.reasoning_content || "";
    const as = content.search(/\[/);
    const ae = content.lastIndexOf("]");
    const arr = as !== -1 && ae !== -1 ? JSON.parse(content.slice(as, ae + 1)) : outer;
    if (!Array.isArray(arr)) throw new Error("LLM did not return a row array");
    return arr.map((r: Record<string, unknown>) => ({
      date: typeof r.date === "string" && /^\d{4}-\d{2}-\d{2}/.test(r.date) ? r.date.slice(0, 10) : null,
      description: String(r.description || "").trim(),
      debit: Math.abs(Number(r.debit) || 0),
      credit: Math.abs(Number(r.credit) || 0),
    }));
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(req: NextRequest) {
  const user = await getApiUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form" }, { status: 400 });
  }

  const file = form.get("file") as File | null;
  const accountName = (form.get("accountName") as string | null) || "";
  if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

  const name = file.name.toLowerCase();
  const isCsv = name.endsWith(".csv") || name.endsWith(".txt");
  const isXls = name.endsWith(".xlsx") || name.endsWith(".xls");
  const isPdf = name.endsWith(".pdf");
  if (!isCsv && !isXls && !isPdf) {
    return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const { categories, accounts } = await loadRefs();
  const existingKeys = await loadExistingKeys(user.id);
  const defaultDate = new Date().toISOString().slice(0, 10);
  let items: ImportPreviewItem[] = [];
  let fluxo = false;

  try {
    if (isCsv || isXls) {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
      const wsName = wb.SheetNames[0];
      const sheet = wb.Sheets[wsName];
      const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" }) as (string | number)[][];
      if (aoa.length && isFluxoHeader(aoa[0])) {
        fluxo = true;
        const cats = categories as unknown as { id: string; name: string; type: string; emoji?: string | null }[];
        items = parseFluxo(aoa, cats);
        items = markDuplicates(items, existingKeys);
      } else {
        const rows = gridToRows(aoa);
        items = buildPreview(rows, categories.map((c) => c.name), existingKeys, defaultDate);
      }
    } else if (isPdf) {
      const pdfParse = (await import("pdf-parse")).default;
      const data = await pdfParse(buf);
      const rows = await llmStatementToRows(data.text || "");
      items = buildPreview(rows, categories.map((c) => c.name), existingKeys, defaultDate);
    }
  } catch (e) {
    return NextResponse.json({ error: `Parse failed: ${String(e)}` }, { status: 422 });
  }

  if (!items.length) {
    return NextResponse.json({ error: "No recognizable transactions in file" }, { status: 422 });
  }

  const totals = items.reduce(
    (acc, it) => {
      if (it.type === "Income") acc.incoming += it.amount;
      else if (it.type === "Expense") acc.outgoing += it.amount;
      else if (it.type === "Transfer-Out") acc.transfer += it.amount;
      if (it.duplicate) acc.duplicates++;
      return acc;
    },
    { incoming: 0, outgoing: 0, transfer: 0, duplicates: 0 },
  );

  return NextResponse.json({
    sourceFile: file.name,
    accountName,
    fluxo,
    items,
    totals,
    categories,
    accounts,
  });
}