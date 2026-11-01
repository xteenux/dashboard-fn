/**
 * Import parser — dua format:
 *  1. Bank statement (CSV/Excel debit/kredit): gridToRows -> buildBankPreview.
 *  2. Fluxo / Money Manager export (Account/Category/Subcategory/Income-Expense):
 *     parseFluxo -> buildPreview.
 * Hasil selalu = preview (tidak commit). Kategori dicocokkan ke DB via nama normal.
 */

export type ImportType = "Income" | "Expense" | "Transfer-Out";

export interface RawBankRow {
  date: string | null;
  description: string;
  debit: number;  // positive = money out (expense)
  credit: number; // positive = money in (income)
}

export interface ImportCategory {
  id: string;
  name: string;
  type: string;
  emoji?: string | null;
}

export interface ImportPreviewItem {
  key: string;
  date: string;
  amount: number; // always positive
  type: ImportType;
  description: string;
  categoryName: string | null;
  subcategory: string | null;
  accountName: string | null;
  destAccountName: string | null;
  confidence: number;
  duplicate: boolean;
}

const DATE_HEADERS = ["tanggal", "date", "tgl", "transactiondate", "valuedate", "postingdate", "tanggaltransaksi"];
const DESC_HEADERS = ["keterangan", "description", "deskripsi", "narasi", "detail", "remark", "remarks", "note", "merchant", "uraian", "deskripsi transaksi"];
const DEBIT_HEADERS = ["debit", "debet", "keluar", "pengeluaran", "withdrawal", "uangkeluar", "debitamount", "penarikan"];
const CREDIT_HEADERS = ["kredit", "credit", "masuk", "pemasukan", "deposit", "uangmasuk", "creditamount", "setoran"];
const AMOUNT_HEADERS = ["amount", "jumlah", "nominal", "nilai", "saldoakhir"];

function normKey(s: string): string {
  return s.replace(/[^\p{L}\p{N}]+/gu, "").toLowerCase();
}

function normName(s: string): string {
  return s.replace(/[^\p{L}\p{N}]+/gu, "").toLowerCase();
}

/** Buang prefix non-huruf (emoji / PUA emoji) dari label. */
function cleanLabel(s: string): string {
  return s.replace(/^[^\p{L}\p{N}]+/u, "").trim();
}

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

/** Bersihkan nilai cell nominal -> number (positif). */
export function parseAmountCell(v: unknown): number {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? Math.abs(v) : 0;
  let s = String(v).trim();
  if (!s || /^[()\s]+$/.test(s)) return 0;
  s = s.replace(/[()]/g, "");
  s = s.replace(/rp|idr|usd|\$/gi, "");
  let num: number;
  if (/,?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) {
    num = parseFloat(s.replace(/,/g, "")); // "1,234.56"
  } else if (/\.\d{3}(,\d+)?$/.test(s)) {
    num = parseFloat(s.replace(/\./g, "").replace(",", ".")); // "1.234,56"
  } else {
    num = parseFloat(s.replace(/,/g, ".")); // "1234.56" or "1.29E7"
  }
  if (Number.isNaN(num)) return 0;
  return Math.abs(num);
}

/** Format Date -> YYYY-MM-DD pakai komponen LOKAL (bukan UTC). */
function fmtLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Ubah nilai cell tanggal -> YYYY-MM-DD, atau null. */
export function parseDateCell(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return fmtLocalDate(v);
  if (typeof v === "number" && Number.isFinite(v) && v > 20000 && v < 80000) {
    // Excel serial date (1900 system). Bangun Date UTC lalu baca komponen UTC
    // sebagai "jam lokal" (07:32 +0800), supaya murni tanggal tanpa geser TZ.
    const ms = Math.round((v - 25569) * 86400 * 1000);
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) {
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, "0");
      const day = String(d.getUTCDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    }
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})/);
  if (m) {
    const d = new Date(`${m[2]} ${m[1]}, ${m[3]}`);
    if (!Number.isNaN(d.getTime())) return fmtLocalDate(d);
  }
  return null;
}

// ---------------------------------------------------------------- bank format

interface ColMap {
  date: number;
  desc: number;
  debit: number;
  credit: number;
  amount: number;
}

/** Deteksi kolom berdasarkan header (scan 5 baris pertama). */
function detectColumns(rows: (string | number)[][]): ColMap {
  const map: ColMap = { date: -1, desc: -1, debit: -1, credit: -1, amount: -1 };
  const scan = rows.slice(0, 5);
  const score: Record<string, number> = {};
  for (const row of scan) {
    for (let c = 0; c < row.length; c++) {
      const k = normKey(String(row[c] ?? ""));
      if (!k) continue;
      if (DATE_HEADERS.some((h) => k === normKey(h) || k.includes(normKey(h)))) score[`date:${c}`] = (score[`date:${c}`] || 0) + 1;
      if (DESC_HEADERS.some((h) => k === normKey(h) || k.includes(normKey(h)))) score[`desc:${c}`] = (score[`desc:${c}`] || 0) + 1;
      if (DEBIT_HEADERS.some((h) => k === normKey(h) || k.includes(normKey(h)))) score[`debit:${c}`] = (score[`debit:${c}`] || 0) + 1;
      if (CREDIT_HEADERS.some((h) => k === normKey(h) || k.includes(normKey(h)))) score[`credit:${c}`] = (score[`credit:${c}`] || 0) + 1;
      if (AMOUNT_HEADERS.some((h) => k === normKey(h) || k.includes(normKey(h)))) score[`amount:${c}`] = (score[`amount:${c}`] || 0) + 1;
    }
  }
  for (const [key, n] of Object.entries(score)) {
    const [kind, colStr] = key.split(":");
    const col = Number(colStr);
    if (kind === "date" && n > (score[`date:${map.date}`] || 0)) map.date = col;
    if (kind === "desc" && n > (score[`desc:${map.desc}`] || 0)) map.desc = col;
    if (kind === "debit" && n > (score[`debit:${map.debit}`] || 0)) map.debit = col;
    if (kind === "credit" && n > (score[`credit:${map.credit}`] || 0)) map.credit = col;
    if (kind === "amount" && n > (score[`amount:${map.amount}`] || 0)) map.amount = col;
  }
  return map;
}

/** Parse grid bank -> RawBankRow[], buang baris header/kosong. */
export function gridToRows(rows: (string | number)[][]): RawBankRow[] {
  if (!rows.length) return [];
  const map = detectColumns(rows);
  const startRow =
    (map.date >= 0 || map.desc >= 0 || map.debit >= 0 || map.credit >= 0 || map.amount >= 0) ? 1 : 0;
  const out: RawBankRow[] = [];
  for (let i = startRow; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c) => c == null || String(c).trim() === "")) continue;
    const date = map.date >= 0 ? parseDateCell(row[map.date]) : null;
    const desc = map.desc >= 0 ? String(row[map.desc] ?? "").trim() : "";
    let debit = 0;
    let credit = 0;
    if (map.debit >= 0) debit = parseAmountCell(row[map.debit]);
    if (map.credit >= 0) credit = parseAmountCell(row[map.credit]);
    if (map.amount >= 0 && !debit && !credit) {
      const amt = parseAmountCell(row[map.amount]);
      if (amt > 0) {
        const raw = String(row[map.amount] ?? "");
        const isNeg = raw.trim().startsWith("-") || raw.includes("(");
        if (isNeg) debit = amt;
        else credit = amt;
      }
    }
    if (!date && !desc && !debit && !credit) continue;
    out.push({ date, description: desc, debit, credit });
  }
  return out;
}

// ---------------------------------------------------------------- fluxo format

const FLUXO_TYPE_HEADER = "incomeexpense";

/** Deteksi: header punya kolom "Income/Expense" + "Subcategory" (signature export Fluxo). */
export function isFluxoHeader(header: unknown[]): boolean {
  const keys = header.map((c) => normKey(String(c ?? "")));
  return keys.includes(FLUXO_TYPE_HEADER) && keys.includes("subcategory");
}

interface FluxoCols {
  date: number;
  account: number;
  category: number;
  subcategory: number;
  note: number;
  amount: number;
  type: number;
}

function fluxoCols(header: unknown[]): FluxoCols {
  const idx = (target: string) => header.findIndex((h) => normKey(String(h ?? "")) === target);
  const cols: FluxoCols = {
    date: idx("date"),
    account: idx("account"),
    category: idx("category"),
    subcategory: idx("subcategory"),
    note: idx("note"),
    amount: idx("idr"),
    type: idx("incomeexpense") !== -1 ? idx("incomeexpense") : idx("incometype"),
  };
  if (cols.amount === -1) cols.amount = idx("amount");
  return cols;
}

function resolveCategoryByName(cleanName: string, type: ImportType, categories: ImportCategory[]): string | null {
  if (type === "Transfer-Out") {
    const t = categories.find((c) => c.type === "transfer");
    return t?.name ?? null;
  }
  const expected = type === "Income" ? "income" : "expense";
  const n = normName(cleanName);
  const hit = categories.find((c) => c.type === expected && normName(c.name) === n);
  return hit?.name ?? null;
}

/** Parse grid Fluxo -> ImportPreviewItem[] (belum dedupe). */
export function parseFluxo(rows: unknown[][], categories: ImportCategory[]): ImportPreviewItem[] {
  if (rows.length < 2) return [];
  const header = rows[0];
  const cols = fluxoCols(header);
  if (cols.amount === -1 || cols.type === -1) return [];

  const seen = new Set<string>();
  const items: ImportPreviewItem[] = [];

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.every((c) => c == null || String(c).trim() === "")) continue;

    const date = parseDateCell(r[cols.date]);
    const amount = parseAmountCell(r[cols.amount]);
    if (!date || amount <= 0) continue;

    const accountRaw = str(r[cols.account]);
    const catRaw = str(r[cols.category]);
    const subRaw = str(r[cols.subcategory]);
    const note = str(r[cols.note]);
    const typeRaw = cleanLabel(str(r[cols.type]));

    let type: ImportType;
    if (/^transfer/i.test(typeRaw)) type = "Transfer-Out";
    else if (/^income/i.test(typeRaw)) type = "Income";
    else if (/^expense/i.test(typeRaw)) type = "Expense";
    else continue;

    let categoryName: string | null;
    let destAccountName: string | null = null;
    const accountName = accountRaw || null;

    if (type === "Transfer-Out") {
      // Fluxo: kolom Category berisi akun tujuan untuk transfer.
      destAccountName = cleanLabel(catRaw) || null;
      categoryName = resolveCategoryByName("", "Transfer-Out", categories);
    } else {
      categoryName = resolveCategoryByName(cleanLabel(catRaw), type, categories);
    }

    const subcategory = cleanLabel(subRaw) || null;

    let description = note;
    if (!description) {
      if (type === "Transfer-Out") {
        description = `Transfer ${accountName || "?"}${destAccountName ? " → " + destAccountName : ""}`;
      } else {
        description = cleanLabel(catRaw) || "Transaksi";
      }
    }

    const confidence = categoryName ? 0.95 : 0.65;
    const key = dupKey(date, amount, description);
    const duplicate = seen.has(key);
    seen.add(key);

    items.push({
      key: `${date}|${amount}|${description}|${i}`,
      date,
      amount,
      type,
      description,
      categoryName,
      subcategory,
      accountName,
      destAccountName,
      confidence,
      duplicate,
    });
  }

  return items;
}

// ---------------------------------------------------------------- shared

/** Keyword -> kategori + tipe (bank statement classify). */
const KEYWORDS: { cat: string; type: "Income" | "Expense"; re: RegExp }[] = [
  { cat: "🍜 Food", type: "Expense", re: /\b(makan|lunch|dinner|sarapan|kopi|coffee|cafe|warteg|burger|pizza|mie|bakso|food|resto|restoran|jajan|snack|tea|teh|starbucks|ayam|nasi|geprek|soto|sate)\b/i },
  { cat: "🚖 Transport", type: "Expense", re: /\b(gojek|grab|uber|ojol|bensin|pertalite|pertamax|toll|tol|parkir|mrt|krl|transjakarta|kereta|pesawat|tiket|travel|transport)\b/i },
  { cat: "🛒Shop", type: "Expense", re: /\b(belanja|tokopedia|shopee|lazada|mall|beli|baju|sepatu|shop|shopping|amazon|uniqlo|zara|groceries|marketplace)\b/i },
  { cat: "🪑 Household", type: "Expense", re: /\b(listrik|pln|pdam|air|wifi|indihome|biznet|pulsa|kuota|bpjs|tagihan|bill|rent|sewa|iuran|utilities|internet)\b/i },
  { cat: "💰 Salary", type: "Income", re: /\b(gaji|salary|payroll|upah|bonus|thr|honor|digaji)\b/i },
  { cat: "💵Payback", type: "Income", re: /\b(teman|friend|balikin|bayar balik|dibayar|dikasih|diberi|payback|dari teman|kembalian|transfer in|incoming)\b/i },
  { cat: "🏦Finance", type: "Expense", re: /\b(pinjam|hutang|loan|bayar utang|cicilan|kpr|topup|top up|isi saldo|investasi|bunga|admin|biaya admin)\b/i },
];

function resolveName(hint: string, valid: string[]): string {
  if (valid.includes(hint)) return hint;
  const nHint = normName(hint);
  return valid.find((v) => normName(v) === nHint) || hint;
}

export function classify(
  desc: string,
  categoryNames: string[],
): { name: string | null; type: "Income" | "Expense"; confidence: number } {
  for (const item of KEYWORDS) {
    if (item.re.test(desc)) {
      return { name: resolveName(item.cat, categoryNames), type: item.type, confidence: 0.2 };
    }
  }
  return { name: null, type: "Expense", confidence: 0 };
}

export function dupKey(date: string, amount: number, description: string): string {
  const d = date ? date.slice(0, 10) : "";
  const a = Math.round(amount).toString();
  const s = description.replace(/[^\p{L}\p{N}]+/gu, "").toLowerCase().slice(0, 40);
  return `${d}|${a}|${s}`;
}

/** Bank rows -> preview items (Income/Expense only). */
export function buildPreview(
  rows: RawBankRow[],
  categoryNames: string[],
  existingKeys: Set<string>,
  fallbackDate: string,
): ImportPreviewItem[] {
  const out: ImportPreviewItem[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const date = row.date || fallbackDate;
    let amount = 0;
    let type: "Income" | "Expense";
    if (row.credit > 0) {
      amount = row.credit;
      type = "Income";
    } else if (row.debit > 0) {
      amount = row.debit;
      type = "Expense";
    } else {
      continue;
    }
    const desc = row.description || "Transaksi";
    const cls = classify(desc, categoryNames);
    const categoryName = cls.name;
    const confidence = 0.6 + cls.confidence;
    const key = dupKey(date, amount, desc);
    const duplicate = existingKeys.has(key) || seen.has(key);
    seen.add(key);
    out.push({
      key: `${date}|${amount}|${desc}|${out.length}`,
      date,
      amount,
      type,
      description: desc,
      categoryName,
      subcategory: null,
      accountName: null,
      destAccountName: null,
      confidence: Math.min(0.95, confidence),
      duplicate,
    });
  }
  return out;
}

/** Gabung: tandai duplikat vs DB existing. */
export function markDuplicates(items: ImportPreviewItem[], existingKeys: Set<string>): ImportPreviewItem[] {
  const seen = new Set<string>();
  return items.map((it) => {
    const key = dupKey(it.date, it.amount, it.description);
    const duplicate = existingKeys.has(key) || seen.has(key);
    seen.add(key);
    return { ...it, duplicate };
  });
}