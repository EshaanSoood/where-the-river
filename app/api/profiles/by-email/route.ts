// This endpoint is retired in favor of /api/me and /api/users/check.
// Keeping a minimal handler to avoid 404s if any old clients call it.
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = (body && body.email) ? String(body.email) : null;
    return NextResponse.json({
      deprecated: true,
      hint: "Use /api/me (POST { email }) or /api/users/check",
      email,
    }, { status: 410 });
  } catch {
    return NextResponse.json({ deprecated: true }, { status: 410 });
  }
}


