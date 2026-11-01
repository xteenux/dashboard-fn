import { NextRequest, NextResponse } from "next/server";
import { getApiUser } from "@/app/lib/api-auth";
import { prisma } from "@/app/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 60;

const BASE_URL = process.env.LOCAL_LLM_BASE_URL || "http://127.0.0.1:20128/v1";
const API_KEY = process.env.LOCAL_LLM_API_KEY || "";
const MODEL = process.env.LOCAL_LLM_MODEL || "Combo";
const TIMEOUT_MS = Number(process.env.LOCAL_LLM_TIMEOUT_MS || 30000);

/**
 * POST /api/ai/parse-tx  { text: string }
 * -> { amount, type, categoryName, merchantLabel, dateISO, accountName, reasoning, confidence }
 * Mjolmile AI semantic extractor — membaca teks input secara natural, cocokkan ke DB categories/accounts asli.
 */
export async function POST(req: NextRequest) {
  const user = await getApiUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { text?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const text = (body.text || "").toString().trim();
  if (!text) return NextResponse.json({ error: "Text required" }, { status: 400 });
  if (text.length > 500) return NextResponse.json({ error: "Text too long" }, { status: 400 });

  // 1) Ambil daftar kategori dan akun asli di DB
  const [categories, accounts] = await Promise.all([
    prisma.category.findMany({ select: { name: true, type: true } }),
    prisma.account.findMany({ select: { name: true } }),
  ]);

  const catList = categories.map((c) => `${c.name} [${c.type}]`).join(", ");
  const acctList = accounts.map((a) => a.name).join(", ");
  const today = new Date().toISOString().slice(0, 10);

  const sys = `You are Mjolmile, the expert commerce steward and financial parser.
Your task: parse a natural language transaction description (in Indonesian or English) and extract structured transaction fields.

CURRENT DATE: ${today}
AVAILABLE CATEGORIES (with their allowed types):
${catList}

AVAILABLE ACCOUNTS:
${acctList}

RULES:
1. Determine "type":
   - "Income": receiving money, salary, paybacks, allowances, gifts received, selling items. E.g. "menerima 10000 dari teman", "gaji 5jt", "dapat transfer", "cair", "masuk".
   - "Expense": spending, buying, paying bills, eating, rides, subscriptions. E.g. "makan siang 35rb", "beli baju", "bayar wifi".
   - "Transfer-Out": moving money between the user's OWN accounts (both accounts in AVAILABLE ACCOUNTS). E.g. "transfer 200rb dari BCA ke Jago", "tf 500k to Mandiri", "pindah 1jt ke Blu by BCA".
   - IMPORTANT: "menerima/dapat transfer dari teman" is INCOME (money incoming), NOT Transfer-Out. Transfer-Out is ONLY moving between the user's own accounts.
2. Determine "amount" (number in IDR, no currency symbols). E.g. "10000" -> 10000, "35rb" / "35k" -> 35000, "10jt" -> 10000000, "$18.40" -> 276000 (x15000).
3. Determine "categoryName" EXACTLY MATCHING one from the AVAILABLE CATEGORIES list above (including emoji), and the category's type MUST match the transaction type.
   - For "menerima ... dari teman" -> "💵Payback" or "Other" (type income). NEVER choose an expense category for Income!
   - For food/eating/coffee -> "🍜 Food" (type expense).
   - For salary -> "💰 Salary" (type income).
   - For Transfer-Out -> "Transfer" (type transfer). Do NOT pick income/expense category.
4. Determine "dateISO" in YYYY-MM-DD format (relative to today ${today}; "kemarin" = yesterday, "2 hari lalu" = 2 days ago).
5. Determine "accountName": the SOURCE account (from which money leaves) — one from AVAILABLE ACCOUNTS. For "transfer dari BCA ke Jago", accountName = "BCA".
6. Determine "destAccountName": the DESTINATION account (money goes to) — one from AVAILABLE ACCOUNTS. ONLY for Transfer-Out. For "transfer dari BCA ke Jago", destAccountName = "Jago". For Income/Expense, set destAccountName to "".
7. Determine "merchantLabel": short clean title (e.g. "Dari teman", "Makan siang", "Listrik", "Transfer ke Jago").
8. Output MUST be a SINGLE JSON object, no markdown fence, no surrounding text:
{"amount": number, "type": "Expense"|"Income"|"Transfer-Out", "categoryName": string, "merchantLabel": string, "dateISO": "YYYY-MM-DD", "accountName": string, "destAccountName": string, "confidence": number, "reasoning": string}`;

  if (!API_KEY) {
    return NextResponse.json({ error: "LLM API key not configured" }, { status: 500 });
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: text },
        ],
        max_tokens: 400,
        temperature: 0.1,
      }),
      signal: ctrl.signal,
    });

    if (!res.ok) {
      return NextResponse.json({ error: `LLM HTTP ${res.status}` }, { status: 502 });
    }

    const raw = await res.text();
    const bodyText = raw.split("data: [DONE]")[0].trim();
    const jsonStart = bodyText.search(/\{/);
    const jsonEnd = bodyText.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1) {
      return NextResponse.json({ error: "Failed to parse LLM JSON" }, { status: 502 });
    }

    // Ekstrak pesan dari payload response gateway
    let parsed: Record<string, unknown>;
    try {
      const outer = JSON.parse(bodyText.slice(jsonStart));
      const content =
        outer?.choices?.[0]?.message?.content ||
        outer?.choices?.[0]?.message?.reasoning_content ||
        "";
      const innerStart = content.search(/\{/);
      const innerEnd = content.lastIndexOf("}");
      if (innerStart !== -1 && innerEnd !== -1) {
        parsed = JSON.parse(content.slice(innerStart, innerEnd + 1));
      } else {
        // gateway mungkin me-return objek langsung
        parsed = outer;
      }
    } catch {
      return NextResponse.json({ error: "Invalid LLM payload" }, { status: 502 });
    }

    // Validasi & fallback kategori agar cocok tipe
    const typeWo = String(parsed.type || "Expense");
    const resolvedType = typeWo === "Income" ? "Income" : typeWo === "Transfer-Out" ? "Transfer-Out" : "Expense";
    const expectedCatType = resolvedType === "Income" ? "income" : resolvedType === "Transfer-Out" ? "transfer" : "expense";
    const validCat = categories.find((c) => c.name === parsed.categoryName);
    let finalCat = validCat?.name;
    if (!finalCat || (validCat && validCat.type !== expectedCatType)) {
      // Auto-fallback kategori yang valid tipenya
      const fallback = categories.find((c) => c.type === expectedCatType)
        || categories.find((c) => c.type === (resolvedType === "Income" ? "income" : "expense"));
      finalCat = fallback?.name || (resolvedType === "Income" ? "Other" : "🍜 Food");
    }

    // Akun tujuan (khusus Transfer-Out)
    const destName = typeof parsed.destAccountName === "string" ? parsed.destAccountName : "";
    const finalDest = resolvedType === "Transfer-Out" && destName && accounts.some((a) => a.name === destName)
      ? destName
      : (resolvedType === "Transfer-Out" && destName && accounts.some((a) => a.name === parsed.accountName) && destName === parsed.accountName ? "" : (resolvedType === "Transfer-Out" ? destName : ""));

    // Amount: bila LLM return 0 padahal user tidak sebut angka, null-kan agar user ketik
    const rawAmt = typeof parsed.amount === "number" ? parsed.amount : null;
    const finalAmount = rawAmt && rawAmt > 0 ? rawAmt : null;

    return NextResponse.json({
      amount: finalAmount,
      type: resolvedType,
      categoryName: finalCat,
      merchantLabel: String(parsed.merchantLabel || "Transaksi"),
      dateISO: String(parsed.dateISO || today).slice(0, 10),
      accountName: accounts.some((a) => a.name === parsed.accountName)
        ? parsed.accountName
        : accounts[0]?.name || "BCA",
      destAccountName: finalDest,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.85,
      reasoning: String(parsed.reasoning || "Dianalisis oleh Mjolmile"),
      source: "mjolmile-ai",
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  } finally {
    clearTimeout(timer);
  }
}
