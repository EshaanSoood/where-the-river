import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function normalizeCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const once = decodeURIComponent(String(raw));
    const upper = once.toUpperCase().replace(/[^A-Z0-9]/g, "");
    return upper || null;
  } catch {
    const upper = String(raw).toUpperCase().replace(/[^A-Z0-9]/g, "");
    return upper || null;
  }
}

export function middleware(req: NextRequest) {
  const url = req.nextUrl;
  const { pathname, searchParams } = url;

  // Case 1: /r/<code> deep link
  if (pathname.startsWith("/r/")) {
    const code = normalizeCode(pathname.slice(3));
    if (code) {
      const res = NextResponse.redirect(new URL("/", req.url));
      // HttpOnly cookie for server attribution
      res.cookies.set("river_ref_h", code, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 7 * 24 * 60 * 60, secure: true });
      // Non-HttpOnly for client cues (best-effort)
      res.cookies.set("river_ref", code, { httpOnly: false, sameSite: "lax", path: "/", maxAge: 7 * 24 * 60 * 60, secure: true });
      return res;
    }
  }

  // Case 2: ?ref=... present → set cookies then strip param to stabilize URL
  const refParam = normalizeCode(searchParams.getAll("ref")[0] || "");
  if (refParam) {
    // Build a clean URL without ?ref
    const clean = new URL(req.url);
    clean.searchParams.delete("ref");
    const res = NextResponse.redirect(clean);
    res.cookies.set("river_ref_h", refParam, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 7 * 24 * 60 * 60, secure: true });
    res.cookies.set("river_ref", refParam, { httpOnly: false, sameSite: "lax", path: "/", maxAge: 7 * 24 * 60 * 60, secure: true });
    return res;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/|api/referral/capture).*)"],
};


