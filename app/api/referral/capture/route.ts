import { NextResponse } from "next/server";

function normalizeCode(raw: unknown): string | null {
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

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const code = normalizeCode((body as { code?: string }).code);
    if (!code) return NextResponse.json({ ok: false }, { status: 400 });
    const res = NextResponse.json({ ok: true });
    res.headers.set("Cache-Control", "no-store");
    res.headers.set("Vary", "*");
    res.cookies.set("river_ref_h", code, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 7 * 24 * 60 * 60, secure: true });
    res.cookies.set("river_ref", code, { httpOnly: false, sameSite: "lax", path: "/", maxAge: 7 * 24 * 60 * 60, secure: true });
    return res;
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}


