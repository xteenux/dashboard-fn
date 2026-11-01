"use client";

import { createContext, useContext, useState } from "react";

export type Lang = "id" | "en";

type Dict = Record<string, string>;

const id: Dict = {
  // Nav
  "nav.dashboard": "Dashboard",
  "nav.categories": "Kategori",
  "nav.accounts": "Akun",
  "nav.users": "User",
  "nav.aria": "Navigasi utama",
  "logout": "Keluar",

  // AI chat (Mjolmile)
  "ai.open": "Buka asisten keuangan Mjolmile",
  "ai.steward": "Steward of Commerce — data Anda, dihitung dari ledger",
  "ai.modeDet": "Mode deterministik — LLM offline",
  "ai.thinking": "Menghitung…",
  "ai.placeholder": "Tanya saldo, pengeluaran, tren…",
  "ai.send": "Kirim",

  // Theme / language toggle
  "toggle.theme": "Ubah tema",
  "toggle.lang": "Ubah bahasa",

  // Transaction types
  "type.income": "Pemasukan",
  "type.expense": "Pengeluaran",
  "type.transfer": "Transfer Keluar",

  // Filters
  "filter.all": "Semua",
  "filter.reset": "Atur Ulang",
  "filter.categoryPlaceholder": "Semua kategori",
  "filter.month": "Semua bulan",
  "filter.monthAria": "Bulan transaksi",
  "filter.accountPlaceholder": "Semua akun",
  "filter.accountAria": "Akun",

  // KPI
  "kpi.totalIncome": "Total Pemasukan",
  "kpi.totalExpense": "Total Pengeluaran",
  "kpi.netBalance": "Saldo Bersih",
  "kpi.savingsRate": "Tingkat Nabung",
  "kpi.txCount": "{n} transaksi",

  // Charts
  "chart.income": "Pemasukan",
  "chart.expense": "Pengeluaran",
  "chart.net": "Bersih",
  "chart.amount": "Nominal",
  "cashflow.title": "Arus Kas",
  "cashflow.subtitle": "Tren pemasukan dan pengeluaran bulanan",
  "expenseByCat.title": "Pengeluaran per Kategori",
  "expenseByCat.subtitle": "Bagaimana belanja terbagi",
  "topSubcat.title": "Top subkategori pengeluaran",
  "topSubcat.subtitle": "10 terbesar dari total belanja",
  "incomeSource.title": "Sumber pemasukan",
  "incomeSource.subtitle": "Dari mana uang masuk",
  "incomeSource.empty": "Belum ada pemasukan pada rentang ini.",

  // Account balance
  "balance.title": "Saldo Akun",
  "balance.subtitle": "Total aset di semua akun",
  "balance.totalLabel": "Total saldo",

  // Trend
  "trend.prevMonth": "vs bulan lalu",
  "trend.noData": "belum ada data bulan lalu",

  // Table
  "table.title": "Transaksi",
  "table.shown": "Menampilkan {shown} dari {total}",
  "table.searchPlaceholder": "Cari catatan, kategori, akun…",
  "table.page": "Hal. {page} dari {pages}",
  "table.prev": "Sebelumnya",
  "table.next": "Berikutnya",
  "table.edit": "Ubah",
  "table.delete": "Hapus",
  "table.emptyTitle": "Tidak ada transaksi yang cocok",
  "table.emptyDesc": "Coba ubah filter tanggal, kategori, atau kata kunci pencarian.",

  // Table columns
  "col.date": "Tanggal",
  "col.type": "Tipe",
  "col.account": "Akun",
  "col.category": "Kategori",
  "col.subcategory": "Subkategori",
  "col.note": "Catatan",
  "col.amount": "Nominal",

  // Empty state (no tx at all)
  "noTxYet": "Belum ada transaksi. Klik + Transaksi untuk memulai.",

  // Toasts & confirm
  "toast.saved": "Transaksi tersimpan",
  "toast.deleted": "Transaksi dihapus",
  "toast.deleteFail": "Gagal menghapus transaksi",
  "toast.connError": "Tidak dapat terhubung ke server",
  "toast.updated": "Perubahan tersimpan",
  "tx.confirmDelete": "Hapus transaksi ini? Tindakan ini tidak dapat dibatalkan.",

  // Filter aria
  "filter.startDate": "Tanggal mulai",
  "filter.endDate": "Tanggal akhir",
  "filter.typeAria": "Tipe transaksi",
  "filter.categoryAria": "Kategori",

  // Import
  "import.open": "Impor",
  "import.title": "Impor Laporan Keuangan",
  "import.desc": "Unggah CSV, Excel, atau PDF laporan bank. Hasil akan ditampilkan untuk review sebelum masuk database.",
  "import.accountLabel": "Akun sumber (opsional)",
  "import.accountPlaceholder": "Contoh: BCA, Mandiri",
  "import.parse": "Proses File",
  "import.parsing": "Memproses…",
  "import.cancel": "Batal",
  "import.back": "Kembali",
  "import.commit": "Impor ke Database",
  "import.committing": "Mengimpor…",
  "import.duplicate": "duplikat",
  "import.parseFail": "Gagal memproses file",
  "import.commitFail": "Gagal mengimpor transaksi",
  "import.connError": "Tidak dapat terhubung ke server",

  // Transaction modal
  "tx.new": "+ Transaksi",
  "tx.newTitle": "Transaksi Baru",
  "tx.editTitle": "Edit Transaksi",
  "tx.amount": "Jumlah",
  "tx.note": "Catatan (opsional)",
  "tx.sourceAccount": "-- Akun Sumber --",
  "tx.destAccount": "-- Akun Tujuan --",
  "tx.selectCategory": "-- Pilih Kategori --",
  "tx.subcategory": "-- Subkategori --",
  "tx.selectAccount": "-- Pilih Akun --",
  "tx.addNewAccount": "+ Tambah baru",
  "tx.newAccountName": "Nama akun baru",
  "tx.createAccount": "Buat Akun",
  "tx.cancel": "Batal",
  "tx.save": "Simpan",
  "tx.saving": "Simpan...",
  "tx.transferRequiresBoth": "Transfer wajib memilih akun sumber dan akun tujuan",
  "tx.sameAccount": "Akun sumber dan tujuan tidak boleh sama",
  "tx.failed": "Gagal ({status})",
  "tx.connError": "Tidak dapat terhubung ke server",

  // Account types
  "account.bank": "Bank",
  "account.ewallet": "E-Wallet",
  "account.credit": "Kartu Kredit",
  "account.cash": "Tunai",
  "account.investment": "Investasi",

  // Categories page
  "cat.type.income": "Pemasukan",
  "cat.type.expense": "Pengeluaran",
  "cat.type.transfer": "Transfer",
  "cat.title": "Kelola Kategori & Subkategori",
  "cat.loading": "Loading...",
  "cat.empty": "Belum ada kategori. Tambahkan di atas.",
  "cat.addTitle": "Tambah Kategori Baru",
  "cat.namePlaceholder": "Nama kategori",
  "cat.emojiPlaceholder": "Emoji (opsional)",
  "cat.save": "Simpan Kategori",
  "cat.failAdd": "Gagal tambah kategori",
  "cat.failSave": "Gagal simpan kategori",
  "cat.failDelete": "Gagal hapus",
  "cat.confirmDelete": "Hapus kategori \"{name}\"? Subkategorinya juga hilang.",
  "cat.edit": "Edit",
  "cat.delete": "Hapus",
  "cat.subcategoryLabel": "Subkategori:",
  "cat.noSub": "Belum ada subkategori",
  "cat.newSubPlaceholder": "Nama subkategori baru",
  "cat.addSub": "+ Tambah",
  "cat.failAddSub": "Gagal tambah subkategori",
  "cat.failSaveSub": "Gagal simpan subkategori",
  "cat.failDeleteSub": "Gagal hapus subkategori",
  "cat.confirmDeleteSub": "Hapus subkategori \"{name}\"?",
  "cat.cancel": "Batal",

  // Accounts page
  "acc.title": "Kelola Akun",
  "acc.empty": "Belum ada akun. Tambahkan di atas.",
  "acc.failLoad": "Gagal muat akun",
  "acc.confirmDelete": "Hapus akun ini?",
  "acc.failDelete": "Gagal hapus",
  "acc.delete": "Hapus",
  "acc.addTitle": "Tambah Akun Baru",
  "acc.namePlaceholder": "Nama akun",
  "acc.save": "Simpan Akun",
  "acc.failAdd": "Gagal tambah akun",

  // User management
  "user.title": "Kelola User",
  "user.add": "+ Tambah User",
  "user.empty": "Belum ada user",
  "user.col.name": "Nama",
  "user.col.email": "Email",
  "user.col.role": "Role",
  "user.col.actions": "Aksi",
  "user.modalTitle": "Tambah User",
  "user.name": "Nama",
  "user.email": "Email",
  "user.password": "Password",
  "user.save": "Simpan",
  "user.saving": "Menyimpan...",
  "user.cancel": "Batal",
  "user.fail": "Gagal",
  "user.connError": "Gagal terhubung ke server",
  "user.confirmDelete": "Hapus user {name}? Tindakan ini tidak dapat dibatalkan.",
  "user.failDelete": "Gagal menghapus user",

  // Login
  "login.email": "Email",
  "login.password": "Password",
  "login.error": "Email atau password salah",
  "login.submit": "Masuk",
  "login.submitting": "Sedang masuk…",
  "login.footer": "Hubungi admin untuk mendapatkan akses",
  "login.showPass": "Tampilkan password",
  "login.hidePass": "Sembunyikan password",
};

const en: Dict = {
  "nav.dashboard": "Dashboard",
  "nav.categories": "Categories",
  "nav.accounts": "Accounts",
  "nav.users": "Users",
  "nav.aria": "Main navigation",
  "logout": "Sign out",

  // AI chat (Mjolmile)
  "ai.open": "Open Mjolmile finance assistant",
  "ai.steward": "Steward of Commerce — your data, computed from the ledger",
  "ai.modeDet": "Deterministic mode — LLM offline",
  "ai.thinking": "Computing…",
  "ai.placeholder": "Ask balances, spending, trends…",
  "ai.send": "Send",

  "toggle.theme": "Toggle theme",
  "toggle.lang": "Toggle language",

  "type.income": "Income",
  "type.expense": "Expense",
  "type.transfer": "Transfer Out",

  "filter.all": "All",
  "filter.reset": "Reset",
  "filter.categoryPlaceholder": "All categories",
  "filter.month": "All months",
  "filter.monthAria": "Transaction month",
  "filter.accountPlaceholder": "All accounts",
  "filter.accountAria": "Account",

  "kpi.totalIncome": "Total Income",
  "kpi.totalExpense": "Total Expense",
  "kpi.netBalance": "Net Balance",
  "kpi.savingsRate": "Savings Rate",
  "kpi.txCount": "{n} transactions",

  "chart.income": "Income",
  "chart.expense": "Expense",
  "chart.net": "Net",
  "chart.amount": "Amount",
  "cashflow.title": "Cash Flow",
  "cashflow.subtitle": "Monthly income vs expense trend",
  "expenseByCat.title": "Expense by Category",
  "expenseByCat.subtitle": "How spending is distributed",
  "topSubcat.title": "Top expense subcategories",
  "topSubcat.subtitle": "Top 10 by total spend",
  "incomeSource.title": "Income sources",
  "incomeSource.subtitle": "Where money comes in",
  "incomeSource.empty": "No income in this range.",

  "balance.title": "Account Balance",
  "balance.subtitle": "Total assets across all accounts",
  "balance.totalLabel": "Total balance",

  "trend.prevMonth": "vs prev month",
  "trend.noData": "no prev month data",

  "table.title": "Transactions",
  "table.shown": "Showing {shown} of {total}",
  "table.searchPlaceholder": "Search notes, categories, accounts…",
  "table.page": "Page {page} of {pages}",
  "table.prev": "Prev",
  "table.next": "Next",
  "table.edit": "Edit",
  "table.delete": "Delete",
  "table.emptyTitle": "No matching transactions",
  "table.emptyDesc": "Try changing the date, category, or search filters.",

  "col.date": "Date",
  "col.type": "Type",
  "col.account": "Account",
  "col.category": "Category",
  "col.subcategory": "Subcategory",
  "col.note": "Note",
  "col.amount": "Amount",

  "noTxYet": "No transactions yet. Click + Transaction to get started.",

  "toast.saved": "Transaction saved",
  "toast.deleted": "Transaction deleted",
  "toast.deleteFail": "Failed to delete transaction",
  "toast.connError": "Cannot reach server",
  "toast.updated": "Changes saved",
  "tx.confirmDelete": "Delete this transaction? This cannot be undone.",

  "filter.startDate": "Start date",
  "filter.endDate": "End date",
  "filter.typeAria": "Transaction type",
  "filter.categoryAria": "Category",

  "import.open": "Import",
  "import.title": "Import Financial Report",
  "import.desc": "Upload a CSV, Excel, or PDF bank statement. Results are shown for review before they enter the database.",
  "import.accountLabel": "Source account (optional)",
  "import.accountPlaceholder": "e.g. BCA, Mandiri",
  "import.parse": "Process File",
  "import.parsing": "Processing…",
  "import.cancel": "Cancel",
  "import.back": "Back",
  "import.commit": "Import to Database",
  "import.committing": "Importing…",
  "import.duplicate": "duplicate",
  "import.parseFail": "Failed to process file",
  "import.commitFail": "Failed to import transactions",
  "import.connError": "Cannot reach server",

  "tx.new": "+ Transaction",
  "tx.newTitle": "New Transaction",
  "tx.editTitle": "Edit Transaction",
  "tx.amount": "Amount",
  "tx.note": "Note (optional)",
  "tx.sourceAccount": "-- Source Account --",
  "tx.destAccount": "-- Destination Account --",
  "tx.selectCategory": "-- Select Category --",
  "tx.subcategory": "-- Subcategory --",
  "tx.selectAccount": "-- Select Account --",
  "tx.addNewAccount": "+ Add new",
  "tx.newAccountName": "New account name",
  "tx.createAccount": "Create Account",
  "tx.cancel": "Cancel",
  "tx.save": "Save",
  "tx.saving": "Saving...",
  "tx.transferRequiresBoth": "Transfer requires both source and destination accounts",
  "tx.sameAccount": "Source and destination accounts cannot be the same",
  "tx.failed": "Failed ({status})",
  "tx.connError": "Cannot reach server",

  "account.bank": "Bank",
  "account.ewallet": "E-Wallet",
  "account.credit": "Credit Card",
  "account.cash": "Cash",
  "account.investment": "Investment",

  "cat.type.income": "Income",
  "cat.type.expense": "Expense",
  "cat.type.transfer": "Transfer",
  "cat.title": "Manage Categories & Subcategories",
  "cat.loading": "Loading...",
  "cat.empty": "No categories yet. Add one above.",
  "cat.addTitle": "Add New Category",
  "cat.namePlaceholder": "Category name",
  "cat.emojiPlaceholder": "Emoji (optional)",
  "cat.save": "Save Category",
  "cat.failAdd": "Failed to add category",
  "cat.failSave": "Failed to save category",
  "cat.failDelete": "Failed to delete",
  "cat.confirmDelete": "Delete category \"{name}\"? Its subcategories will be removed too.",
  "cat.edit": "Edit",
  "cat.delete": "Delete",
  "cat.subcategoryLabel": "Subcategories:",
  "cat.noSub": "No subcategories yet",
  "cat.newSubPlaceholder": "New subcategory name",
  "cat.addSub": "+ Add",
  "cat.failAddSub": "Failed to add subcategory",
  "cat.failSaveSub": "Failed to save subcategory",
  "cat.failDeleteSub": "Failed to delete subcategory",
  "cat.confirmDeleteSub": "Delete subcategory \"{name}\"?",
  "cat.cancel": "Cancel",

  "acc.title": "Manage Accounts",
  "acc.empty": "No accounts yet. Add one above.",
  "acc.failLoad": "Failed to load accounts",
  "acc.confirmDelete": "Delete this account?",
  "acc.failDelete": "Failed to delete",
  "acc.delete": "Delete",
  "acc.addTitle": "Add New Account",
  "acc.namePlaceholder": "Account name",
  "acc.save": "Save Account",
  "acc.failAdd": "Failed to add account",

  "user.title": "Manage Users",
  "user.add": "+ Add User",
  "user.empty": "No users yet",
  "user.col.name": "Name",
  "user.col.email": "Email",
  "user.col.role": "Role",
  "user.col.actions": "Actions",
  "user.modalTitle": "Add User",
  "user.name": "Name",
  "user.email": "Email",
  "user.password": "Password",
  "user.save": "Save",
  "user.saving": "Saving...",
  "user.cancel": "Cancel",
  "user.fail": "Failed",
  "user.connError": "Cannot reach server",
  "user.confirmDelete": "Delete user {name}? This cannot be undone.",
  "user.failDelete": "Failed to delete user",

  "login.email": "Email",
  "login.password": "Password",
  "login.error": "Incorrect email or password",
  "login.submit": "Sign in",
  "login.submitting": "Signing in…",
  "login.footer": "Contact admin to get access",
  "login.showPass": "Show password",
  "login.hidePass": "Hide password",
};

const dicts: Record<Lang, Dict> = { id, en };

type Ctx = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

const LanguageContext = createContext<Ctx>({
  lang: "id",
  setLang: () => {},
  t: (k: string) => k,
});

export function LanguageProvider({
  children,
  initialLang,
}: {
  children: React.ReactNode;
  initialLang: Lang;
}) {
  const [lang, setLangState] = useState<Lang>(initialLang);

  const setLang = (l: Lang) => {
    setLangState(l);
    document.cookie = `lang=${l}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.lang = l;
  };

  const t = (key: string, vars?: Record<string, string | number>) => {
    let s = dicts[lang][key] ?? dicts.id[key] ?? key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        s = s.replaceAll(`{${k}}`, String(v));
      }
    }
    return s;
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export const useLanguage = () => useContext(LanguageContext);