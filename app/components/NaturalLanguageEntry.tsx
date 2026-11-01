"use client";

import { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/app/lib/i18n";
import { formatIDR } from "@/app/lib/utils";
import { parseNaturalLanguageEntry, type ParsedEntry } from "@/app/lib/ai/parse-entry";

interface AiParseResult {
  amount: number | null;
  type: "Expense" | "Income" | "Transfer-Out";
  categoryName: string;
  merchantLabel: string;
  dateISO: string;
  accountName: string;
  destAccountName?: string;
  confidence: number;
  reasoning: string;
  source?: string;
}

interface Cat { id: string; name: string; type?: string; }
interface Acct { id: string; name: string; type?: string; }

interface Props {
  categories: Cat[];
  accounts: Acct[];
  onSaved: (saved: unknown) => void; // panggil router.refresh() di parent
}

const SUGGESTIONS_ID = [
  "makan siang 35rb tadi siang",
  "kopi 27rb sama nasi goreng 45rb kemarin",
  "gaji masuk 10jt",
  "bayar listrik 300rb 2 hari lalu",
  "transfer 200rb dari BCA ke Jago",
];

const SUGGESTIONS_EN = [
  "lunch 35k today",
  "coffee 5.25 yesterday",
  "salary received 10m",
  "paid 90 for electricity bill",
  "transfer 150 from BCA to Jago",
];

export function NaturalLanguageEntry({ categories, accounts, onSaved }: Props) {
  const { lang } = useLanguage();
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<ParsedEntry | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false); // Mjolmile sedang menganalisis
  const [aiSource, setAiSource] = useState<"regex" | "mjolmile-ai" | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const parseSeq = useRef(0); // guard hasil lama menimpa baru
  const lastAiText = useRef<string>(""); // dedupe: jangan tanya AI teks sama berulang

  // override state (editable preview)
  const [override, setOverride] = useState<{
    type: "Expense" | "Income" | "Transfer-Out";
    categoryName: string;
    dateISO: string;
    amount: string;
    accountName: string;
    destAccountName: string;
  } | null>(null);

  function applyRegexParse(v: string): ParsedEntry {
    const p = parseNaturalLanguageEntry(v, new Date(), {
      categoryNames: categories.map((c) => c.name),
      accountNames: accounts.map((a) => a.name),
    });
    setParsed(p);
    setAiSource((old) => old === "mjolmile-ai" ? "mjolmile-ai" : "regex");
    setOverride((o) => {
      if (aiBusy) return o;
      const expectedCatType = p.type === "Transfer-Out" ? "transfer" : p.type === "Income" ? "income" : "expense";
      const validCats = categories.filter((c) => c.type === expectedCatType);
      const fallbackCat = p.type === "Transfer-Out"
        ? (categories.find((c) => c.type === "transfer")?.name || "Transfer")
        : (p.type === "Income" ? "💰 Salary" : "🍜 Food");
      const categoryName = validCats.some((c) => c.name === p.categoryHint)
        ? (p.categoryHint as string)
        : (p.categoryHint ?? fallbackCat);

      const srcAcct = p.accountHint && accounts.some((a) => a.name === p.accountHint)
        ? p.accountHint
        : (accounts[0]?.name || "");

      // Akun tujuan (khusus Transfer-Out): ambil dari hint atau akun berbeda pertama
      const destCandidate = p.destAccountHint && accounts.some((a) => a.name === p.destAccountHint)
        ? p.destAccountHint
        : (accounts.find((a) => a.name !== srcAcct)?.name || "");

      return {
        type: p.type,
        categoryName,
        dateISO: p.dateISO,
        amount: p.amount == null ? "" : String(p.amount),
        accountName: srcAcct,
        destAccountName: p.type === "Transfer-Out" ? destCandidate : "",
      };
    });
    return p;
  }

  /** Regex dibilang "ragu" bila confidence rendah / kategori tidak terdeteksi / amount kosong / transfer tapi tujuan kosong. */
  function isUncertain(p: ParsedEntry): boolean {
    if (p.type === "Transfer-Out" && (!p.accountHint || !p.destAccountHint)) return true;
    return p.confidence < 0.75 || !p.categoryHint || p.amount == null;
  }

  function applyAiParse(ai: AiParseResult) {
    const p: ParsedEntry = {
      amount: ai.amount,
      type: ai.type,
      categoryHint: ai.categoryName,
      merchantLabel: ai.merchantLabel,
      dateISO: ai.dateISO,
      accountHint: ai.accountName || null,
      destAccountHint: ai.destAccountName || null,
      confidence: ai.confidence,
      reasoning: [ai.reasoning],
    };
    setParsed(p);
    setAiSource("mjolmile-ai");
    const src = accounts.some((a) => a.name === ai.accountName)
      ? ai.accountName
      : (accounts[0]?.name || "");
    const dest = ai.type === "Transfer-Out"
      ? (accounts.some((a) => a.name === ai.destAccountName && a.name !== src)
          ? (ai.destAccountName as string)
          : (accounts.find((a) => a.name !== src)?.name || ""))
      : "";
    setOverride({
      type: p.type,
      categoryName: ai.categoryName,
      dateISO: ai.dateISO,
      amount: ai.amount == null ? "" : String(ai.amount),
      accountName: src,
      destAccountName: dest,
    });
  }

  // Hybrid (opsi 3): regex instan tiap ketik; AI dipanggil otomatis HANYA saat regex ragu
  // (confidence < 0.75 / kategori tak terdeteksi / amount kosong) setelah user berhenti
  // mengetik 800ms — plus dedupe teks sama & tombol manual "Minta Mjolmile cek".
  function handleChange(v: string) {
    setText(v);
    const t = v.trim();
    if (t.length < 3) {
      setParsed(null);
      setOverride(null);
      setAiSource(null);
      lastAiText.current = "";
      return;
    }
    const p = applyRegexParse(t);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!isUncertain(p) || lastAiText.current === t) return; // yakin / sudah pernah ditanya: tidak call AI
    debounceRef.current = setTimeout(() => {
      void requestAi(t);
    }, 800);
  }

  async function requestAi(t: string) {
    const seq = ++parseSeq.current;
    setAiBusy(true);
    try {
      const res = await fetch("/api/ai/parse-tx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: t }),
      });
      if (!res.ok) return; // regex hasil tetap tampil
      const j = (await res.json()) as AiParseResult;
      if (seq !== parseSeq.current) return; // input lebih baru sudah masuk
      lastAiText.current = t;
      applyAiParse(j);
    } catch {
      // diam — regex preview tetap
    } finally {
      if (seq === parseSeq.current) setAiBusy(false);
    }
  }

  function handleManualAi() {
    const t = text.trim();
    if (t.length < 3 || aiBusy) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    void requestAi(t);
  }

// Cleanup debounce saat unmount
  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const suggestions = lang === "en" ? SUGGESTIONS_EN : SUGGESTIONS_ID;

  function handleTypeChange(next: "Expense" | "Income" | "Transfer-Out") {
    setOverride((o) => {
      if (!o) return o;
      const categoryName = next === "Transfer-Out"
        ? (categories.find((c) => c.type === "transfer")?.name || "Transfer")
        : (o.categoryName);
      const destAccountName = next === "Transfer-Out"
        ? (o.destAccountName && o.destAccountName !== o.accountName
            ? o.destAccountName
            : (accounts.find((a) => a.name !== o.accountName)?.name || ""))
        : "";
      return { ...o, type: next, categoryName, destAccountName };
    });
  }

  async function save() {
    if (!override || !parsed) return;
    const amount = Number(override.amount);
    if (!amount || Number.isNaN(amount)) {
      setError(lang === "en" ? "Amount invalid" : "Nominal tidak valid");
      return;
    }
    if (override.type === "Transfer-Out" && !override.destAccountName) {
      setError(lang === "en" ? "Destination account required" : "Pilih akun tujuan");
      return;
    }
    if (override.type === "Transfer-Out" && override.accountName === override.destAccountName) {
      setError(lang === "en" ? "Source and destination must differ" : "Akun sumber dan tujuan tidak boleh sama");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const destAccountId = override.type === "Transfer-Out"
        ? (accounts.find((a) => a.name === override.destAccountName)?.id ?? null)
        : null;
      const body = {
        date: override.dateISO,
        amount,
        type: override.type,
        note: parsed.merchantLabel,
        categoryId: categories.find((c) => c.name === override.categoryName)?.id ?? null,
        accountName: override.accountName,
        ...(override.type === "Transfer-Out" ? { destAccountId } : {}),
      };
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      onSaved(j);
      setText("");
      setParsed(null);
      setOverride(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  const confidencePct = parsed ? Math.round(parsed.confidence * 100) : 0;

  return (
    <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-sm font-bold text-accent-foreground">
          AI
        </span>
        <div>
          <h3 className="text-sm font-semibold">{lang === "en" ? "Natural language entry" : "Catat transaksi pakai bahasa alami"}</h3>
          <p className="text-xs text-muted-foreground">
            {lang === "en"
              ? "Type it how you'd say it — I'll extract amount, category, date & method."
              : "Ketik seperti ngomong — nanti angka, kategori, tanggal & akun diekstrak otomatis."}
          </p>
        </div>
      </div>

      <textarea
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={lang === "en" ? "spent $18.40 on lunch today" : "makan siang 35rb tadi siang"}
        rows={2}
        className="mt-3 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
      />

      {!parsed && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => handleChange(s)}
              className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {parsed && override && (
        <div className="mt-4 rounded-xl border border-border bg-background/50 p-4">
          {/* baris judul + amount */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${override.type === "Income" ? "bg-emerald-500/15" : override.type === "Transfer-Out" ? "bg-blue-500/15" : "bg-rose-500/15"}`}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={override.type === "Income" ? "text-emerald-500" : override.type === "Transfer-Out" ? "text-blue-500" : "text-rose-500"}>
                  {override.type === "Income"
                    ? <path d="M12 19V5M6 11l6-6 6 6" />
                    : override.type === "Transfer-Out"
                      ? <path d="M5 9l-3 3 3 3M19 15l3-3-3-3M9 12h6M2 12h3M19 12h3" />
                      : <path d="M12 5v14M6 13l6 6 6-6" />}
                </svg>
              </span>
              <span className="truncate text-sm font-medium">{parsed.merchantLabel}</span>
            </div>
            <span className={`shrink-0 text-base font-bold tabular-nums ${override.type === "Income" ? "text-emerald-500" : override.type === "Transfer-Out" ? "text-blue-500" : "text-rose-500"}`}>
              {override.type === "Income" ? "+" : override.type === "Transfer-Out" ? "⇄" : "−"}{override.amount ? formatIDR(Number(override.amount)) : formatIDR(0)}
            </span>
          </div>

          {/* kontrol baris */}
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
            <select
              value={override.type}
              onChange={(e) => handleTypeChange(e.target.value as "Expense" | "Income" | "Transfer-Out")}
              className="rounded-md border border-border bg-background px-2 py-1.5 text-xs"
              aria-label="type"
            >
              <option value="Expense">Expense</option>
              <option value="Income">Income</option>
              <option value="Transfer-Out">Transfer-Out</option>
            </select>

            <select
              value={override.categoryName}
              onChange={(e) => setOverride((o) => o && ({ ...o, categoryName: e.target.value }))}
              className="rounded-md border border-border bg-background px-2 py-1.5 text-xs truncate"
              aria-label="category"
            >
              {categories.filter((c) => c.type === (override.type === "Transfer-Out" ? "transfer" : override.type === "Income" ? "income" : "expense")).map((c) => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
              {!categories.some((c) => c.name === override.categoryName) && (
                <option value={override.categoryName}>{override.categoryName}</option>
              )}
            </select>

            <input
              type="date"
              value={override.dateISO}
              onChange={(e) => setOverride((o) => o && ({ ...o, dateISO: e.target.value }))}
              className="rounded-md border border-border bg-background px-2 py-1.5 text-xs"
              aria-label="date"
            />

            <input
              type="number"
              value={override.amount}
              onChange={(e) => setOverride((o) => o && ({ ...o, amount: e.target.value }))}
              className="rounded-md border border-border bg-background px-2 py-1.5 text-xs tabular-nums"
              aria-label="amount"
              min={0}
              step="any"
            />

            <select
              value={override.accountName}
              onChange={(e) => setOverride((o) => o && ({ ...o, accountName: e.target.value }))}
              className="rounded-md border border-border bg-background px-2 py-1.5 text-xs truncate"
              aria-label="account"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.name}>{a.name}</option>
              ))}
            </select>

            {override.type === "Transfer-Out" && (
              <select
                value={override.destAccountName}
                onChange={(e) => setOverride((o) => o && ({ ...o, destAccountName: e.target.value }))}
                className="rounded-md border border-border bg-background px-2 py-1.5 text-xs truncate"
                aria-label="destination account"
              >
                {accounts.filter((a) => a.name !== override.accountName).map((a) => (
                  <option key={a.id} value={a.name}>{a.name}</option>
                ))}
              </select>
            )}
          </div>

          {/* confidence bar */}
          <div className="mt-3 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${confidencePct}%` }}
              />
            </div>
            <span className="shrink-0 text-[11px] text-muted-foreground">
              {confidencePct}% {lang === "en" ? "confidence" : "keyakinan"} ·{" "}
              {aiSource === "mjolmile-ai"
                ? (lang === "en" ? "Mjolmile AI" : "Mjolmile AI")
                : (lang === "en" ? "quick parse" : "parse cepat")}
              {aiBusy && " · …"} · {override.dateISO.slice(0, 10)}
            </span>
          </div>

          {/* reasoning */}
          {parsed.reasoning.length > 0 && (
            <p className="mt-2 text-[11px] text-muted-foreground leading-relaxed">
              {parsed.reasoning.join(" · ")}
            </p>
          )}

          {/* footer */}
          <div className="mt-3 flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">
              {lang === "en" ? "1 ready" : "1 siap disimpan"}
            </span>
            {error && <span className="text-[11px] text-red-500">{error}</span>}
            <span className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleManualAi}
                disabled={aiBusy}
                title={lang === "en" ? "Ask Mjolmile to check" : "Minta Mjolmile cek"}
                className="rounded-md border border-border px-2.5 py-1.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-40 transition-colors"
              >
                {aiBusy
                  ? (lang === "en" ? "Analyzing…" : "Menganalisis…")
                  : aiSource === "mjolmile-ai"
                    ? (lang === "en" ? "Re-check" : "Cek ulang")
                    : (lang === "en" ? "Mjolmile check" : "Minta Mjolmile cek")}
              </button>
              <button
                onClick={save}
                disabled={saving || !override.amount || Number.isNaN(Number(override.amount))}
                className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40 hover:bg-emerald-600 transition-colors"
              >
                {saving ? "…" : lang === "en" ? "Save 1" : "Simpan 1"}
              </button>
            </span>
          </div>
        </div>
      )}
    </section>
  );
}