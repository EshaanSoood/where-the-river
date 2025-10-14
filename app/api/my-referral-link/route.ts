import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET() {
  try {
    // We expect a service-side call with a user context established via Supabase Auth helpers (if used)
    // Fallback: Without session middleware, this endpoint should be adjusted to accept a token.
    // For now, attempt to read auth via supabaseServer (service role), which requires a user id param in a real app.

    // Placeholder: in a production app, extract user id from a verified JWT or middleware
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}


