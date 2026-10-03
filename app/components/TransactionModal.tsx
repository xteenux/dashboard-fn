"use client";

import { useState } from "react";

type Sub = { id: string; name: string };
type Cat = { id: string; name: string; type: string; subcategories: Sub[] };
type AccountOpt = { id: string; name: string; type: string };

export default function TransactionModal({
  onSaved,
  categories = [],
  accounts = [],
  canManageAccounts = false,
}: {
  onSaved?: () => void;
  categories?: Cat[];
  accounts?: AccountOpt[];
  canManageAccounts?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState("Expense");
  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [destAccountId, setDestAccountId] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // Inline create-account form (applies to source dropdown)
  const [addAccount, setAddAccount] = useState(false);
  const [newAccName, setNewAccName] = useState("");
  const [newAccType, setNewAccType] = useState("bank");

  const isTransfer = type === "Transfer-Out";
  const selectedCat = categories.find((c) => c.id === categoryId);
  const subOptions = selectedCat ? selectedCat.subcategories : [];

  // When switching to transfer, auto-select the "Transfer" category if present
  const onTypeChange = (next: string) => {
    setType(next);
    setDestAccountId("");
    if (next === "Transfer-Out") {
      const transferCat = categories.find(
        (c) => c.name.toLowerCase() === "transfer" || c.type.toLowerCase() === "transfer",
      );
      if (transferCat) {
        setCategoryId(transferCat.id);
        setSubcategoryId("");
      }
    }
  };

  const resetForm = () => {
    setAmount(""); setNote(""); setCategoryId(""); setSubcategoryId("");
    setAccountId(""); setDestAccountId(""); setDate(""); setType("Expense");
    setAddAccount(false); setNewAccName(""); setNewAccType("bank");
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
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          amount: parseFloat(amount),
          type,
          note: note || undefined,
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
        onSaved?.();
        setOpen(false);
        resetForm();
      }
    } catch (e) {
      setErr("Tidak dapat terhubung ke server");
    }
    setLoading(false);
  };

  const addNewAccount = async () => {
    if (!newAccName.trim()) return;
    setErr("");
    const res = await fetch("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newAccName.trim(), type: newAccType }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setErr(d.error || "Gagal tambah akun");
      return;
    }
    const created = (await res.json()) as { id: string };
    setAddAccount(false);
    setNewAccName("");
    setNewAccType("bank");
    onSaved?.();
    setAccountId(created.id);
  };

  const fieldCls = "border border-border rounded px-3 py-2 bg-background";
  const accountSelect = (
    value: string,
    onChange: (v: string) => void,
    placeholder: string,
    withAdd = false,
  ) => (
    <select className={fieldCls} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {accounts.map((a) => (
        <option key={a.id} value={a.id}>{a.name} ({a.type})</option>
      ))}
      {withAdd && canManageAccounts && <option value="__add__">+ Tambah baru</option>}
    </select>
  );

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-3 py-1.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
      >
        + Transaksi
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="bg-card rounded-lg p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">Transaksi Baru</h3>
            {err && <p className="text-red-500 mb-2 text-sm">{err}</p>}
            <form onSubmit={submit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <input type="date" required className={`${fieldCls} col-span-2`}
                  value={date} onChange={(e) => setDate(e.target.value)} />
                <input type="number" step="0.01" placeholder="Jumlah" required className={fieldCls}
                  value={amount} onChange={(e) => setAmount(e.target.value)} />
                <select className={fieldCls} value={type} onChange={(e) => onTypeChange(e.target.value)}>
                  <option value="Income">Income</option>
                  <option value="Expense">Expense</option>
                  <option value="Transfer-Out">Transfer-Out</option>
                </select>

                {isTransfer ? (
                  <>
                    {accountSelect(accountId, (v) => {
                      if (v === "__add__") { setAddAccount(true); setAccountId(""); }
                      else { setAddAccount(false); setAccountId(v); }
                    }, "-- Akun Sumber --", true)}
                    {accountSelect(destAccountId, setDestAccountId, "-- Akun Tujuan --", false)}
                  </>
                ) : (
                  <>
                    <select className={`${fieldCls} col-span-2`} value={categoryId}
                      onChange={(e) => { setCategoryId(e.target.value); setSubcategoryId(""); }}>
                      <option value="">-- Pilih Kategori --</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>{c.name} ({c.type})</option>
                      ))}
                    </select>
                    <select className={fieldCls} value={subcategoryId}
                      onChange={(e) => setSubcategoryId(e.target.value)} disabled={!categoryId}>
                      <option value="">-- Subkategori --</option>
                      {subOptions.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                    {accountSelect(accountId, (v) => {
                      if (v === "__add__") { setAddAccount(true); setAccountId(""); }
                      else { setAddAccount(false); setAccountId(v); }
                    }, "-- Pilih Akun --", true)}
                  </>
                )}

                {canManageAccounts && addAccount && (
                  <div className="col-span-2 rounded-lg border border-dashed border-border p-3 space-y-2">
                    <input className={`${fieldCls} w-full`} placeholder="Nama akun baru" value={newAccName}
                      onChange={(e) => setNewAccName(e.target.value)} />
                    <select className={`${fieldCls} w-full`} value={newAccType}
                      onChange={(e) => setNewAccType(e.target.value)}>
                      <option value="bank">Bank</option>
                      <option value="ewallet">E-Wallet</option>
                      <option value="credit">Kartu Kredit</option>
                      <option value="cash">Tunai</option>
                      <option value="investment">Investasi</option>
                    </select>
                    <div className="flex gap-2">
                      <button type="button" onClick={addNewAccount} className="px-3 py-1 bg-blue-600 text-white rounded text-sm">Buat Akun</button>
                      <button type="button" onClick={() => setAddAccount(false)} className="px-3 py-1 border border-border rounded text-sm">Batal</button>
                    </div>
                  </div>
                )}
              </div>
              <textarea placeholder="Catatan (opsional)" rows={2}
                className="w-full border border-border rounded px-3 py-2 bg-background resize-none"
                value={note} onChange={(e) => setNote(e.target.value)} />
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setOpen(false)} className="px-3 py-1 border border-border rounded">
                  Batal
                </button>
                <button type="submit" disabled={loading} className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
                  {loading ? "Simpan..." : "Simpan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
