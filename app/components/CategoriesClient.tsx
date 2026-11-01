"use client";

import { useState, useEffect } from "react";
import { useLanguage } from "@/app/lib/i18n";

type Sub = { id: string; name: string };
type Category = {
  id: string;
  name: string;
  emoji: string | null;
  type: string;
  subcategories: Sub[];
};

const inputCls = "border border-border rounded px-3 py-2 bg-background";

export default function CategoriesClient() {
  const { t } = useLanguage();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const load = () => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then((data) => { setCategories(data); setLoading(false); });
  };
  useEffect(load, []);

  const catTypeLabel = (v: string) => t(`cat.type.${v}`);

  return (
    <div className="p-4 space-y-6 max-w-4xl">
      <h1 className="text-2xl font-bold">{t("cat.title")}</h1>
      {err && <p className="text-red-500 text-sm">{err}</p>}

      <AddCategory onDone={load} setErr={setErr} />

      {loading ? (
        <div className="text-muted-foreground">{t("cat.loading")}</div>
      ) : (
        categories.map((cat) => (
          <CategoryCard key={cat.id} cat={cat} setErr={setErr} onChanged={load} />
        ))
      )}
      {!loading && categories.length === 0 && (
        <p className="text-muted-foreground">{t("cat.empty")}</p>
      )}
    </div>
  );
}

function AddCategory({ onDone, setErr }: { onDone: () => void; setErr: (e: string) => void }) {
  const { t } = useLanguage();
  const [name, setName] = useState("");
  const [type, setType] = useState("expense");
  const [emoji, setEmoji] = useState("");

  const submit = async () => {
    if (!name.trim()) return;
    setErr("");
    const res = await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), type, emoji: emoji || null }),
    });
    if (!res.ok) { setErr(t("cat.failAdd")); return; }
    setName(""); setEmoji(""); setType("expense");
    onDone();
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <h2 className="font-semibold">{t("cat.addTitle")}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <input className={inputCls} placeholder={t("cat.namePlaceholder")} value={name} onChange={(e) => setName(e.target.value)} />
        <select className={inputCls} value={type} onChange={(e) => setType(e.target.value)}>
          <option value="income">{t("cat.type.income")}</option>
          <option value="expense">{t("cat.type.expense")}</option>
          <option value="transfer">{t("cat.type.transfer")}</option>
        </select>
        <input className={inputCls} placeholder={t("cat.emojiPlaceholder")} value={emoji} onChange={(e) => setEmoji(e.target.value)} />
      </div>
      <button onClick={submit} className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700">{t("cat.save")}</button>
    </div>
  );
}

function CategoryCard({ cat, setErr, onChanged }: { cat: Category; setErr: (e: string) => void; onChanged: () => void }) {
  const { t } = useLanguage();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(cat.name);
  const [type, setType] = useState(cat.type);
  const [emoji, setEmoji] = useState(cat.emoji || "");

  const save = async () => {
    setErr("");
    const res = await fetch(`/api/categories/${cat.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), type, emoji: emoji || null }),
    });
    if (!res.ok) { setErr(t("cat.failSave")); return; }
    setEditing(false);
    onChanged();
  };

  const del = async () => {
    if (!confirm(t("cat.confirmDelete", { name: cat.name }))) return;
    const res = await fetch(`/api/categories/${cat.id}`, { method: "DELETE" });
    if (!res.ok) { setErr(t("cat.failDelete")); return; }
    onChanged();
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        {editing ? (
          <>
            <input className={`${inputCls} flex-1 min-w-[160px]`} value={name} onChange={(e) => setName(e.target.value)} />
            <select className={inputCls} value={type} onChange={(e) => setType(e.target.value)}>
              <option value="income">{t("cat.type.income")}</option>
              <option value="expense">{t("cat.type.expense")}</option>
              <option value="transfer">{t("cat.type.transfer")}</option>
            </select>
            <input className={`${inputCls} w-16`} placeholder="Emoji" value={emoji} onChange={(e) => setEmoji(e.target.value)} />
            <button onClick={save} className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700">{t("tx.save")}</button>
            <button onClick={() => { setEditing(false); setName(cat.name); setType(cat.type); setEmoji(cat.emoji || ""); }} className="px-3 py-1 border border-border rounded">{t("cat.cancel")}</button>
          </>
        ) : (
          <>
            <span className="text-lg leading-none">
              {cat.emoji || (
                <svg className="w-5 h-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h6a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" /></svg>
              )}
            </span>
            <strong className="flex-1">{cat.name}</strong>
            <span className="px-2 py-0.5 text-xs rounded bg-muted">{t(`cat.type.${cat.type}`)}</span>
            <button onClick={() => setEditing(true)} className="px-3 py-1 border border-border rounded text-xs">{t("cat.edit")}</button>
            <button onClick={del} className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 text-xs">{t("cat.delete")}</button>
          </>
        )}
      </div>

      <div className="pl-4 border-l-2 border-border space-y-2">
        <span className="text-sm text-muted-foreground">{t("cat.subcategoryLabel")}</span>
        <AddSubcat catId={cat.id} setErr={setErr} onDone={onChanged} />
        {cat.subcategories.length === 0 ? (
          <p className="text-sm text-muted-foreground pl-6">{t("cat.noSub")}</p>
        ) : (
          <ul className="space-y-1 pl-6">
            {cat.subcategories.map((sub) => (
              <SubcatRow key={sub.id} catId={cat.id} sub={sub} setErr={setErr} onDone={onChanged} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function AddSubcat({ catId, setErr, onDone }: { catId: string; setErr: (e: string) => void; onDone: () => void }) {
  const { t } = useLanguage();
  const [name, setName] = useState("");
  const submit = async () => {
    if (!name.trim()) return;
    setErr("");
    const res = await fetch("/api/subcategories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), categoryId: catId }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setErr(d.error || t("cat.failAddSub"));
      return;
    }
    setName("");
    onDone();
  };
  return (
    <div className="flex items-center gap-2 py-2">
      <input
        className={`${inputCls} flex-1 max-w-xs`}
        placeholder={t("cat.newSubPlaceholder")}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), submit())}
      />
      <button onClick={submit} className="px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm">{t("cat.addSub")}</button>
    </div>
  );
}

function SubcatRow({ catId, sub, setErr, onDone }: { catId: string; sub: Sub; setErr: (e: string) => void; onDone: () => void }) {
  const { t } = useLanguage();
  const [val, setVal] = useState(sub.name);
  const dirty = val.trim() !== sub.name && val.trim().length > 0;

  const save = async () => {
    if (!dirty) return;
    setErr("");
    const res = await fetch("/api/subcategories", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: sub.id, name: val.trim() }),
    });
    if (!res.ok) { setErr(t("cat.failSaveSub")); return; }
    onDone();
  };

  const del = async () => {
    if (!confirm(t("cat.confirmDeleteSub", { name: sub.name }))) return;
    const res = await fetch(`/api/subcategories?id=${sub.id}`, { method: "DELETE" });
    if (!res.ok) { setErr(t("cat.failDeleteSub")); return; }
    onDone();
  };

  return (
    <li className="flex items-center gap-2">
      <input
        className={`${inputCls} flex-1 text-sm max-w-xs`}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={save}
      />
      {dirty && (
        <button onClick={save} className="px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700">{t("tx.save")}</button>
      )}
      <button onClick={del} className="px-2 py-1 text-red-500 hover:underline text-sm">{t("cat.delete")}</button>
    </li>
  );
}