"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";

export function UserManagement({ users }: { users: Array<{ id: string; name: string; email: string; role: string }> }) {
  const [open, setOpen] = useState(false);

  const handleLogout = async () => {
    await signOut({ redirect: false });
    window.location.href = "/login";
  };

  return (
    <div className="p-4">
      <h2 className="text-2xl font-bold mb-4">User Management</h2>
      <div className="flex justify-between items-center mb-4">
        <button
          onClick={() => void handleLogout()}
          className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700"
        >
          Logout
        </button>
        <button
          onClick={() => setOpen(true)}
          className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          + Add User
        </button>
      </div>

      {open && (
        <AddUserModal onClose={() => setOpen(false)} />
      )}

      {users.length === 0 ? (
        <p className="text-muted-foreground">No users found</p>
      ) : (
        <table className="min-w-full border border-border bg-card">
          <thead>
            <tr className="text-left">
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-t border-gray-200">
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
      )}
    </div>
  );
}

function AddUserModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("user");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

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
        setErr(d.error || "Failed");
      } else {
        onClose();
        window.location.reload();
      }
    } catch (e) {
      setErr("Network error");
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
      <div className="bg-card rounded-lg p-6 w-full max-w-md">
        <h3 className="text-lg font-semibold mb-4">Add User</h3>
        {err && <p className="text-red-500 mb-2">{err}</p>}
        <form onSubmit={submit} className="space-y-3">
          <input
            type="text" placeholder="Name" required
            className="w-full border border-border rounded px-3 py-2 bg-background"
            value={name} onChange={(e) => setName(e.target.value)}
          />
          <input
            type="email" placeholder="Email" required
            className="w-full border border-border rounded px-3 py-2 bg-background"
            value={email} onChange={(e) => setEmail(e.target.value)}
          />
          <input
            type="password" placeholder="Password" required
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
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DeleteUserButton({ userId, userName }: { userId: string; userName: string }) {
  const del = async () => {
    if (!confirm(`Delete ${userName}?`)) return;
    await fetch(`/api/users/${userId}`, { method: "DELETE" });
    window.location.reload();
  };
  return (
    <button
      onClick={() => void del()}
      className="text-red-500 hover:underline text-sm"
    >
      Delete
    </button>
  );
}
