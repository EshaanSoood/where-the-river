import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email } = body || {};
    if (!email) return NextResponse.json({ error: "Missing email" }, { status: 400 });
    const { data, error } = await supabaseServer
      .from("profiles")
      .select("user_id,first_name,last_name,ref_code_8")
      .eq("email", email)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!data) return NextResponse.json({ exists: false }, { status: 404 });
    const name = [data.first_name, data.last_name].filter(Boolean).join(" ").trim();
    return NextResponse.json({ exists: true, profile: { id: data.user_id, name, ref_code_8: data.ref_code_8 } });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}


