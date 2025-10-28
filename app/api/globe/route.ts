import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

type UserMeta = {
  name?: string | null;
  email?: string | null;
  country_code?: string | null;
  created_at?: string | null;
};

type UserReferral = {
  user_id: string;
  referral_code: string | null;
  referred_by_user_id: string | null;
  boats_total: number;
  created_at: string;
};

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const filter = url.searchParams.get("filter") || "all";
    const since = filter === "all" ? null : new Date(Date.now() - (filter === "30d" ? 30 : 7) * 24 * 3600 * 1000);

    // 1) Fetch all users from auth.users for names and email
    type AdminUser = { id: string; email: string | null; created_at: string; user_metadata?: UserMeta };
    type AdminListUsersData = { users: AdminUser[] } | null;
    type AdminListUsersResult = { data: AdminListUsersData; error: { message: string } | null };
    type AdminClient = { auth: { admin: { listUsers: (args: { page: number; perPage: number }) => Promise<AdminListUsersResult> } } };

    const adminClient = supabaseServer as unknown as AdminClient;
    const authUsersById: Record<string, { name?: string | null; email?: string | null; country_code?: string | null; created_at: string }> = {};
    let page = 1;
    while (true) {
      const { data: pageData, error: pageErr } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
      if (pageErr) return NextResponse.json({ error: pageErr.message }, { status: 500 });
      const users: AdminUser[] = pageData?.users || [];
      if (!users.length) break;
      users.forEach((u) => {
        const m = (u.user_metadata || {});
        authUsersById[u.id] = {
          name: (m.name as string | undefined) || undefined,
          email: u.email || undefined,
          country_code: (m.country_code as string | undefined) || undefined,
          created_at: u.created_at,
        };
      });
      if (users.length < 1000) break;
      page += 1;
    }

    // 2) Fetch all referral state from users_referrals (source of truth)
    const { data: referrals, error: refErr } = await supabaseServer
      .from('users_referrals')
      .select('user_id,referral_code,referred_by_user_id,boats_total,created_at');

    if (refErr) return NextResponse.json({ error: refErr.message }, { status: 500 });
    const referralsByUserId: Record<string, UserReferral> = {};
    const codeToUserId: Record<string, string> = {};
    
    (referrals as UserReferral[] || []).forEach(r => {
      referralsByUserId[r.user_id] = r;
      if (r.referral_code) {
        codeToUserId[r.referral_code] = r.user_id;
      }
    });

    // 3) Build nodes (keyed by user_id)
    const nodes = Object.entries(authUsersById).map(([userId, auth]) => {
      const ref = referralsByUserId[userId];
      return {
        id: userId,
        name: (auth.name || auth.email || "Anonymous").trim(),
        countryCode: String(auth.country_code || "").toUpperCase(),
        createdAt: auth.created_at || new Date().toISOString(),
        boats: ref?.boats_total || 0,
      };
    });

    // 4) Build links (edges) from referred_by_user_id in unified table
    const links = Object.values(referralsByUserId)
      .filter(ref => ref.referred_by_user_id && authUsersById[ref.referred_by_user_id])
      .map(ref => ({
        source: ref.referred_by_user_id as string,
        target: ref.user_id,
      }));

    return NextResponse.json({ nodes, links }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}



