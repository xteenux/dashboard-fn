"use client";

import { useState, useRef, useEffect } from "react";
import { useLanguage } from "@/app/lib/i18n";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS_ID = [
  "Berapa saldo total akun saya?",
  "Ringkas pengeluaran bulan ini",
  "Kategori apa yang paling besar?",
  "Bagaimana tren 6 bulan terakhir?",
];

export default function AiChatPanel() {
  const { t, lang } = useLanguage();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"llm" | "deterministic" | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight });
  }, [msgs, open]);

  // Hero "Ask AI" -> buka panel + kirim otomatis (CustomEvent "mjolmile:ask")
  useEffect(() => {
    function onAsk(e: Event) {
      const detail = (e as CustomEvent<string>).detail;
      if (typeof detail !== "string" || !detail.trim()) return;
      setOpen(true);
      setBusy(false);
      void send(detail);
    }
    window.addEventListener("mjolmile:ask", onAsk as EventListener);
    return () => window.removeEventListener("mjolmile:ask", onAsk as EventListener);
  }, [msgs, busy]);

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
        {
          role: "assistant",
          content: lang === "en"
            ? `Connection error: ${String(e)}`
            : `Gagal terhubung: ${String(e)}`,
        },
      ]);
} finally {
      setBusy(false);
    }
  }

  const suggestions = lang === "en"
    ? ["Total account balance?", "Summarize this month's spending", "Biggest category?", "6-month trend?"]
    : SUGGESTIONS_ID;

  return (
    <>
      {/* Tombol bulat kanan-bawah */}
      <button
        aria-label={t("ai.open")}
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-5 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-lg"
      >
        {open ? <CloseIcon /> : <SparkIcon />}
      </button>

      {open && (
        <div className="fixed bottom-20 right-5 z-40 flex h-[28rem] w-[22rem] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <div>
              <p className="text-sm font-semibold">Mjolmile</p>
              <p className="text-[11px] text-muted-foreground">
                {mode === "deterministic" ? t("ai.modeDet") : t("ai.steward")}
              </p>
            </div>
          </div>

          <div ref={boxRef} className="flex-1 space-y-2 overflow-y-auto px-3 py-2 text-sm">
            {msgs.length === 0 && (
              <div className="space-y-1.5 pt-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="block w-full rounded-md border border-border px-2.5 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            {msgs.map((m, i) => (
              <div
                key={i}
                className={
                  m.role === "user"
                    ? "ml-8 rounded-lg bg-accent/15 px-2.5 py-1.5 whitespace-pre-wrap"
                    : "mr-4 rounded-lg border border-border px-2.5 py-1.5 whitespace-pre-wrap"
                }
              >
                {m.content}
              </div>
            ))}
            {busy && (
              <div className="mr-4 rounded-lg border border-border px-2.5 py-1.5 text-muted-foreground">
                {t("ai.thinking")}
              </div>
            )}
          </div>

          <form
            className="flex gap-1.5 border-t border-border p-2"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t("ai.placeholder")}
              maxLength={2000}
              className="min-w-0 flex-1 rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-40"
            >
              {t("ai.send")}
            </button>
          </form>
        </div>
      )}
    </>
  );
}

function SparkIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
      <path d="M19 15l.9 2.6L22.5 18.5l-2.6.9L19 22l-.9-2.6-2.6-.9 2.6-.9z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}
