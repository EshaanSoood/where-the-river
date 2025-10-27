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

  const norm = normalizeReferralCode(rawCode);
  const res = NextResponse.next();

  if (norm) {
    // IMPORTANT: set cookie on the RESPONSE, not the request
    const isHttps = req.nextUrl.protocol === "https:";
    res.cookies.set("river_ref_h", norm, {
      httpOnly: true,
      secure: isHttps,
      sameSite: "lax",
      path: "/",
      // do NOT set Domain: default to current host so it matches API routes
    });

    // Optional: strip ?ref=… and /r/<code> from the URL after setting cookie
    if (rMatch) {
      const url = new URL(req.nextUrl.origin);
      const redirect = NextResponse.redirect(url);
      // Preserve cookie on redirect response
      redirect.cookies.set("river_ref_h", norm, {
        httpOnly: true,
        secure: isHttps,
        sameSite: "lax",
        path: "/",
      });
      return redirect;
    } else if (searchParams.has("ref")) {
      const url = new URL(req.url);
      url.searchParams.delete("ref");
      const redirect = NextResponse.redirect(url);
      // Preserve cookie on redirect response
      redirect.cookies.set("river_ref_h", norm, {
        httpOnly: true,
        secure: isHttps,
        sameSite: "lax",
        path: "/",
      });
      return redirect;
    }
  }

  return res;
}

export const config = {
  // Ensure middleware actually runs on your pages and /r/*, while skipping static assets and _next
  matcher: [
    "/",
    "/r/:path*",
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};


