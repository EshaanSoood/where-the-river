import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;

if (!url || !serviceKey) {
  // In production, this must be set; in dev we allow missing to avoid build failures
  if (process.env.NODE_ENV === "production") {
    throw new Error("Missing Supabase server env vars");
  }
}

export const supabaseServer = createClient(url || "", serviceKey || "");


