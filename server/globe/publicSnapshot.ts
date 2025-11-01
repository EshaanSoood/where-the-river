import { supabaseServer } from "@/lib/supabaseServer";
import type { PublicGlobeLink, PublicGlobeNode, PublicGlobeSnapshot } from "@/types/globe";

type UserMeta = {
  name?: string | null;
  email?: string | null;
  country_code?: string | null;
  created_at?: string | null;
};

type UserReferralRow = {
  user_id: string;
  referral_code: string | null;
  referred_by_user_id: string | null;
  boats_total: number;
  created_at: string;
};

type AdminUser = {
  id: string;
  email: string | null;
  created_at: string;
  user_metadata?: UserMeta;
};

type AdminListUsersResult = {
  data: { users: AdminUser[] } | null;
  error: { message: string } | null;
};

type AdminClient = {
  auth: {
    admin: {
      listUsers: (args: { page: number; perPage: number }) => Promise<AdminListUsersResult>;
    };
  };
};

const SNAPSHOT_TTL_MS = 10 * 60 * 1000;

let cachedSnapshot: { filter: "all" | "30d" | "7d"; data: PublicGlobeSnapshot; expiresAt: number } | null = null;
let inflightBuild: Promise<PublicGlobeSnapshot> | null = null;

async function buildSnapshot(filter: "all" | "30d" | "7d" = "all"): Promise<PublicGlobeSnapshot> {
  const since = filter === "all" ? null : new Date(Date.now() - (filter === "30d" ? 30 : 7) * 24 * 3600 * 1000);

  const adminClient = supabaseServer as unknown as AdminClient;
  const authUsersById: Record<string, { name?: string | null; email?: string | null; country_code?: string | null; created_at: string }> = {};

  let page = 1;
  while (true) {
    const { data: pageData, error: pageErr } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
    if (pageErr) throw new Error(pageErr.message);
    const users: AdminUser[] = pageData?.users || [];
    if (!users.length) break;
    users.forEach((u) => {
      const m = u.user_metadata || {};
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

  const { data: referrals, error: refErr } = await supabaseServer
    .from("users_referrals")
    .select("user_id,referral_code,referred_by_user_id,boats_total,created_at");

  if (refErr) throw new Error(refErr.message);

  const referralsByUserId: Record<string, UserReferralRow> = {};
  (referrals as UserReferralRow[] | null)?.forEach((row) => {
    referralsByUserId[row.user_id] = row;
  });

  const nodes: PublicGlobeNode[] = Object.entries(authUsersById)
    .filter(([_, auth]) => {
      if (!since) return true;
      const createdAt = auth.created_at ? new Date(auth.created_at).getTime() : 0;
      return !Number.isFinite(since.getTime()) || createdAt >= since.getTime();
    })
    .map(([userId, auth]) => {
      const ref = referralsByUserId[userId];
      return {
        id: userId,
        name: (auth.name || auth.email || "Anonymous").trim(),
        countryCode: String(auth.country_code || "").toUpperCase(),
        createdAt: auth.created_at || new Date().toISOString(),
        boats: ref?.boats_total || 0,
      };
    });

  const links: PublicGlobeLink[] = Object.values(referralsByUserId)
    .filter((ref) => {
      if (!ref.referred_by_user_id) return false;
      if (!authUsersById[ref.referred_by_user_id]) return false;
      if (since) {
        const createdAt = ref.created_at ? new Date(ref.created_at).getTime() : 0;
        return createdAt >= since.getTime();
      }
      return true;
    })
    .map((ref) => ({
      source: ref.referred_by_user_id as string,
      target: ref.user_id,
    }));

  return {
    generatedAt: new Date().toISOString(),
    nodes,
    links,
  };
}

export async function getPublicGlobeSnapshot(filter: "all" | "30d" | "7d" = "all"): Promise<PublicGlobeSnapshot> {
  const now = Date.now();
  if (cachedSnapshot && cachedSnapshot.filter === filter && cachedSnapshot.expiresAt > now) {
    return cachedSnapshot.data;
  }
  if (inflightBuild) {
    return inflightBuild;
  }
  inflightBuild = buildSnapshot(filter)
    .then((data) => {
      cachedSnapshot = { filter, data, expiresAt: Date.now() + SNAPSHOT_TTL_MS };
      return data;
    })
    .finally(() => {
      inflightBuild = null;
    });
  return inflightBuild;
}

export function getCachedGlobeSnapshot(filter: "all" | "30d" | "7d" = "all") {
  if (cachedSnapshot && cachedSnapshot.filter === filter && cachedSnapshot.expiresAt > Date.now()) {
    return cachedSnapshot;
  }
  return null;
}


