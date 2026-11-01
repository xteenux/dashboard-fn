/**
 * Health score component computation — dipakai DashboardHero & OverviewCards.
 * Formula (sama dengan hero lama): savings 40% + budget/liabilitas 25% + trend MoM 20% + konsentrasi kategori 15%.
 */

export interface HealthInput {
  income: number;
  expense: number;
  net: number;
  topShare: number | null; // % share kategori expense terbesar (0-100)
  prevExpense: number | null; // total expense window setara sebelumnya
  balances?: { total: number; assets: number } | null;
}

export function computeHealth(inp: HealthInput): number {
  const savingsScore = inp.income > 0 ? Math.max(0, Math.min(1, inp.net / inp.income / 0.25)) : 0.3;
  const concentration = inp.topShare == null ? 0.4 : Math.max(0, Math.min(1, 1 - (inp.topShare - 25) / 60));
  const trend = inp.prevExpense != null && inp.prevExpense > 0
    ? Math.max(0, Math.min(1, 1 - Math.max(0, (inp.expense - inp.prevExpense) / inp.prevExpense) / 0.3))
    : 0.6;
  const liability = inp.balances && inp.balances.assets
    ? Math.max(0, Math.min(1, 1 - Math.abs(Math.min(0, inp.balances.total)) / Math.max(1, inp.balances.assets)))
    : 0.5;
  const raw = savingsScore * 0.4 + liability * 0.25 + trend * 0.2 + concentration * 0.15;
  return Math.round(Math.max(0, Math.min(100, raw * 100)));
}

export function healthLabel(score: number, en: boolean): string {
  return score >= 70 ? (en ? "Healthy" : "Sehat")
    : score >= 45 ? (en ? "Needs work" : "Perlu diperbaiki")
    : (en ? "At risk" : "Berisiko");
}

export function healthColor(score: number): string {
  return score >= 70 ? "#16a34a" : score >= 45 ? "#d97706" : "#dc2626";
}

/** Mode skor ring — dipakai bersama. */
export function ScoreRing({ value, color, size = 56 }: { value: number; color: string; size?: number }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" role="img" aria-label={`${value}`}>
      <circle cx="28" cy="28" r={r} fill="none" stroke="var(--border)" strokeWidth="5" />
      <circle
        cx="28" cy="28" r={r} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round"
        strokeDasharray={`${(value / 100) * c} ${c}`} transform="rotate(-90 28 28)"
      />
      <text x="28" y="32" textAnchor="middle" fontSize="15" fontWeight="700" fill="var(--foreground)">{value}</text>
    </svg>
  );
}
