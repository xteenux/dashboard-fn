# dashboard-fn — Status Notes

> Ditulis: 2026-11-01 (Kurobe). Tujuan: catatan apa yang sudah jalan + apa yang belum bisa di mesin ini, biar pindah mesin tinggal lanjut.

## Stack

Next.js (App Router) + Prisma + SQLite (`DATABASE_URL="file:./dev.db"` → `prisma/dev.db`) + NextAuth (jose, role owner/user, RBAC) + Tailwind + Recharts.

---

## Sudah Jalan / Ada

### Auth & akses
- Login (NextAuth), role `owner` vs `user`, RBAC di API (`app/lib/api-auth.ts`).
- Halaman: Dashboard, Kategori, Akun, User management (owner-only), bahasa EN/ID.

### i18n
- Custom lightweight (`app/lib/i18n.tsx`), default Indonesia, toggle EN. Semua label UI ke-translate; kategori DB tetap English+emoji.

### Dashboard
- `OverviewCards`: Pemasukan / Pengeluaran / Arus bersih + delta vs periode sebelumnya.
- Skor kesehatan finansial + tingkat nabung + jumlah transaksi.
- Insight cards (movers per kategori, belanja terbesar, langganan).
- Chart: Arus Kas bulanan (line), pengeluaran per kategori (donut), top subkategori (bar), sumber pemasukan (bar).
- Panel transaksi: grouped list per tanggal + total harian, emoji kategori, hover edit/delete, scroll max-h.
- Filter: bulan (select per `YYYY-MM`), akun, tipe, kategori, teks cari.
- **Default filter = 30 hari terakhir** saat dashboard dibuka.

### AI / chat panel "Mjolmile"
- `/api/ai/chat`: tool-based (get_summary, get_balances, get_category_breakdown, search_transactions, get_monthly_series). LLM lokal (model `Combo`, gateway `LOCAL_LLM_BASE_URL`) cuma merangkai bahasa; angka dari DB via kode. Fallback deterministik kalau gateway mati.
- Persona di `app/lib/ai/persona.ts` (MJOLMILE_SYSTEM_PROMPT).
- NL entry (`/api/ai/parse-tx`): hybrid opsi 3 — regex instan, AI auto-call hanya saat `isUncertain` + debounce 800ms + dedupe.

### Transfer
- Tipe `Transfer-Out` dengan `accountId` (sumber) + `destAccountId` (tujuan).
- Balance dua sisi (`app/lib/balances.ts`) + fallback legacy `rawCategory`/`TRANSFER_DEST_NAMES`.
- Fix `data.ts`: transfer lama (`destAccountId` null) backfill `destAccountName` dari `rawCategory` supaya list & filter akun lihat sisi tujuan.

### Impor laporan (Opsi A)
- Tombol "Impor" di panel transaksi → modal → parse → preview editable → commit.
- Format: CSV, XLSX/XLS, PDF. Dua parser (`app/lib/import-parse.ts`):
  - Bank statement (deteksi kolom tanggal/deskripsi/debit/kredit).
  - **Fluxo / Money Manager export** (`isFluxoHeader`: kolom `Income/Expense` + `Subcategory`; mapping `Account` sumber, `Category` tujuan untuk Transfer-Out).
- Preview editable per baris: kategori (dropdown), subkategori (input), akun sumber (dropdown), akun tujuan (dropdown, khusus transfer).
- Duplicate detection (mau tetap bisa di-input — tidak memblokir/gray).
- Max 5000 item per commit. Review before commit.
- Fix timezone tanggal Excel: JANGAN `toISOString()`; serial dibaca getter UTC sebagai tanggal murni (host `Asia/Shanghai +0800`).

### Baru ditambah sesi terakhir
- Limit import 500 → 5000.
- Duplicate tidak lagi di-skip/disable di preview & commit.
- Subkategori editable di preview import.

---

## Pending / Belum Bisa di Mesin Ini

### Terblokir kapasitas (RAM ~1.9GB)
- **Vision model tidak reliabel** (`qwen-3.8-27b` vision: timeout / HTTP 503 / `429 capacity_exhausted`). Jangan andalkan `vision_analyze`; minta user deskripsikan file.
- **Panel chat pakai profil `mjolmile` sungguhan** (Hermes subprocess / `hermes serve`) → makan RAM, lambat. Sekarang pakai LLM mentah + persona `persona.ts`. Profil mjolmile ada & jalan (`mjolmile chat`), cuma belum disambung.
- **`npm run dev` OOM-kill 4×** → wajib production: `npm run build` lalu `npm run start`.

### Belum dikerjakan (teknis feasible, tapi belum)
- **Persistensi server**: `npm run start` jalan sebagai background session chat → mati kalau sesi terputus. Belum pasang systemd/PM2.
- **Transfer auto-mirror**: balance sudah 2 sisi, tapi table transaksi cuma 1 baris `Transfer-Out` (belum ada baris Income mirror di akun tujuan).
- **Seed data**: `money_data.json` tak ada di `/root` → `prisma db seed` crash.

---

## Konvensi mesin ini
- Build ulang tiap selesai edit: `cd /root/dashboard-fn && npm run build` (±1–2 mnt, log `/tmp/dash-build.log`) lalu restart `npm run start`.
- Cek listener: `ss -tlnp | grep :3000`.
- Preview wajib IP publik `http://129.226.203.62:3000` (localhost → redirect loop).
- `.env` (gitignored) berisi `LOCAL_LLM_*` + `AUTH_SECRET` dll — jangan commit.
- Git commit/push: monopoli raphael (kecuali diarahkan My Lord langsung).