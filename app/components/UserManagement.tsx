"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/app/lib/i18n";

export function UserManagement({ users }: { users: Array<{ id: string; name: string; email: string; role: string }> }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const handleLogout = async () => {
    await signOut({ redirect: false });
    router.push("/login");
  };

  return (
    <div className="p-4">
      <h2 className="text-2xl font-bold mb-4">{t("user.title")}</h2>
      <div className="flex justify-between items-center mb-4">
        <button
          onClick={() => void handleLogout()}
          className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700"
        >
          {t("logout")}
        </button>
        <button
          onClick={() => setOpen(true)}
          className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          {t("user.add")}
        </button>
      </div>

      {open && (
        <AddUserModal onClose={() => setOpen(false)} />
      )}

      {users.length === 0 ? (
        <p className="text-muted-foreground">{t("user.empty")}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="min-w-full">
            <thead>
              <tr className="text-left border-b border-border">
                <th className="px-3 py-2 font-medium text-muted-foreground">{t("user.col.name")}</th>
                <th className="px-3 py-2 font-medium text-muted-foreground">{t("user.col.email")}</th>
                <th className="px-3 py-2 font-medium text-muted-foreground">{t("user.col.role")}</th>
                <th className="px-3 py-2 font-medium text-muted-foreground">{t("user.col.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b border-border last:border-0 hover:bg-accent/50">
                  <td className="px-3 py-2">{user.name}</td>
                  <td className="px-3 py-2">{user.email}</td>
                  <td className="px-3 py-2 capitalize">{user.role}</td>
                  <td className="px-3 py-2">
                    <DeleteUserButton userId={user.id} userName={user.name} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AddUserModal({ onClose }: { onClose: () => void }) {
  const { t } = useLanguage();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("user");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const router = useRouter();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErr("");
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, userRole: role }),
      });
      if (!res.ok) {
        const d = await res.json();
        setErr(d.error || t("user.fail"));
      } else {
        onClose();
        router.refresh();
      }
    } catch {
      setErr(t("user.connError"));
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
      <div className="bg-card rounded-lg p-6 w-full max-w-md">
        <h3 className="text-lg font-semibold mb-4">{t("user.modalTitle")}</h3>
        {err && <p className="text-red-500 mb-2">{err}</p>}
        <form onSubmit={submit} className="space-y-3">
          <input
            type="text" placeholder={t("user.name")} required
            className="w-full border border-border rounded px-3 py-2 bg-background"
            value={name} onChange={(e) => setName(e.target.value)}
          />
          <input
            type="email" placeholder={t("user.email")} required
            className="w-full border border-border rounded px-3 py-2 bg-background"
            value={email} onChange={(e) => setEmail(e.target.value)}
          />
          <input
            type="password" placeholder={t("user.password")} required
            className="w-full border border-border rounded px-3 py-2 bg-background"
            value={password} onChange={(e) => setPassword(e.target.value)}
          />
          <select
            className="w-full border border-border rounded px-3 py-2 bg-background"
            value={role} onChange={(e) => setRole(e.target.value)}
          >
            <option value="owner">Owner</option>
            <option value="manager">Manager</option>
            <option value="user">User</option>
          </select>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1 border border-border rounded"
            >
              {t("user.cancel")}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? t("user.saving") : t("user.save")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DeleteUserButton({ userId, userName }: { userId: string; userName: string }) {
  const { t } = useLanguage();
  const router = useRouter();
  const del = async () => {
    if (!confirm(t("user.confirmDelete", { name: userName }))) return;
    const res = await fetch(`/api/users/${userId}`, { method: "DELETE" });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      alert(d.error || t("user.failDelete"));
      return;
    }
    router.refresh();
  };
  return (
    <button
      onClick={() => void del()}
      className="text-red-500 hover:underline text-sm"
    >
      {t("table.delete")}
    </button>
  );
}