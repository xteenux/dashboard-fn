import { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { auth } from "@/app/auth";

export type ApiUser = { id: string; name: string; email: string; role: string };

const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET);

/**
 * Resolve caller identity from either:
 *  1. Authorization: Bearer <token>  (minted by POST /api/auth/login)
 *  2. NextAuth session cookie        (browser flow)
 * Returns null when neither is valid.
 */
export async function getApiUser(req: NextRequest): Promise<ApiUser | null> {
  const header = req.headers.get("authorization");
  if (header?.toLowerCase().startsWith("bearer ")) {
    const token = header.slice(7).trim();
    try {
      const { payload } = await jwtVerify(token, SECRET, { algorithms: ["HS256"] });
      const id = payload.id as string | undefined;
      if (!id) return null;
      return {
        id,
        name: (payload.name as string) ?? "",
        email: (payload.email as string) ?? "",
        role: (payload.role as string) ?? "",
      };
    } catch {
      return null;
    }
  }

  // Fallback: NextAuth session cookie
  const session = await auth();
  const u = session?.user as { id?: string; name?: string; email?: string; role?: string } | undefined;
  if (!u?.id) return null;
  return { id: u.id, name: u.name ?? "", email: u.email ?? "", role: u.role ?? "" };
}
