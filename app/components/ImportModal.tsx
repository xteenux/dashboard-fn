"use client";

import { useRef, useState } from "react";
import { useLanguage } from "@/app/lib/i18n";

type ImportItem = {
  key: string;
  date: string;
  amount: number;
  type: "Income" | "Expense" | "Transfer-Out";
  description: string;
  categoryName: string | null;
  subcategory: string | null;
  accountName: string | null;
  destAccountName: string | null;
  confidence: number;
  duplicate: boolean;
};

type Cat = { id: string; name: string; type: string };
type Account = { id: string; name: string };

type ParseResult = {
  sourceFile: string;
  accountName: string;
  fluxo?: boolean;
  items: ImportItem[];
  totals: { incoming: number; outgoing: number; transfer: number; duplicates: number };
  categories: Cat[];
  accounts: Account[];
};

const fmt = (n: number) => n.toLocaleString("id-ID");

export default function ImportModal({
  onImported,
}: {
  onImported?: () => void;
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [accountName, setAccountName] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState<ParseResult | null>(null);
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [overrides, setOverrides] = useState<Record<string, string>>({}); // key -> categoryName
  const [accountOverrides, setAccountOverrides] = useState<Record<string, string>>({}); // key -> accountName (source)
  const [destAccountOverrides, setDestAccountOverrides] = useState<Record<string, string>>({}); // key -> destAccountName
  const [subOverrides, setSubOverrides] = useState<Record<string, string>>({}); // key -> subcategory
  const [committing, setCommitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFile(null);
    setAccountName("");
    setResult(null);
    setEnabled({});
    setOverrides({});
    setAccountOverrides({});
    setDestAccountOverrides({});
    setSubOverrides({});
    setErr("");
    setLoading(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  const openModal = () => {
    reset();
    setOpen(true);
  };

  const onParse = async () => {
    if (!file) {
      setErr("Pilih file dulu");
      return;
    }
    setLoading(true);
    setErr("");
    const fd = new FormData();
    fd.append("file", file);
    if (accountName) fd.append("accountName", accountName);
    try {
      const res = await fetch("/api/import/parse", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data.error || t("import.parseFail"));
      } else {
        setResult(data as ParseResult);
        const init: Record<string, boolean> = {};
        for (const it of (data as ParseResult).items) init[it.key] = true;
        setEnabled(init);
        setAccountName((data as ParseResult).accountName || accountName);
      }
    } catch {
      setErr(t("import.connError"));
    }
    setLoading(false);
  };

  const onCommit = async () => {
    if (!result) return;
    const items = result.items
      .filter((it) => enabled[it.key])
      .map((it) => ({
        date: it.date,
        amount: it.amount,
        type: it.type,
        categoryName: overrides[it.key] ?? it.categoryName,
        subcategory: subOverrides[it.key] ?? it.subcategory,
        accountName: accountOverrides[it.key] ?? it.accountName,
        destAccountName: destAccountOverrides[it.key] ?? it.destAccountName,
        note: it.description,
      }));
    if (!items.length) return;
    if (!confirm(`Impor ${items.length} transaksi? Tidak bisa dibatalkan.`)) return;
    setCommitting(true);
    setErr("");
    try {
      const res = await fetch("/api/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountName, items }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data.error || t("import.commitFail"));
      } else {
        onImported?.();
        setOpen(false);
        reset();
      }
    } catch {
      setErr(t("import.connError"));
    }
    setCommitting(false);
  };

  const catOptions = result
    ? result.categories.filter((c) => c.type === "expense" || c.type === "income")
    : [];
  const acctOptions = result ? result.accounts : [];

  const itemRow = (it: ImportItem) => {
    const cat = overrides[it.key] ?? it.categoryName;
    const acct = accountOverrides[it.key] ?? it.accountName ?? "";
    const dest = destAccountOverrides[it.key] ?? it.destAccountName ?? "";
    const isTransfer = it.type === "Transfer-Out";
    return (
      <div
        key={it.key}
        className="flex items-center gap-3 py-2 px-2 rounded-md border border-border bg-card"
      >
        <input
          type="checkbox"
          checked={!!enabled[it.key]}
          onChange={(e) => setEnabled((p) => ({ ...p, [it.key]: e.target.checked }))}
        />
        <span className="text-xs text-muted-foreground tabular-nums w-20 shrink-0">{it.date}</span>
        <span className="text-sm w-24 shrink-0 tabular-nums text-right">
          {it.type === "Income" ? (
            <span className="text-green-600">+{fmt(it.amount)}</span>
          ) : it.type === "Transfer-Out" ? (
            <span className="text-blue-600">⇄{fmt(it.amount)}</span>
          ) : (
            <span className="text-red-600">-{fmt(it.amount)}</span>
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm truncate">{it.description}</p>
          {it.duplicate && <p className="text-xs text-amber-600">⚠ {t("import.duplicate")}</p>}
        </div>
        {!isTransfer && (
          <select
            value={cat || ""}
            onChange={(e) => setOverrides((p) => ({ ...p, [it.key]: e.target.value }))}
            className="text-xs px-2 py-1 rounded border border-border bg-background max-w-[150px]"
          >
            <option value="">-- kategori --</option>
            {catOptions.map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        )}
        {!isTransfer && (
          <input
            value={subOverrides[it.key] ?? it.subcategory ?? ""}
            onChange={(e) => setSubOverrides((p) => ({ ...p, [it.key]: e.target.value }))}
            placeholder="subkategori"
            className="text-xs px-2 py-1 rounded border border-border bg-background w-[110px] shrink-0"
          />
        )}
        <select
          value={acct}
          onChange={(e) => setAccountOverrides((p) => ({ ...p, [it.key]: e.target.value }))}
          className={`text-xs px-2 py-1 rounded border border-border bg-background max-w-[130px] ${acct ? "" : "text-muted-foreground"}`}
        >
          <option value="">-- akun --</option>
          {acctOptions.map((a) => (
            <option key={a.id} value={a.name}>
              {a.name}
            </option>
          ))}
        </select>
        {isTransfer && (
          <select
            value={dest}
            onChange={(e) => setDestAccountOverrides((p) => ({ ...p, [it.key]: e.target.value }))}
            className={`text-xs px-2 py-1 rounded border border-border bg-background max-w-[130px] ${dest ? "" : "text-muted-foreground"}`}
          >
            <option value="">-- tujuan --</option>
            {acctOptions.map((a) => (
              <option key={a.id} value={a.name}>
                {a.name}
              </option>
            ))}
          </select>
        )}
      </div>
    );
  };

  return (
    <>
      <button
        onClick={openModal}
        className="px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-accent transition-colors"
      >
        {t("import.open")}
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div
            className="bg-card rounded-lg p-5 w-full max-w-3xl max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">{t("import.title")}</h3>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
                ✕
              </button>
            </div>

            {!result && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">{t("import.desc")}</p>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls,.pdf,.txt"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  className="block w-full text-sm border border-border rounded-md p-2 bg-background file:mr-3 file:px-3 file:py-1.5 file:rounded file:border-0 file:bg-muted file:text-sm"
                />
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">{t("import.accountLabel")}</label>
                  <input
                    value={accountName}
                    onChange={(e) => setAccountName(e.target.value)}
                    placeholder={t("import.accountPlaceholder")}
                    className="w-full text-sm border border-border rounded-md px-3 py-2 bg-background"
                  />
                </div>
              </div>
            )}

            {result && (
              <div className="flex-1 min-h-0 flex flex-col gap-3">
                <div className="flex items-center gap-3 text-sm flex-wrap">
                  <span className="text-muted-foreground">{result.sourceFile}</span>
                  <span className="text-green-600">+{fmt(result.totals.incoming)}</span>
                  <span className="text-red-600">-{fmt(result.totals.outgoing)}</span>
                  {result.totals.transfer > 0 && (
                    <span className="text-blue-600">⇄{fmt(result.totals.transfer)}</span>
                  )}
                  {result.totals.duplicates > 0 && (
                    <span className="text-amber-600">⚠ {result.totals.duplicates} {t("import.duplicate")}</span>
                  )}
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto border border-border rounded-md divide-y divide-border">
                  {result.items.map(itemRow)}
                </div>
              </div>
            )}

            {err && <p className="text-red-500 text-sm mt-2">{err}</p>}

            <div className="flex justify-end gap-2 mt-3">
              {!result ? (
                <>
                  <button onClick={() => setOpen(false)} className="px-3 py-1 border border-border rounded text-sm">
                    {t("import.cancel")}
                  </button>
                  <button
                    onClick={onParse}
                    disabled={loading || !file}
                    className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
                  >
                    {loading ? t("import.parsing") : t("import.parse")}
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => {
                      setResult(null);
                      setErr("");
                    }}
                    className="px-3 py-1 border border-border rounded text-sm"
                  >
                    {t("import.back")}
                  </button>
                  <button
                    onClick={onCommit}
                    disabled={committing}
                    className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
                  >
                    {committing ? t("import.committing") : t("import.commit")}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}