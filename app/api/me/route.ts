import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getCountryNameFromCode } from "@/lib/countryMap";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email } = body || {};
    if (!email) return NextResponse.json({ error: "Missing email" }, { status: 400 });

    const { data: profile, error: profErr } = await supabaseServer
      .from("profiles")
      .select("first_name,last_name,country_code,referral_code,boats_total,email")
      .eq("email", email)
      .maybeSingle();
    if (profErr) return NextResponse.json({ error: profErr.message }, { status: 400 });
    if (!profile) return NextResponse.json({ exists: false }, { status: 404 });

    const { data: userRow } = await supabaseServer
      .from("users")
      .select("name,message,boat_color,email")
      .eq("email", email)
      .maybeSingle();

    const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim();
    const name = fullName || (userRow?.name ?? null);
    const country_code = (profile.country_code || "").toUpperCase();
    const country_name = country_code ? getCountryNameFromCode(country_code) : null;
    const message = userRow?.message ?? null;
    const boat_color = userRow?.boat_color ?? null;
    const referral_code = profile.referral_code;
    const boats_total = profile.boats_total ?? 0;

    const needs_name = !name || String(name).trim().length === 0;
    return NextResponse.json({
      exists: true,
      me: {
        email,
        name,
        needs_name,
        country_code,
        country_name,
        message,
        boat_color,
        referral_code,
        ref_code_8: referral_code,
        boats_total,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}


