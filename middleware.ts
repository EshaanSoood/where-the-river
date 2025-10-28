import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function normalizeReferralCode(input: unknown): string | null {
  if (!input) return null;
  const s = String(input).trim();
  const digits = s.replace(/\D+/g, "");
  return digits.length ? digits : null;
}

export function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;
  let rawCode: string | null = null;

  // Accept /r/<code>
  const rMatch = pathname.match(/^\/r\/([^\/?#]+)/);
  if (rMatch?.[1]) rawCode = rMatch[1];

  // OR ?ref=<code>
  if (!rawCode) {
    const q = req.nextUrl.searchParams.get("ref");
    if (q) rawCode = q;
  }

  const digitsOnly = normalizeReferralCode(rawCode);
  const codeValid = !!(digitsOnly && digitsOnly.length >= 6 && digitsOnly.length <= 12);
  const sawRef = Boolean(rawCode);
  const pathKind = rMatch ? '/r' : (searchParams.has('ref') ? 'query' : null);

  const isHttps = req.nextUrl.protocol === "https:";
  const isCallback = pathname.startsWith('/auth/callback');
  const isLanding = pathname === '/';

  // Log (guarded)
  if (process.env.DEBUG_REFERRALS) {
    try { console.info('[mw:ref]', { saw_ref: sawRef, path: pathKind, valid: codeValid }); } catch {}
  }

  // Always produce a response (either preserve on callback, redirect elsewhere, or next)
  if (sawRef) {
    if (isCallback || isLanding) {
      // Preserve ?ref on the OTP callback page so payload can carry it reliably
      const res = NextResponse.next();
      if (codeValid && digitsOnly) {
        res.cookies.set('river_ref_h', digitsOnly, { httpOnly: true, secure: isHttps, sameSite: 'lax', path: '/', maxAge: 7 * 24 * 60 * 60 });
        res.cookies.set('river_ref', digitsOnly, { httpOnly: false, secure: isHttps, sameSite: 'lax', path: '/', maxAge: 7 * 24 * 60 * 60 });
      } else {
        res.cookies.set('river_ref_h', '', { httpOnly: true, secure: isHttps, sameSite: 'lax', path: '/', maxAge: 0 });
        res.cookies.set('river_ref', '', { httpOnly: false, secure: isHttps, sameSite: 'lax', path: '/', maxAge: 0 });
      }
      return res;
    }

    // Non-callback: set cookies and redirect canonically (strip query or /r → /)
    let redirectUrl: URL;
    if (rMatch) {
      redirectUrl = new URL(req.nextUrl.origin);
    } else {
      redirectUrl = new URL(req.url);
      redirectUrl.searchParams.delete('ref');
    }
    const redirect = NextResponse.redirect(redirectUrl);
    if (codeValid && digitsOnly) {
      redirect.cookies.set('river_ref_h', digitsOnly, { httpOnly: true, secure: isHttps, sameSite: 'lax', path: '/', maxAge: 7 * 24 * 60 * 60 });
      redirect.cookies.set('river_ref', digitsOnly, { httpOnly: false, secure: isHttps, sameSite: 'lax', path: '/', maxAge: 7 * 24 * 60 * 60 });
    } else {
      redirect.cookies.set('river_ref_h', '', { httpOnly: true, secure: isHttps, sameSite: 'lax', path: '/', maxAge: 0 });
      redirect.cookies.set('river_ref', '', { httpOnly: false, secure: isHttps, sameSite: 'lax', path: '/', maxAge: 0 });
    }
    return redirect;
  }

  // No ref seen → just continue without modifying cookies
  return NextResponse.next();
}

export const config = {
  // Ensure middleware actually runs on your pages and /r/*, while skipping static assets and _next
  matcher: [
    "/",
    "/r/:path*",
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};


