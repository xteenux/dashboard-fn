/**
 * AI Plan Settings — rasio & ambang untuk Komponen INSIGHT dan ACTION PLAN.
 *
 * Di mana angka-angka ini dipakai:
 *  - ActionPlan.tsx: rasio pangkas tiap aksi (food/salon belanja/transport/langganan),
 *    porsi auto-debit, porsi income stream, ambang minimal transaksi.
 *  - InsightCards.tsx: ambang savings rate "sehat", share kategori "dominan",
 *    deteksi langganan, ambang minimum MoM movers.
 *
 * Sengaja file terpisah (satu sumber kebenaran) supaya bisa diedit tanpa
 * menyentuh komponen; nilai default sama dengan perilaku sebelum di-configurable.
 */

export interface PlanConfig {
  /** Aksi "masak lebih sering": hemat X% dari biaya kategori makan. */
  foodCutPct: number; // 0..1
  /** Aksi "aturan 72 jam": hemat X% dari biaya belanja. */
  shopCutPct: number; // 0..1
  /** Aksi "gabung perjalanan": hemat X% dari biaya transport. */
  transportCutPct: number; // 0..1
  /** Aksi "rotasi langganan": hemat X% dari total langganan. */
  subscriptionCutPct: number; // 0..1
  /** Aksi "auto-debit tabungan": X% dari total pengeluaran. */
  autoDebitPct: number; // 0..1
  /** Aksi "stream tambahan X pemasukan" diaktifkan ketika savings rate < ini (0..1). */
  incomeStreamThreshold: number;
  /** Minimum pemasukan stream tambahan (dibulatkan, dalam rupiah). */
  incomeStreamFloor: number;
  /** Minimal total biaya kategori makan agar aksi masak muncul. */
  minFoodSpend: number;
  /** Minimal total biaya belanja agar aksi 72 jam muncul. */
  minShopSpend: number;
  /** Minimal jumlah trip transport agar aksi gabung perjalanan muncul. */
  minTransportTrips: number;
  /** Minimal jumlah langganan (transaksi) agar aksi rotasi muncul. */
  minSubscriptionCount: number;
  /** Insight: savings rate dianggap sehat bila >= ini (0..1). */
  healthySavingsRate: number;
  /** Insight: kategori dianggap "dominan" bila share-nya > ini (0..1). */
  dominantCategoryShare: number;
  /** Insight: MoM/mover signifikan bila delta >= max(ini, X% dari pengeluaran). */
  moverMinAbs: number;
  /** Insight: mover signifikan bila >= X% dari total pengeluaran periode. */
  moverMinPctOfExpense: number;
}

export const DEFAULT_PLAN_CONFIG: PlanConfig = {
  foodCutPct: 0.25,
  shopCutPct: 0.2,
  transportCutPct: 0.18,
  subscriptionCutPct: 0.3,
  autoDebitPct: 0.1,
  incomeStreamThreshold: 0.2,
  incomeStreamFloor: 50000,
  minFoodSpend: 0,
  minShopSpend: 0,
  minTransportTrips: 6,
  minSubscriptionCount: 2,
  healthySavingsRate: 0.2,
  dominantCategoryShare: 0.35, // peringatan share >35%; >40% tampilan warning lebih keras
  moverMinAbs: 25000,
  moverMinPctOfExpense: 0.04,
};

/** Merge deeply user-set overrides on top of defaults (undefined -> default). */
export function resolvePlanConfig(raw?: Partial<PlanConfig> | null): PlanConfig {
  return { ...DEFAULT_PLAN_CONFIG, ...(raw || {}) };
}