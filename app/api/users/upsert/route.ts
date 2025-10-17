import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { supabaseServer } from "@/lib/supabaseServer";
import { resolveIso2, isIso2, toIso2Upper, normalizeInput } from "@/lib/countryMap";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, email, country_code, message, photo_url, referred_by, boat_color } = body || {};
    if (!email || !country_code) return NextResponse.json({ error: "Missing required fields" }, { status: 400 });

    // Diagnostics: prepare run folder when header present
    const hdr = req.headers.get("x-diag-run-id");
    const now = new Date();
    const runId = hdr || `run-${now.toISOString().slice(0,16).replace(/[-:T]/g, "").replace(/(\d{8})(\d{4}).*/, "$1-$2")}`;
    const diagBase = path.join(process.cwd(), "docs", "_diagnostics", runId);
    const writeDiag = async (file: string, lines: string[]) => {
      try {
        await fs.mkdir(diagBase, { recursive: true });
        await fs.writeFile(path.join(diagBase, file), lines.join("\n"), "utf8");
      } catch {}
    };
    // 01 — signup payload (as received)
    await writeDiag("01-signup-payload.txt", [
      "Payload included name,email,country_code,boat_color → " + ((name && email && country_code && boat_color) ? "PASS" : "FAIL"),
      JSON.stringify({ name, email, country_code, boat_color, message, photo_url, referred_by }, null, 2)
    ]);

    // Name validation: trim, collapse spaces, length 2..80, must contain a letter or digit
    const cleanedName = String(name || "").replace(/\s+/g, " ").trim().slice(0, 80);
    const hasAlnum = /[\p{L}\p{N}]/u.test(cleanedName);
    if (!cleanedName || cleanedName.length < 2 || !hasAlnum) {
      console.warn('[upsert] invalid_name', { email });
      return NextResponse.json({ error: "invalid_name" }, { status: 400 });
    }

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

    // 02 — upsert sanitized input
    const sanitized = { name: cleanedName, email, country_code: cc, message: message ?? null, photo_url: photo_url ?? null, referred_by: referred_by ?? null, boat_color: boat_color ?? null };
    await writeDiag("02-upsert-input.txt", [
      "Sanitized contains expected fields → " + ((sanitized.name && sanitized.email && sanitized.country_code) ? "PASS" : "FAIL"),
      JSON.stringify(sanitized, null, 2)
    ]);

    // Generate 8-digit numeric referral_id server-side with retry on conflict
    const gen = () => String(Math.floor(10_000_000 + Math.random() * 89_999_999));
    let referral = gen();

    for (let attempt = 1; attempt <= 5; attempt++) {
      const { data, error } = await supabaseServer
        .from("users")
        .upsert(
          {
            name: cleanedName,
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

      if (!error) {
        // 03 — db probe (row returned by upsert)
        await writeDiag("03-db-probe.txt", [
          "Row has name/country_code/boat_color → " + ((data?.name && data?.country_code) ? "PASS" : "FAIL"),
          JSON.stringify(data, null, 2)
        ]);
        return NextResponse.json({ user: data });
      }

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


