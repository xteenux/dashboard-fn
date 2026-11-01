import type { Metadata } from "next";
import "./globals.css";
import { Inter } from "next/font/google";
import { cookies } from "next/headers";
import { ThemeProvider } from "@/app/components/ThemeProvider";
import { LanguageProvider, type Lang } from "@/app/lib/i18n";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Finance Dashboard — AVTX Studios",
  description: "Interactive personal finance dashboard with KPI analytics",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const lang = (cookieStore.get("lang")?.value === "en" ? "en" : "id") as Lang;
  return (
    <html lang={lang} className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem("theme");if(t==="light"){document.documentElement.classList.add("light")}else{document.documentElement.classList.add("dark")}}catch(e){document.documentElement.classList.add("dark")}})();` }} />
      </head>
      <body className="min-h-screen bg-background text-foreground font-sans antialiased">
        <LanguageProvider initialLang={lang}>
          <ThemeProvider>
            {children}
          </ThemeProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}