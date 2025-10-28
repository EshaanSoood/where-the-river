import { supabaseServer } from "@/lib/supabaseServer";

type NameResult = { fullName: string | null; firstName: string | null; source: string };

function isNonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function titleCaseLocalPart(local: string): string {
  const cleaned = local
    .replace(/\+.*/, "")
    .replace(/[\._]+/g, " ")
    .trim();
  return cleaned
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export async function getDisplayNameByUserId(userId: string): Promise<NameResult> {
  try {
    // Admin API first (PostgREST cannot query auth.users)
    let metaFull: string | null = null;
    let metaName: string | null = null;
    let email: string | null = null;
    try {
      const { data, error } = await supabaseServer.auth.admin.getUserById(userId);
      if (!error && data?.user) {
        const um = (data.user.user_metadata || {}) as Record<string, unknown>;
        email = isNonEmpty((data.user as { email?: string | null }).email || null) 
          ? String((data.user as { email?: string | null }).email) 
          : null;
        metaFull = isNonEmpty(um.full_name) ? String(um.full_name) : null;
        metaName = isNonEmpty(um.name) ? String(um.name) : null;
      }
    } catch {}

    if (isNonEmpty(metaFull)) {
      const first = metaFull!.split(/\s+/)[0] || null;
      return { fullName: metaFull!, firstName: first, source: "auth.user_metadata.full_name" };
    }
    if (isNonEmpty(metaName)) {
      const first = metaName!.split(/\s+/)[0] || null;
      return { fullName: metaName!, firstName: first, source: "auth.user_metadata.name" };
    }

    if (isNonEmpty(email)) {
      const local = String(email).split("@")[0] || "";
      const tc = titleCaseLocalPart(local);
      if (isNonEmpty(tc)) {
        const first = tc.split(/\s+/)[0] || null;
        return { fullName: tc, firstName: first, source: "auth.email_localpart" };
      }
    }

    return { fullName: null, firstName: null, source: "none" };
  } catch {
    return { fullName: null, firstName: null, source: "error" };
  }
}


