import { supabaseServer } from "@/lib/supabaseServer";

function dbg(msg: string, data?: Record<string, unknown>) {
  try {
    if (process.env.DEBUG_REFERRALS) {
      console.debug(`[referrals] ${msg}`, data || {});
    }
  } catch {}
}

export type InviterInfo = { user_id: string; code: string | null } | null;
export async function getReferralCodeByUserId(userId: string): Promise<string | null> {
  const id = String(userId || '').trim();
  if (!id) return null;
  try {
    const { data } = await supabaseServer
      .from('users_referrals')
      .select('referral_code')
      .eq('user_id', id)
      .maybeSingle();
    return (data as { referral_code?: string | null } | null)?.referral_code ?? null;
  } catch {
    return null;
  }
}

// A.1 — Fetch inviter (user_id) by canonical code
export async function getInviterByCode(code: string): Promise<InviterInfo> {
  const normalized = String(code || "").trim();
  if (!normalized) return null;
  try {
    const { data } = await supabaseServer
      .from('users_referrals')
      .select('user_id, referral_code')
      .eq('referral_code', normalized)
      .maybeSingle();
    dbg('getInviterByCode', { code: normalized, hit: !!data });
    if (data && (data as { user_id?: string }).user_id) {
      const row = data as { user_id: string; referral_code?: string | null };
      return { user_id: row.user_id, code: (row.referral_code ?? normalized) };
    }
    return null;
  } catch {
    return null;
  }
}

// A.1b — Direct parent lookup using unified table
export async function getParent(userId: string): Promise<{ parent_user_id: string | null; code: string | null } | null> {
  const id = String(userId || '').trim();
  if (!id) return null;
  try {
    const { data } = await supabaseServer
      .from('users_referrals')
      .select('referred_by_user_id')
      .eq('user_id', id)
      .maybeSingle();
    const parentId = (data as { referred_by_user_id?: string | null } | null)?.referred_by_user_id ?? null;
    if (!parentId) return { parent_user_id: null, code: null };
    const { data: rc } = await supabaseServer
      .from('users_referrals')
      .select('referral_code')
      .eq('user_id', parentId)
      .maybeSingle();
    const code = (rc as { referral_code?: string | null } | null)?.referral_code ?? null;
    return { parent_user_id: parentId, code };
  } catch {
    return { parent_user_id: null, code: null };
  }
}

// A.1c — Ensure user has a canonical referral code (idempotent)
export async function ensureUserHasReferralCode(userId: string): Promise<{ code: string | null }> {
  const id = String(userId || '').trim();
  if (!id) return { code: null };
  try {
    const { data: existing } = await supabaseServer
      .from('users_referrals')
      .select('referral_code')
      .eq('user_id', id)
      .maybeSingle();
    if (existing && (existing as { referral_code?: string | null }).referral_code) {
      const c = (existing as { referral_code?: string | null }).referral_code || null;
      dbg('ensureUserHasReferralCode.hit', { userId: id, code: c });
      return { code: c };
    }
    const { data: minted } = await supabaseServer.rpc('assign_users_referrals_row', { p_user_id: id });
    const code = (minted as unknown as string) || null;
    dbg('ensureUserHasReferralCode.mint', { userId: id, code });
    return { code };
  } catch {
    return { code: null };
  }
}

// A.1d — Build ordered ancestor chain up to maxDepth
export async function getAncestorChain(userId: string, maxDepth = 20): Promise<Array<{ user_id: string; code: string | null }>> {
  const chain: Array<{ user_id: string; code: string | null }> = [];
  try {
    let currentId = String(userId || '').trim();
    if (!currentId) return chain;
    const visited = new Set<string>([currentId]);
    for (let depth = 1; depth <= Math.max(1, Math.min(100, maxDepth)); depth++) {
      const parent = await getParent(currentId);
      if (!parent?.parent_user_id) break;
      const parentId = parent.parent_user_id;
      if (visited.has(parentId)) { dbg('getAncestorChain.cycle', { at: parentId, depth }); break; }
      visited.add(parentId);
      const { data: rc } = await supabaseServer
        .from('users_referrals')
        .select('referral_code')
        .eq('user_id', parentId)
        .maybeSingle();
      const code = (rc as { referral_code?: string | null } | null)?.referral_code ?? null;
      chain.push({ user_id: parentId, code });
      currentId = parentId;
    }
  } catch {}
  dbg('getAncestorChain', { userId, maxDepth, length: chain.length });
  return chain;
}


