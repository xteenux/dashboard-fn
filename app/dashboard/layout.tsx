export const dynamic = "force-dynamic";

import { auth, signOut } from "@/app/auth";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  return (
    <div className="flex flex-col min-h-screen">
      <header className="sticky top-0 z-40 border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <svg className="w-5 h-5 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <span className="font-semibold text-lg">Finance Dashboard</span>
          </div>
          <nav className="flex items-center gap-1 text-sm">
            <a href="/dashboard" className="px-3 py-1.5 rounded-lg hover:bg-accent transition-colors">Dashboard</a>
            <a href="/categories" className="px-3 py-1.5 rounded-lg hover:bg-accent transition-colors">Kategori</a>
            <a href="/accounts" className="px-3 py-1.5 rounded-lg hover:bg-accent transition-colors">Akun</a>
            {(session?.user as { role?: string })?.role === "owner" && (
              <a href="/users" className="px-3 py-1.5 rounded-lg hover:bg-accent transition-colors">User</a>
            )}
          </nav>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-sm font-medium">{session?.user?.name}</span>
              <span className="text-xs text-muted-foreground capitalize">{(session?.user as { role?: string })?.role}</span>
            </div>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
            >
              <button
                type="submit"
                className="px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-accent transition-colors"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-[1400px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </main>
    </div>
  );
}