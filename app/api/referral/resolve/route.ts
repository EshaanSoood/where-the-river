import { NextRequest, NextResponse } from "next/server";
import { resolveInviterServer } from "@/server/referral/resolveInviter";

// Lightweight in-memory rate limiter (per process). Acceptable for dev/staging; prod may run multiple instances.
type Bucket = { count: number; resetAt: number };
const minuteBuckets = new Map<string, Bucket>();
const dayBuckets = new Map<string, Bucket>();
function rlKeyFromReq(req: NextRequest): string {
  const xf = req.headers.get("x-forwarded-for") || "";
  const ip = (xf.split(",")[0] || req.headers.get("x-real-ip") || "0.0.0.0").trim();
  return `ip:${ip}`;
}
function hitLimit(key: string, now: number, limit: number, windowMs: number, map: Map<string, Bucket>): boolean {
  const b = map.get(key);
  if (!b || now > b.resetAt) {
    map.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  b.count++;
  return b.count > limit;
}

export async function GET(req: NextRequest) {
  try {
    try {
      const key = rlKeyFromReq(req);
      const now = Date.now();
      const overMinute = hitLimit(key+":m", now, 20, 60_000, minuteBuckets);
      const overDay = hitLimit(key+":d", now, 200, 86_400_000, dayBuckets);
      if (overMinute || overDay) {
        return new NextResponse(JSON.stringify({ first_name: null, full_name: null, user_id: null }), { status: 200, headers: { "Cache-Control": "no-store" } });
      }
    } catch {}

    const code = (req.nextUrl.searchParams.get("code") || "").trim();
    if (!code) return new NextResponse(JSON.stringify({ first_name: null, full_name: null, user_id: null }), { status: 200, headers: { "Cache-Control": "no-store" } });

    const { inviterUserId, fullName, firstName } = await resolveInviterServer({ code });
    if (!inviterUserId) {
      return new NextResponse(JSON.stringify({ first_name: null, full_name: null, user_id: null }), { status: 200, headers: { "Cache-Control": "no-store" } });
    }
    return new NextResponse(JSON.stringify({ first_name: firstName || null, full_name: fullName || null, user_id: inviterUserId }), { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new NextResponse(JSON.stringify({ first_name: null, full_name: null, user_id: null, error: msg }), { status: 200, headers: { "Cache-Control": "no-store" } });
  }
}





