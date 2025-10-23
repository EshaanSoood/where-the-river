import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

type UserMeta = {
  name?: string | null;
  email?: string | null;
  country_code?: string | null;
  referred_by?: string | null;
  referral_id?: string | null;
  created_at?: string | null;
};

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const filter = url.searchParams.get("filter") || "all";
    const since = filter === "all" ? null : new Date(Date.now() - (filter === "30d" ? 30 : 7) * 24 * 3600 * 1000);

    // Prefer Auth Admin listUsers to ensure we see newly seeded users consistently
    type AdminUser = { email: string | null; created_at: string; user_metadata?: UserMeta };
    type AdminListUsersData = { users: AdminUser[] } | null;
    type AdminListUsersResult = { data: AdminListUsersData; error: { message: string } | null };
    type AdminClient = { auth: { admin: { listUsers: (args: { page: number; perPage: number }) => Promise<AdminListUsersResult> } } };

    const adminClient = supabaseServer as unknown as AdminClient;
    const allMetas: UserMeta[] = [];
    let page = 1;
    while (true) {
      const { data: pageData, error: pageErr } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
      if (pageErr) return NextResponse.json({ error: pageErr.message }, { status: 500 });
      const users: AdminUser[] = pageData?.users || [];
      if (!users.length) break;
      users.forEach((u) => {
        const m = (u.user_metadata || {});
        allMetas.push({
          name: m.name || null,
          email: m.email || u.email || null,
          country_code: m.country_code || null,
          referred_by: m.referred_by || null,
          referral_id: m.referral_id || null,
          created_at: m.created_at || u.created_at || null,
        });
      });
      if (users.length < 1000) break;
      page += 1;
    }
    const rows = allMetas.map((m) => ({
      name: (m.name || null) as string | null,
      email: (m.email || null) as string | null,
      country_code: (m.country_code || null) as string | null,
      referred_by: (m.referred_by || null) as string | null,
      referral_id: (m.referral_id || null) as string | null,
      created_at: (m.created_at || null) as string | null,
    }));
    const referralToUser: Record<string, UserMeta> = {};
    rows.forEach(r => { if (r.referral_id) referralToUser[r.referral_id] = r; });

    const nodes = rows.map(r => ({
      id: r.referral_id || (r.email || ''),
      name: (r.name || r.email || "Anonymous").trim(),
      countryCode: String(r.country_code || "").toUpperCase(),
      createdAt: r.created_at || new Date().toISOString(),
    }));

    const links = rows
      .filter(r => r.referred_by && referralToUser[r.referred_by])
      .map(r => ({ source: r.referred_by as string, target: (r.referral_id || (r.email || '')) as string }));

    return NextResponse.json({ nodes, links }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}



