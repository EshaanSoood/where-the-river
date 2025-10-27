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
      .from('referral_codes')
      .select('code')
      .eq('user_id', id)
      .maybeSingle();
    return (data as { code?: string | null } | null)?.code ?? null;
  } catch {
    return null;
  }
}

// A.1 — Fetch inviter (user_id) by canonical code
export async function getInviterByCode(code: string): Promise<InviterInfo> {
  const normalized = String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!normalized) return null;
  try {
    const { data } = await supabaseServer
      .from('referral_codes')
      .select('user_id, code')
      .eq('code', normalized)
      .maybeSingle();
    dbg('getInviterByCode', { code: normalized, hit: !!data });
    if (data && (data as { user_id?: string }).user_id) {
      const row = data as { user_id: string; code?: string | null };
      return { user_id: row.user_id, code: (row.code ?? normalized) };
    }
    return null;
  } catch {
    return null;
  }
}

// A.1b — Direct parent lookup using users metadata mirror
export async function getParent(userId: string): Promise<{ parent_user_id: string | null; code: string | null } | null> {
  const id = String(userId || '').trim();
  if (!id) return null;
  try {
    // Read referred_by from auth users metadata (SoT for edge per Phase 2 contract)
    const { data: authRow } = await supabaseServer
      .from('auth.users' as unknown as string)
      .select('id, raw_user_meta_data')
      .eq('id', id)
      .maybeSingle();
    const meta = (authRow as { raw_user_meta_data?: Record<string, unknown> } | null)?.raw_user_meta_data || {};
    const rawRef = String((meta as Record<string, unknown>)['referred_by'] || '').trim();
    if (!rawRef) return { parent_user_id: null, code: null };
    // Detect UUID vs code
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(rawRef);
    if (isUuid) {
      const parentId = rawRef;
      // Best-effort fetch code for parent (optional)
      const { data: rc } = await supabaseServer
        .from('referral_codes')
        .select('code')
        .eq('user_id', parentId)
        .maybeSingle();
      const parentCode = (rc as { code?: string | null } | null)?.code ?? null;
      return { parent_user_id: parentId, code: parentCode };
    }
    const code = rawRef.replace(/\D+/g, '') || null;
    if (!code) return { parent_user_id: null, code: null };
    const inviter = await getInviterByCode(code);
    return { parent_user_id: inviter?.user_id || null, code };
  } catch {
    return { parent_user_id: null, code: null };
  }
}

// A.1c — Ensure user has a canonical referral code (idempotent)
export async function ensureUserHasReferralCode(userId: string): Promise<{ code: string | null }> {
  const id = String(userId || '').trim();
  if (!id) return { code: null };
  try {
    // First try read existing
    const { data: existing } = await supabaseServer
      .from('referral_codes')
      .select('code')
      .eq('user_id', id)
      .maybeSingle();
    if (existing && (existing as { code?: string | null }).code) {
      const c = (existing as { code?: string | null }).code || null;
      dbg('ensureUserHasReferralCode.hit', { userId: id, code: c });
      return { code: c };
    }
    // Fallback to RPC that mints idempotently (Phase 2: gated, off by default)
    try {
      const { ALLOW_ENSURE_ON_READ } = await import('@/server/config/flags');
      if (!ALLOW_ENSURE_ON_READ) return { code: null };
    } catch { return { code: null }; }
    const { data: minted } = await supabaseServer.rpc('assign_referral_code', { p_user_id: id });
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
      // Fetch parent code for convenience
      const { data: rc } = await supabaseServer
        .from('referral_codes')
        .select('code')
        .eq('user_id', parentId)
        .maybeSingle();
      const code = (rc as { code?: string | null } | null)?.code ?? null;
      chain.push({ user_id: parentId, code });
      currentId = parentId;
    }
  } catch {}
  dbg('getAncestorChain', { userId, maxDepth, length: chain.length });
  return chain;
}


