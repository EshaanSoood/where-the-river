import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function normalizeCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const s = decodeURIComponent(String(raw)).trim();
    const digits = s.replace(/\D+/g, "");
    return digits.length > 0 ? digits : null;
  } catch {
    const s = String(raw).trim();
    const digits = s.replace(/\D+/g, "");
    return digits.length > 0 ? digits : null;
  }
}

export function middleware(req: NextRequest) {
  const url = req.nextUrl;
  const { pathname, searchParams } = url;

  // Determine if we're on HTTPS
  const isSecure = url.protocol === 'https:';

  // Case 1: /r/<code> deep link
  if (pathname.startsWith("/r/")) {
    const code = normalizeCode(pathname.slice(3));
    if (code) {
      const res = NextResponse.redirect(new URL("/", req.url));
      // HttpOnly cookie for server attribution
      res.cookies.set("river_ref_h", code, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 7 * 24 * 60 * 60, secure: isSecure });
      // Non-HttpOnly for client cues (best-effort)
      res.cookies.set("river_ref", code, { httpOnly: false, sameSite: "lax", path: "/", maxAge: 7 * 24 * 60 * 60, secure: isSecure });
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
    res.cookies.set("river_ref_h", refParam, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 7 * 24 * 60 * 60, secure: isSecure });
    res.cookies.set("river_ref", refParam, { httpOnly: false, sameSite: "lax", path: "/", maxAge: 7 * 24 * 60 * 60, secure: isSecure });
    return res;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/|api/referral/capture).*)"],
};


