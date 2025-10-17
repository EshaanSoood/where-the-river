import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
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

    const resp = {
      exists: true,
      me: {
        email,
        name,
        country_code,
        country_name,
        message,
        boat_color,
        referral_code,
        ref_code_8: referral_code,
        boats_total,
      },
    };

    // Diagnostics (when header present)
    const hdr = req.headers.get("x-diag-run-id");
    if (hdr) {
      try {
        const diagBase = path.join(process.cwd(), "docs", "_diagnostics", hdr);
        await fs.mkdir(diagBase, { recursive: true });
        await fs.writeFile(path.join(diagBase, "04-api-me-response.txt"), [
          `me contains name,country_code,country_name,boat_color → ${(resp.me.name && resp.me.country_code && resp.me.country_name !== undefined) ? 'PASS' : 'FAIL'}`,
          JSON.stringify(resp, null, 2)
        ].join('\n'), 'utf8');
      } catch {}
    }
    return NextResponse.json(resp);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}


