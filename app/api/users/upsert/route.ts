import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, email, country_code, message, photo_url, referral_id, referred_by, boat_color } = body || {};
    if (!email || !country_code || !referral_id) return NextResponse.json({ error: "Missing required fields" }, { status: 400 });

    const { data, error } = await supabaseServer
      .from("users")
      .upsert(
        {
          name: name ?? null,
          email,
          country_code: String(country_code).toUpperCase(),
          message: message ?? null,
          photo_url: photo_url ?? null,
          referral_id,
          referred_by: referred_by ?? null,
          otp_verified: true,
          boat_color: boat_color ?? null,
        },
        { onConflict: "email" }
      )
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ user: data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}


