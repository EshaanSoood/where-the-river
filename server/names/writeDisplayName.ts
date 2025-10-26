import { supabaseServer } from "@/lib/supabaseServer";

function isServer(): boolean {
  try { return typeof window === 'undefined'; } catch { return true; }
}

export async function ensureDisplayName(userId: string, candidateName: string | null | undefined): Promise<void> {
  try {
    if (!isServer()) throw new Error("ensureDisplayName must run on the server");
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing service role key");
    const name = String(candidateName || '').trim();
    if (!name) return;

    const { data: authRow } = await supabaseServer
      .from('auth.users')
      .select('user_metadata')
      .eq('id', userId)
      .maybeSingle();
    const prevMeta = (authRow ? (authRow as { user_metadata?: Record<string, unknown> | null }).user_metadata : null) || {};
    const prevFull = typeof (prevMeta as Record<string, unknown>).full_name === 'string' ? String((prevMeta as Record<string, unknown>).full_name).trim() : '';
    if (prevFull) return;

    await supabaseServer.auth.admin.updateUserById(userId, { user_metadata: { ...(prevMeta as Record<string, unknown>), full_name: name } });
  } catch {
    // swallow
  }
}
