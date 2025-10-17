import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { supabaseServer } from "@/lib/supabaseServer";
import { getCountryNameFromCode } from "@/lib/countryMap";

type UserMeta = {
  first_name?: string;
  last_name?: string;
  name?: string;
  country_code?: string;
  boat_color?: string;
  message?: string;
  boats_total?: number;
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email } = body || {};
    if (!email) return NextResponse.json({ error: "Missing email" }, { status: 400 });

    // Read profile from auth.users.user_metadata (server role)
    const { data: authUser, error: authErr } = await supabaseServer
      .from('auth.users')
      .select('id,email,user_metadata')
      .eq('email', email)
      .maybeSingle();
    if (authErr) return NextResponse.json({ error: authErr.message }, { status: 400 });
    if (!authUser) return NextResponse.json({ exists: false }, { status: 404 });
    const um = ((authUser as unknown as { user_metadata?: UserMeta }).user_metadata || {}) as UserMeta;
    const fullName = [um.first_name, um.last_name].filter(Boolean).join(" ").trim() || (um.name || "").trim();
    const name = fullName || null;
    const country_code = String(um.country_code || "").toUpperCase() || null;
    const country_name = country_code ? getCountryNameFromCode(country_code) : null;
    const message = um.message ?? null;
    const boat_color = um.boat_color ?? null;
    const boats_total = typeof um.boats_total === 'number' ? um.boats_total : 0;

    // Referral code: read from users table if available (legacy source)
    let referral_code: string | null = null;
    try {
      const { data: userRow } = await supabaseServer
        .from("users")
        .select("referral_id")
        .eq("email", email)
        .maybeSingle();
      referral_code = userRow?.referral_id ?? null;
    } catch {}

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


