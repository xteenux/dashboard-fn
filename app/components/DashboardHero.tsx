"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLanguage } from "@/app/lib/i18n";
import type { Tx } from "@/app/components/DashboardClient";

/**
 * Hero = panel chat Mjolmile INLINE (thread hidup di kartu, bukan pop-up).
 * - Header: avatar + "Asisten Keuangan Mjolmile" + dot hijau "Live · N transaksi terbaca"
 * - Thread: bubble user kanan, kartu AI kiri
 * - Chips saran pertanyaan + input footer (tombol kirim panah atas)
 * Angka dari /api/ai/chat (DB), LLM lokal compose; fallback deterministik.
 */

export interface HeroProps {
  filtered: Tx[];
}

interface Msg {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS_ID = [
  "Berapa pengeluaranku bulan ini?",
  "Kategori paling besar?",
  "Bisa nabung berapa?",
  "Bandingkan bulan lalu",
];

const SUGGESTIONS_EN = [
  "How much did I spend this month?",
  "Biggest category?",
  "How much can I save?",
  "Compare with last month",
];

export function DashboardHero({ filtered }: HeroProps) {
  const { t, lang } = useLanguage();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"llm" | "deterministic" | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight });
  }, [msgs]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setInput("");
    const history = msgs.slice(-8);
    setMsgs((m) => [...m, { role: "user", content: message }]);
    setBusy(true);
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setMsgs((m) => [...m, { role: "assistant", content: j.reply as string }]);
      setMode(j.mode === "deterministic" ? "deterministic" : "llm");
    } catch (e) {
      setMsgs((m) => [
        ...m,
        { role: "assistant", content: lang === "en" ? `Connection error: ${String(e)}` : `Gagal terhubung: ${String(e)}` },
      ]);
    } finally {
      setBusy(false);
    }
  }

  const chips = useMemo(() => (lang === "en" ? SUGGESTIONS_EN : SUGGESTIONS_ID), [lang]);

  const countLabel = lang === "en"
    ? `${filtered.length} txns read`
    : `${filtered.length} transaksi terbaca`;

  return (
    <section className="relative overflow-hidden rounded-2xl border border-border bg-card">
      {/* aksen satu hue, subtle */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          background:
            "radial-gradient(700px 320px at 12% -20%, var(--accent), transparent 60%), radial-gradient(600px 300px at 90% -10%, var(--accent), transparent 55%)",
        }}
      />

      {/* Header */}
      <div className="relative flex items-center gap-3 border-b border-border px-5 py-3.5 sm:px-6">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <RobotIcon />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            {lang === "en" ? "Money Assistant" : "Asisten Keuangan Mjolmile"}
          </p>
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
            {lang === "en" ? `Live on your data · ${countLabel}` : `Live pada datamu · ${countLabel}`}
            {mode && <span className="ml-1 text-muted-foreground/60">· {mode === "deterministic" ? t("ai.modeDet") : t("ai.steward")}</span>}
          </p>
        </div>
      </div>

      {/* Thread */}
      <div ref={boxRef} className="relative flex max-h-[22rem] min-h-[14rem] flex-col gap-2.5 overflow-y-auto px-5 py-4 sm:px-6">
        {msgs.length === 0 && (
          <div className="m-auto max-w-md space-y-2 text-center">
            <p className="text-sm font-medium">
              {lang === "en" ? "Ask about your money — figures are computed, never guessed." : "Tanya soal uangmu — angka dihitung, bukan ditebak."}
            </p>
            <p className="text-xs text-muted-foreground">
              {lang === "en" ? "Try a quick chip below, or type your own." : "Coba chip di bawah, atau ketik pertanyaanmu sendiri."}
            </p>
          </div>
        )}
        {msgs.map((m, i) => (
          <div
            key={i}
            className={
              m.role === "user"
                ? "self-end rounded-xl bg-emerald-500/15 px-3 py-2 text-sm whitespace-pre-wrap max-w-[85%]"
                : "self-start rounded-xl border border-border bg-background/60 px-3 py-2 text-sm whitespace-pre-wrap max-w-[85%]"
            }
          >
            {m.content}
          </div>
        ))}
        {busy && (
          <div className="self-start rounded-xl border border-border px-3 py-2 text-sm text-muted-foreground">
            {t("ai.thinking")}
          </div>
        )}
      </div>

      {/* Chips + input */}
      <div className="relative border-t border-border px-5 py-3 sm:px-6">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <button
              key={c}
              onClick={() => send(c)}
              disabled={busy}
              className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-40"
            >
              {c}
            </button>
          ))}
        </div>
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => { e.preventDefault(); send(input); }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={lang === "en" ? "Ask about your money..." : "Tanya soal uangmu..."}
            maxLength={2000}
            aria-label={t("ai.placeholder")}
            className="min-w-0 flex-1 rounded-xl border border-border bg-background px-4 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            aria-label={t("ai.send")}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground disabled:opacity-40"
          >
            <ArrowUpIcon />
          </button>
        </form>
      </div>
    </section>
  );
}

function RobotIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="7" width="16" height="12" rx="3" />
      <path d="M12 7V4M8 4h8" />
      <circle cx="9" cy="12" r="1" fill="currentColor" />
      <circle cx="15" cy="12" r="1" fill="currentColor" />
      <path d="M9 16h6" />
    </svg>
  );
}

function ArrowUpIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  );
}