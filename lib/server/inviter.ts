import { cookies, headers } from "next/headers";
import { supabaseServer } from "@/lib/supabaseServer";

function normalizeCode(raw: unknown): string | null {
  if (!raw) return null;
  try {
    const once = decodeURIComponent(String(raw));
    const upper = once.toUpperCase().replace(/[^A-Z0-9]/g, "");
    return upper || null;
  } catch {
    const upper = String(raw).toUpperCase().replace(/[^A-Z0-9]/g, "");
    return upper || null;
  }
}

export type Inviter = { id: string; fullName: string; firstName: string };

/**
 * Server-side resolver for inviter details.
 * Reads HttpOnly cookie `river_ref_h` first, then falls back to current URL `?ref` (server-side).
 * Returns null on any error; logs may be added by callers.
 */
export async function getServerInviter(): Promise<{ inviter: Inviter | null }> {
  try {
    // 1) Prefer HttpOnly cookie
    const jar = await cookies();
    const cookieRef = normalizeCode(jar?.get("river_ref_h")?.value || "");

    // 2) Fallback to URL ?ref (server-side via headers)
    let urlRef: string | null = null;
    try {
      const h = await headers();
      const proto = (h?.get("x-forwarded-proto") || "http").split(",")[0].trim();
      const host = (h?.get("x-forwarded-host") || h?.get("host") || "").split(",")[0].trim();
      const path = h?.get("x-invoke-path") || h?.get("x-vercel-deployment-url") || ""; // best-effort; may be empty
      const referer = h?.get("referer") || "";
      const rawUrl = referer || (host ? `${proto}://${host}${path || "/"}` : "");
      const u = rawUrl ? new URL(rawUrl) : null;
      urlRef = u ? normalizeCode(u.searchParams.getAll("ref")[0] || "") : null;
    } catch {}

    const code = cookieRef || urlRef;
    if (!code) return { inviter: null };

    // 3) Resolve via SoT tables
    const { data: codeRow } = await supabaseServer
      .from('referral_codes')
      .select('user_id')
      .eq('code', code)
      .maybeSingle();

    let userId: string | null = null;
    if (codeRow && (codeRow as { user_id?: string | null }).user_id) {
      userId = (codeRow as { user_id?: string | null }).user_id || null;
    } else {
      const { data: aliasRow } = await supabaseServer
        .from('referral_code_aliases')
        .select('user_id')
        .eq('code', code)
        .maybeSingle();
      userId = aliasRow ? (aliasRow as { user_id?: string | null }).user_id || null : null;
    }
    if (!userId) return { inviter: null };

    // 4) Read auth.users metadata for name
    const { data: authRow } = await supabaseServer
      .from('auth.users')
      .select('id, raw_user_meta_data')
      .eq('id', userId)
      .maybeSingle();
    if (!authRow) return { inviter: null };
    const meta = (authRow as { raw_user_meta_data?: Record<string, unknown> | null }).raw_user_meta_data || {};
    const fullName = typeof (meta as Record<string, unknown>).name === 'string' ? String((meta as Record<string, unknown>).name).trim() : '';
    const firstName = fullName ? (fullName.split(/\s+/)[0] || '') : '';
    return { inviter: { id: (authRow as { id: string }).id, fullName, firstName } };
  } catch {
    return { inviter: null };
  }
}


