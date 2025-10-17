import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET() {
  try {
    // Global total boats
    const totalRes = await supabaseServer
      .from("users")
      .select("id", { count: "exact", head: true })
      .not("boat_color", "is", null)
      .eq("otp_verified", true);

    if (totalRes.error) return NextResponse.json({ error: totalRes.error.message }, { status: 400 });

    // Top 5 by boats_total via auth.users.user_metadata (service read)
    const { data: rows, error: topErr } = await supabaseServer
      .from("users")
      .select("name,country_code,boats_total")
      .order("boats_total", { ascending: false })
      .limit(5);
    if (topErr) return NextResponse.json({ error: topErr.message }, { status: 400 });
    const top = (rows || []).map(r => ({ first_name: (r.name || '').split(' ')[0] || '', country_code: r.country_code, boats_total: r.boats_total }));

    return NextResponse.json({ totalBoats: totalRes.count ?? 0, top: top ?? [] });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}


