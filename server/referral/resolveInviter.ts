import { supabaseServer } from "@/lib/supabaseServer";
import { headers } from "next/headers";
import { getDisplayNameByUserId } from "@/server/names/nameService";

type Input = { code?: string | null; user_id?: string | null };
type Output = { inviterUserId: string | null; fullName: string | null; firstName: string | null };

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

export async function resolveInviterServer(input: Input): Promise<Output> {
  try {
    let userId = (input.user_id || null) as string | null;
    const code = normalizeCode(input.code || null);
    if (!userId && code) {
      // Feature-flagged helper with legacy fallback (read-only)
      const { USE_REFERRAL_HELPERS } = await import('@/server/config/flags');
      if (USE_REFERRAL_HELPERS) {
        const { getInviterByCode } = await import('@/server/db/referrals');
        const hit = await getInviterByCode(code);
        userId = hit?.user_id || null;
        if (!userId) {
          const { data: aliasRow } = await supabaseServer
            .from('referral_code_aliases')
            .select('user_id')
            .eq('code', code)
            .maybeSingle();
          userId = aliasRow ? (aliasRow as { user_id?: string | null }).user_id || null : null;
        }
      } else {
        const { data: codeRow } = await supabaseServer
          .from('referral_codes')
          .select('user_id')
          .eq('code', code)
          .maybeSingle();
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
      }
    }

    if (!userId) return { inviterUserId: null, fullName: null, firstName: null };

    const res = await getDisplayNameByUserId(userId);
    return { inviterUserId: userId, fullName: res.fullName, firstName: res.firstName };
  } catch {
    return { inviterUserId: null, fullName: null, firstName: null };
  }
}


export type Inviter = { code: string | null; fullName: string | null; firstName: string | null; userId: string | null };

export async function resolveInviterFromCode(code: string | null | undefined): Promise<Inviter> {
  const { inviterUserId, fullName, firstName } = await resolveInviterServer({ code: code || null });
  return { code: (code || null) as string | null, fullName, firstName, userId: inviterUserId };
}

export async function resolveInviterFromCookie(): Promise<Inviter> {
  try {
    const hdrs = await headers();
    const cookie = String(hdrs.get('cookie') || '');
    const m = cookie.match(/(?:^|; )river_ref_h=([^;]+)/);
    const raw = m ? decodeURIComponent(m[1]) : "";
    const code = (raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    return await resolveInviterFromCode(code || null);
  } catch {
    return { code: null, fullName: null, firstName: null, userId: null };
  }
}


