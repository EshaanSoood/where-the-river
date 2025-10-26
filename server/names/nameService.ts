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
    // Metadata-first (no profiles reads)
    let metaFull: string | null = null;
    let metaName: string | null = null;
    let email: string | null = null;
    try {
      const { data: authRow } = await supabaseServer
        .from("auth.users")
        .select("email, raw_user_meta_data")
        .eq("id", userId)
        .maybeSingle();
      if (authRow) {
        const a = authRow as { email?: string | null; raw_user_meta_data?: Record<string, unknown> | null };
        email = (a.email || null) as string | null;
        const m = (a.raw_user_meta_data || {}) as Record<string, unknown>;
        metaFull = isNonEmpty(m.full_name) ? String(m.full_name) : null;
        metaName = isNonEmpty(m.name) ? String(m.name) : null;
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


