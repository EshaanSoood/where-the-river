import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  
  // Extract the ref parameter if present in the redirect URL
  const ref = searchParams.get("ref");
  
  // Build redirect URL back to home
  const redirectTo = new URL("/", req.nextUrl.origin);
  
  // Preserve ref parameter in redirect so middleware can capture it
  if (ref) {
    redirectTo.searchParams.set("ref", ref);
  }
  
  // Redirect to home with ref preserved - middleware will capture and cookie it
  return NextResponse.redirect(redirectTo);
}
