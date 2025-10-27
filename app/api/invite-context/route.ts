import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getDisplayNameByUserId } from "@/server/names/nameService";

export async function GET(req: Request) {
  try {
    // Read server-side cookie (HttpOnly) to avoid client storage limitations
    const cookie = (req.headers.get("cookie") || "");
    const m = cookie.match(/(?:^|; )river_ref_h=([^;]+)/);
    const raw = m ? decodeURIComponent(m[1]) : "";
    const code = String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!code) return NextResponse.json({ code: null, first_name: null, user_id: null }, { headers: { "Cache-Control": "no-store" } });

    const { getInviterByCode } = await import('@/server/db/referrals');
    const hit = await getInviterByCode(code);
    if (!hit?.user_id)
      return NextResponse.json({ code, first_name: null, user_id: null }, { headers: { "Cache-Control": "no-store" } });

    const userId = hit.user_id;
    const nameRes = await getDisplayNameByUserId(userId);
    const firstName = (nameRes.firstName || (nameRes.fullName ? nameRes.fullName.split(/\s+/)[0] : null) || null);
    return NextResponse.json({ code, first_name: firstName, user_id: userId }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: unknown) {
    return NextResponse.json({ code: null, first_name: null, user_id: null }, { headers: { "Cache-Control": "no-store" } });
  }
}


