"use client";

import { useState, useEffect } from "react";
import { formatIDR } from "@/app/lib/utils";
import { useLanguage } from "@/app/lib/i18n";

type Account = {
  id: string;
  name: string;
  type: string;
  balance: number;
};

const inputCls = "border border-border rounded px-3 py-2 bg-background";
const ACCOUNT_TYPES = ["bank", "ewallet", "credit", "cash", "investment"];

export default function AccountsClient() {
  const { t } = useLanguage();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const load = () => {
    fetch("/api/accounts")
      .then((r) => r.json())
      .then((data) => {
        const { accounts: accs } = data;
        setAccounts((accs as Account[]).map((a) => ({ ...a, balance: a.balance || 0 })));
        setErr("");
      })
      .catch(() => setErr(t("acc.failLoad")))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const accountTypeLabel = (v: string) => t(`account.${v}`);

  const handleDelete = async (id: string) => {
    if (!confirm(t("acc.confirmDelete"))) return;
    setErr("");
    const res = await fetch(`/api/accounts/${id}`, { method: "DELETE" });
    if (!res.ok) { setErr(t("acc.failDelete")); return; }
    load();
  };

  return (
    <div className="p-4 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("acc.title")}</h1>
      </div>
      {err && <p className="text-red-500 text-sm">{err}</p>}

      <AddAccount onDone={load} setErr={setErr} />

      {loading ? (
        <div className="text-muted-foreground">{t("cat.loading")}</div>
      ) : (
        <div className="space-y-3">
          {accounts.length === 0 ? (
            <p className="text-muted-foreground">{t("acc.empty")}</p>
          ) : (
            accounts.map((a) => (
              <div key={a.id} className="rounded-xl border border-border bg-card p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium min-w-[120px]">{a.name}</span>
                  <span className="px-2 py-0.5 text-xs rounded bg-muted">{accountTypeLabel(a.type)}</span>
                  <span
                    className={a.balance >= 0 ? "text-green-600 text-sm font-medium" : "text-red-600 text-sm font-medium"}
                  >
                    {formatIDR(a.balance)}
                  </span>
                </div>
                <button
                  onClick={() => handleDelete(a.id)}
                  className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 text-xs"
                >
                  {t("acc.delete")}
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function AddAccount({ onDone, setErr }: { onDone: () => void; setErr: (e: string) => void }) {
  const { t } = useLanguage();
  const [name, setName] = useState("");
  const [type, setType] = useState("bank");

  const submit = async () => {
    if (!name.trim()) return;
    setErr("");
    const res = await fetch("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), type }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setErr(d.error || t("acc.failAdd"));
      return;
    }
    setName("");
    setType("bank");
    onDone();
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <h2 className="font-semibold">{t("acc.addTitle")}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <input
          className={inputCls}
          placeholder={t("acc.namePlaceholder")}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <select className={inputCls} value={type} onChange={(e) => setType(e.target.value)}>
          {ACCOUNT_TYPES.map((v) => (
            <option key={v} value={v}>{t(`account.${v}`)}</option>
          ))}
        </select>
      </div>
      <button
        onClick={submit}
        className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
      >
        {t("acc.save")}
      </button>
    </div>
  );
}