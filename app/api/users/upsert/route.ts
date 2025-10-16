import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { resolveIso2, isIso2, toIso2Upper, normalizeInput } from "@/lib/countryMap";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, email, country_code, message, photo_url, referred_by, boat_color } = body || {};
    if (!email || !country_code) return NextResponse.json({ error: "Missing required fields" }, { status: 400 });

    // Normalize and validate country_code
    let cc: string | null = null;
    const raw = normalizeInput(String(country_code));
    if (isIso2(raw)) {
      cc = toIso2Upper(raw);
    } else {
      cc = resolveIso2(raw);
    }
    if (!cc || !/^[A-Z]{2}$/.test(cc)) {
      return NextResponse.json({ error: "invalid_country" }, { status: 400 });
    }

    // Generate 8-digit numeric referral_id server-side with retry on conflict
    const gen = () => String(Math.floor(10_000_000 + Math.random() * 89_999_999));
    let referral = gen();

    for (let attempt = 1; attempt <= 5; attempt++) {
      const { data, error } = await supabaseServer
        .from("users")
        .upsert(
          {
            name: name ?? null,
            email,
            country_code: cc,
            message: message ?? null,
            photo_url: photo_url ?? null,
            referral_id: referral,
            referred_by: referred_by ?? null,
            otp_verified: true,
            boat_color: boat_color ?? null,
          },
          { onConflict: "email" }
        )
        .select()
        .single();

      if (!error) return NextResponse.json({ user: data });

      // Retry on referral_id uniqueness violations only
      if (/referral_id/i.test(error.message) && /duplicate|unique/i.test(error.message)) {
        referral = gen();
        continue;
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ error: "referral_generation_failed" }, { status: 400 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}


