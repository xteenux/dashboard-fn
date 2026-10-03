"use client";

import { useState } from "react";

export interface EditTx {
  id: string;
  date: string;
  amount: number;
  type: string;
  categoryName: string | null;
  accountName: string;
  note: string | null;
  destAccountName?: string | null;
  categoryId?: string | null;
  subcategoryId?: string | null;
  accountId?: string | null;
  destAccountId?: string | null;
}

interface AccountOpt { id: string; name: string; type: string; }

interface CatOpt { id: string; name: string; type: string; subcategories: { id: string; name: string }[]; }

export default function EditTransactionModal({
  tx,
  onClose,
  onSaved,
  accounts = [],
  categories = [],
}: {
  tx: EditTx;
  onClose: () => void;
  onSaved: () => void;
  accounts?: AccountOpt[];
  categories?: CatOpt[];
}) {
  const [date, setDate] = useState(tx.date.slice(0, 10));
  const [amount, setAmount] = useState(String(tx.amount));
  const [type, setType] = useState(tx.type);
  const [categoryId, setCategoryId] = useState(tx.categoryId ?? "");
  const [subcategoryId, setSubcategoryId] = useState(tx.subcategoryId ?? "");
  const [accountId, setAccountId] = useState(tx.accountId ?? "");
  const [destAccountId, setDestAccountId] = useState(tx.destAccountId ?? "");
  const [note, setNote] = useState(tx.note ?? "");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const isTransfer = type === "Transfer-Out";
  const selectedCat = categories.find((c) => c.id === categoryId);
  const subOptions = selectedCat ? selectedCat.subcategories : [];

  const typeKey = isTransfer ? "transfer" : type === "Income" ? "income" : "expense";
  const filteredCategories = categories.filter((c) => c.type === typeKey);

  const onTypeChange = (next: string) => {
    setType(next);
    const nextKey = next === "Transfer-Out" ? "transfer" : next === "Income" ? "income" : "expense";
    if (next === "Transfer-Out") {
      const transferCat = categories.find((c) => c.name === "Transfer" || c.type === "transfer");
      if (transferCat) {
        setCategoryId(transferCat.id);
        setSubcategoryId("");
      }
    } else {
      const originalCat = categories.find((c) => c.id === tx.categoryId);
      if (originalCat && originalCat.type === nextKey) {
        setCategoryId(tx.categoryId ?? "");
        setSubcategoryId(tx.subcategoryId ?? "");
      } else {
        setCategoryId("");
        setSubcategoryId("");
      }
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !date) return;
    if (isTransfer && (!accountId || !destAccountId)) {
      setErr("Transfer wajib memilih akun sumber dan akun tujuan");
      return;
    }
    if (isTransfer && accountId === destAccountId) {
      setErr("Akun sumber dan tujuan tidak boleh sama");
      return;
    }
    setLoading(true);
    setErr("");
    try {
      const res = await fetch(`/api/transactions/${tx.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          amount: parseFloat(amount),
          type,
          note: note || null,
          categoryId: categoryId || undefined,
          subcategoryId: isTransfer ? undefined : (subcategoryId || undefined),
          accountId: accountId || undefined,
          destAccountId: isTransfer ? (destAccountId || undefined) : undefined,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d.error || `Gagal (${res.status})`);
      } else {
        onSaved();
        onClose();
      }
    } catch {
      setErr("Tidak dapat terhubung ke server");
    }
    setLoading(false);
  };

  const fieldCls = "border border-border rounded px-3 py-2 bg-background";

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-card rounded-lg p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold mb-4">Edit Transaksi</h3>
        {err && <p className="text-red-500 mb-2 text-sm">{err}</p>}
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input
              type="date" required
              className={`${fieldCls} col-span-2`}
              value={date} onChange={(e) => setDate(e.target.value)}
            />
            <input
              type="number" step="0.01" required
              className={fieldCls}
              value={amount} onChange={(e) => setAmount(e.target.value)}
            />
            <select
              className={fieldCls}
              value={type} onChange={(e) => onTypeChange(e.target.value)}
            >
              <option value="Income">Income</option>
              <option value="Expense">Expense</option>
              <option value="Transfer-Out">Transfer-Out</option>
            </select>

            {isTransfer ? (
              <>
                <select className={fieldCls} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                  <option value="">-- Akun Sumber --</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name} ({a.type})</option>
                  ))}
                </select>
                <select className={fieldCls} value={destAccountId} onChange={(e) => setDestAccountId(e.target.value)}>
                  <option value="">-- Akun Tujuan --</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id} disabled={a.id === accountId}>{a.name} ({a.type})</option>
                  ))}
                </select>
              </>
            ) : (
              <>
                <select
                  className={`${fieldCls} col-span-2`}
                  value={categoryId}
                  onChange={(e) => { setCategoryId(e.target.value); setSubcategoryId(""); }}
                >
                  <option value="">-- Pilih Kategori --</option>
                  {filteredCategories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name} ({c.type})</option>
                  ))}
                </select>
                <select
                  className={fieldCls}
                  value={subcategoryId}
                  onChange={(e) => setSubcategoryId(e.target.value)}
                  disabled={!categoryId}
                >
                  <option value="">-- Subkategori --</option>
                  {subOptions.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <select className={fieldCls} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                  <option value="">-- Pilih Akun --</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name} ({a.type})</option>
                  ))}
                </select>
              </>
            )}
          </div>
          <textarea
            placeholder="Catatan (opsional)" rows={2}
            className="w-full border border-border rounded px-3 py-2 bg-background resize-none"
            value={note} onChange={(e) => setNote(e.target.value)}
          />
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-3 py-1 border border-border rounded">
              Batal
            </button>
            <button type="submit" disabled={loading} className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
              {loading ? "Simpan..." : "Simpan"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
