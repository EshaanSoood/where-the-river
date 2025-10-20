import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET(req: NextRequest) {
  try {
    const code = (req.nextUrl.searchParams.get("code") || "").trim();
    if (!code) return NextResponse.json({ error: "missing_code" }, { status: 400 });

    // Try raw_user_meta_data first; fall back to user_metadata
    const query = supabaseServer
      .from("auth.users")
      .select("id, user_metadata, raw_user_meta_data")
      .or(
        `raw_user_meta_data->>referral_id.eq.${code},user_metadata->>referral_id.eq.${code}`
      )
      .limit(1);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    const row = Array.isArray(data) && data.length > 0 ? data[0] as unknown as { id: string; user_metadata?: Record<string, unknown> | null; raw_user_meta_data?: Record<string, unknown> | null } : null;
    if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const meta = ((row.raw_user_meta_data || row.user_metadata) || {}) as Record<string, unknown>;
    const fullName = typeof meta.name === "string" ? meta.name.trim() : "";
    const firstName = fullName ? (fullName.split(/\s+/)[0] || "") : "";

    return NextResponse.json({ first_name: firstName || null, user_id: row.id });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}


