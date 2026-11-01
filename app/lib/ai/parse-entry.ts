/**
 * Parser natural language entry — deterministik (regex), cepat & aman.
 * Ekstrak: amount, type (Expense/Income/Transfer-Out), category hint, label/merchant,
 * date, account hint (asal), destAccount hint (tujuan), confidence, reasoning.
 * Mendukung pola ID/EN:
 * - "burger 35rb tadi siang"
 * - "gaji 10jt"
 * - "transfer 200rb dari BCA ke Jago" / "tf 500k to Mandiri from BCA"
 * - "pindah 1jt ke Blu by BCA"
 */

export interface ParsedEntry {
  amount: number | null;
  type: "Expense" | "Income" | "Transfer-Out";
  categoryHint: string | null;
  merchantLabel: string;
  dateISO: string;
  accountHint: string | null; // akun sumber / asal
  destAccountHint: string | null; // akun tujuan (khusus Transfer-Out)
  confidence: number;
  reasoning: string[];
}

export interface ParseContext {
  categoryNames?: string[]; // semua nama kategori asli DB (expense + income + transfer)
  accountNames?: string[]; // semua nama akun asli DB
}

const KEYWORD_MAP: { cat: string; re: RegExp }[] = [
  { cat: "🍜 Food", re: /\b(makan|lunch|dinner|sarapan|kopi|coffee|cafe|warteg|burger|pizza|mie|bakso|food|resto|restoran|jajan|snack|tea|teh|starbucks|ayam|nasi|geprek|soto|sate)\b/i },
  { cat: "🚖 Transport", re: /\b(gojek|grab|uber|ojol|bensin|pertalite|pertamax|toll|tol|parkir|mrt|krl|transjakarta|kereta|pesawat|tiket|travel|transport)\b/i },
  { cat: "🛒Shop", re: /\b(belanja|tokopedia|shopee|lazada|mall|beli|baju|sepatu|shop|shopping|amazon|uniqlo|zara|groceries)\b/i },
  { cat: "🪑 Household", re: /\b(listrik|pln|pdam|air|wifi|indihome|biznet|pulsa|kuota|bpjs|tagihan|bill|rent|sewa|iuran|utilities)\b/i },
  { cat: "💰 Salary", re: /\b(gaji|salary|payroll|upah|bonus|thr|honor|fee|digaji)\b/i },
  { cat: "💵Payback", re: /\b(teman|friend|balikin|bayar balik|dibayar|dikasih|diberi|payback|dari teman|utang bayar|kembalian)\b/i },
  { cat: "🏦Finance", re: /\b(pinjam|hutang|loan|bayar utang|cicilan|kpr|topup|top up|isi saldo|investasi|bunga|admin)\b/i },
];

function normName(s: string): string {
  return s.replace(/[^\p{L}\p{N}]+/gu, "").toLowerCase();
}

function resolveCategory(hint: string, valid: string[] | undefined): string {
  if (!valid?.length) return hint;
  if (valid.includes(hint)) return hint;
  const nHint = normName(hint);
  const hit = valid.find((v) => normName(v) === nHint);
  return hit || hint;
}

export function parseNaturalLanguageEntry(
  text: string,
  referenceDate: Date = new Date(),
  ctx: ParseContext = {},
): ParsedEntry {
  const raw = text.trim();
  const reasoning: string[] = [];
  let confidence = 0.5;

  // 1) Type: Transfer-Out > Income > Expense
  let type: "Expense" | "Income" | "Transfer-Out" = "Expense";
  const isTransfer = /\b(transfer|tf|pindah(kan)?|pindahin|kirim\s*(uang|dana)?\s*ke|move\s*(money)?\s*to)\b/i.test(raw);
  const isIncome = /\b(gaji|salary|terima|diterima|menerima|dapat|masuk|income|revenue|bonus|thr|cair|inflow|payback|bayar balik|dibayar|transferan masuk|kirim(an)? masuk|dikasih|diberi|digaji|honor|upah|jual|laku)\b/i.test(raw);

  if (isTransfer) {
    type = "Transfer-Out";
    reasoning.push(`tipe: Transfer-Out (kata kunci transfer antar-akun)`);
    confidence += 0.2;
  } else if (isIncome) {
    type = "Income";
    reasoning.push(`tipe: Income (kata kunci pendapatan)`);
    confidence += 0.1;
  } else {
    reasoning.push(`tipe: Expense (default pengeluaran)`);
  }

  // 2) Amount
  let amount: number | null = null;

  const jtMatch = raw.match(/(\d+(?:[.,]\d+)?)\s*(?:jt|juta|million|m)\b/i);
  if (jtMatch) {
    const v = parseFloat(jtMatch[1].replace(",", "."));
    amount = Math.round(v * 1_000_000);
    reasoning.push(`nominal: Rp ${amount.toLocaleString("id-ID")} — "${jtMatch[0]}"`);
    confidence += 0.25;
  }

  if (amount === null) {
    const kMatch = raw.match(/(\d+(?:[.,]\d+)?)\s*(?:k|rb|ribu|thousand)\b/i);
    if (kMatch) {
      const v = parseFloat(kMatch[1].replace(",", "."));
      amount = Math.round(v * 1_000);
      reasoning.push(`nominal: Rp ${amount.toLocaleString("id-ID")} — "${kMatch[0]}"`);
      confidence += 0.25;
    }
  }

  if (amount === null) {
    const rpMatch = raw.match(/(?:rp|idr)\.?\s*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?|\d+)/i);
    if (rpMatch) {
      const clean = rpMatch[1].replace(/\./g, "").replace(",", ".");
      amount = Math.round(parseFloat(clean));
      reasoning.push(`nominal: Rp ${amount.toLocaleString("id-ID")} — "${rpMatch[0]}"`);
      confidence += 0.25;
    }
  }

  if (amount === null) {
    const numMatch = raw.match(/\$\s*(\d+(?:[.,]\d+)?)/);
    if (numMatch) {
      const v = parseFloat(numMatch[1].replace(",", "."));
      amount = Math.round(v * 15000);
      reasoning.push(`nominal: Rp ${amount.toLocaleString("id-ID")} — "${numMatch[0]}" (kurs 15rb)`);
      confidence += 0.15;
    }
  }

  if (amount === null) {
    const plain = raw.match(/(?:^|\s)(\d{4,})(?:\.0+)?(?:\s|$)/);
    if (plain) {
      const v = parseInt(plain[1], 10);
      amount = v;
      reasoning.push(`nominal: Rp ${amount.toLocaleString("id-ID")} — "${plain[1]}"`);
      confidence += 0.2;
    }
  }

  // 3) Akun — khusus Transfer-Out coba ekstrak akun asal & tujuan
  let accountHint: string | null = null;
  let destAccountHint: string | null = null;

  if (ctx.accountNames?.length) {
    const acctsSorted = [...ctx.accountNames].sort((a, b) => b.length - a.length);

    if (type === "Transfer-Out") {
      for (const a of acctsSorted) {
        if (new RegExp(`(?:dari|from)\\s+${escapeRe(a)}\\b`, "i").test(raw)) {
          accountHint = a;
          break;
        }
      }
      for (const b of acctsSorted) {
        if (new RegExp(`(?:ke|to)\\s+${escapeRe(b)}\\b`, "i").test(raw)) {
          destAccountHint = b;
          break;
        }
      }

      if (!accountHint || !destAccountHint) {
        const lower = raw.toLowerCase();
        const found: { name: string; idx: number }[] = [];
        for (const name of acctsSorted) {
          const idx = lower.indexOf(name.toLowerCase());
          if (idx !== -1 && !found.some((f) => f.name === name)) {
            const overlap = found.some((f) => idx >= f.idx && idx < f.idx + f.name.length);
            if (!overlap) found.push({ name, idx });
          }
        }
        found.sort((a, b) => a.idx - b.idx);
        if (found.length >= 2) {
          accountHint = accountHint || found[0].name;
          destAccountHint = destAccountHint || found[found.length - 1].name;
        } else if (found.length === 1) {
          const single = found[0].name;
          const isTo = new RegExp(`(?:ke|to)\\s+${escapeRe(single)}\\b`, "i").test(raw);
          if (isTo) destAccountHint = single;
          else accountHint = single;
        }
      }

      if (accountHint && destAccountHint) {
        reasoning.push(`transfer: dari "${accountHint}" → ke "${destAccountHint}"`);
        confidence += 0.2;
      } else if (accountHint) {
        reasoning.push(`akun asal: "${accountHint}", akun tujuan: belum terdeteksi`);
        confidence += 0.05;
      } else if (destAccountHint) {
        reasoning.push(`akun tujuan: "${destAccountHint}", akun asal: default`);
        confidence += 0.05;
      }
    } else {
      const lower = raw.toLowerCase();
      const hits = acctsSorted.filter((n) => lower.includes(n.toLowerCase()));
      if (hits.length) {
        accountHint = hits[0];
        reasoning.push(`akun: terdeteksi "${accountHint}"`);
        confidence += 0.1;
      } else {
        reasoning.push(`akun: tidak disebut — default pertama`);
      }
    }
  }

  // 4) Kategori
  let categoryHint: string | null = null;
  if (type === "Transfer-Out") {
    const txCat = ctx.categoryNames?.find(
      (c) => normName(c) === "transfer" || /transfer/i.test(c),
    );
    categoryHint = txCat || "Transfer";
    reasoning.push(`kategori: otomatis "${categoryHint}" (tipe transfer)`);
    confidence += 0.1;
  } else {
    for (const item of KEYWORD_MAP) {
      if (item.re.test(raw)) {
        categoryHint = resolveCategory(item.cat, ctx.categoryNames);
        reasoning.push(`kategori: cocok "${categoryHint}" dari kata kunci`);
        confidence += 0.15;
        break;
      }
    }
    if (!categoryHint) {
      categoryHint = null;
      reasoning.push(`kategori: tidak terdeteksi — pilih manual`);
    }
  }

  // 5) Tanggal
  const NUM_WORDS: Record<string, number> = {
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
    satu: 1, dua: 2, tiga: 3, empat: 4, lima: 5,
  };
  const targetDate = new Date(referenceDate);
  if (/\b(kemarin|yesterday)\b/i.test(raw)) {
    targetDate.setDate(targetDate.getDate() - 1);
    reasoning.push(`tanggal: kemarin (${targetDate.toISOString().slice(0, 10)})`);
    confidence += 0.1;
  } else {
    const daysAgo = raw.match(/(\d+|one|two|three|four|five|six|seven|satu|dua|tiga|empat|lima)\s*(?:hari lalu|days? ago)/i);
    if (daysAgo) {
      const d = /^\d+$/.test(daysAgo[1]) ? parseInt(daysAgo[1], 10) : NUM_WORDS[daysAgo[1].toLowerCase()] ?? 1;
      targetDate.setDate(targetDate.getDate() - d);
      reasoning.push(`tanggal: ${d} hari lalu (${targetDate.toISOString().slice(0, 10)})`);
      confidence += 0.1;
    } else {
      reasoning.push(`tanggal: hari ini`);
    }
  }
  const dateISO = targetDate.toISOString().slice(0, 10);

  // 6) Merchant / label ringkas
  let label = raw;
  if (accountHint) {
    label = label.replace(new RegExp(`\\b(pake|pakai|via|lewat|dari|from|with|on)\\s+${escapeRe(accountHint)}\\b`, "gi"), "");
    label = label.replace(new RegExp(escapeRe(accountHint), "gi"), "");
  }
  if (destAccountHint) {
    label = label.replace(new RegExp(`\\b(ke|to)\\s+${escapeRe(destAccountHint)}\\b`, "gi"), "");
    label = label.replace(new RegExp(escapeRe(destAccountHint), "gi"), "");
  }
  label = label
    .replace(/(?:rp|idr)\.?\s*[\d.,]+/gi, "")
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:jt|juta|k|rb|ribu|thousand|million)\b/gi, "")
    .replace(/\$\s*\d+(?:[.,]\d+)?/g, "")
    .replace(/\b\d+\b/g, "")
    .replace(/\b(transfer|tf|pindah(kan)?|pindahin|kirim|move|spent|bought|paid|received|beli|bayar|dapat|masuk|topup|top up|isi saldo|pake|pakai|via|lewat)\b/gi, "")
    .replace(/\b(hari ini|today|kemarin|yesterday|tadi (siang|pagi|malam)|\d+\s*hari lalu|(?:one|two|three|four|five|six|seven|satu|dua|tiga|empat|lima)\s+days? ago|days? ago|hari lalu)\b/gi, "")
    .replace(/\b(on|for|at|di|sama|dan|and|with|dari|from|ke|to)\b/gi, "")
    .replace(/\b(lah|deh|dong|sih|aja|ya)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  if (type === "Transfer-Out") {
    label = label.replace(/\b(uang|dana|saldo|money)\b/gi, "").trim();
  }

  if (!label || label.length < 2) {
    if (type === "Transfer-Out") {
      label = accountHint && destAccountHint
        ? `Transfer ${accountHint} → ${destAccountHint}`
        : "Transfer Antar Akun";
    } else {
      label = categoryHint ? categoryHint.replace(/^[^\p{L}\p{N}]+/u, "") : "Transaksi";
    }
  } else {
    label = label.charAt(0).toUpperCase() + label.slice(1);
  }

  return {
    amount,
    type,
    categoryHint,
    merchantLabel: label,
    dateISO,
    accountHint,
    destAccountHint,
    confidence: Math.max(0.4, Math.min(0.95, confidence)),
    reasoning,
  };
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}