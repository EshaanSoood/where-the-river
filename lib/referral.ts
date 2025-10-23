"use client";

// Lightweight localStorage with TTL helpers
type StoredValue<T> = { v: T; e: number };

function now(): number { return Date.now(); }

export function getWithTTL<T = unknown>(key: string): T | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredValue<T> | null;
    if (!parsed || typeof parsed.e !== "number") return null;
    if (parsed.e > now()) return parsed.v as T;
    // expired
    try { window.localStorage.removeItem(key); } catch {}
    return null;
  } catch {
    return null;
  }
}

export function setWithTTL<T = unknown>(key: string, value: T, ttlMs: number): void {
  try {
    if (typeof window === "undefined") return;
    const payload: StoredValue<T> = { v: value, e: now() + Math.max(0, ttlMs) };
    window.localStorage.setItem(key, JSON.stringify(payload));
  } catch {}
}

// Keys and TTLs
export const REF_CODE_KEY = "river.ref"; // local persistence of ref code (Step 2)
export const REF_FIRST_KEY = "river.ref_first"; // inviter first name (Step 3)
export const REF_UID_KEY = "river.ref_uid"; // inviter user id (for self-ref guard)

export const REF_CODE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days (Step 2)
export const REF_FIRST_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours (Step 3)

const REF_UPDATE_EVENT = "river:ref-update";

function dispatchRefUpdate(detail: { code?: string | null; firstName?: string | null; userId?: string | null }) {
  try {
    if (typeof window === "undefined") return;
    const ev = new CustomEvent(REF_UPDATE_EVENT, { detail });
    window.dispatchEvent(ev);
  } catch {}
}

export function onReferralUpdate(handler: (detail: { code?: string | null; firstName?: string | null; userId?: string | null }) => void) {
  const listener = (e: Event) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = (e as any)?.detail as { code?: string | null; firstName?: string | null; userId?: string | null } | undefined;
    handler(d || {});
  };
  if (typeof window !== "undefined") window.addEventListener(REF_UPDATE_EVENT, listener);
  return () => { if (typeof window !== "undefined") window.removeEventListener(REF_UPDATE_EVENT, listener); };
}

export function getReferralSnapshot(): { code: string | null; firstName: string | null; userId: string | null } {
  const code = (getWithTTL<string>(REF_CODE_KEY) || null) as string | null;
  const firstName = (getWithTTL<string>(REF_FIRST_KEY) || null) as string | null;
  const userId = (getWithTTL<string>(REF_UID_KEY) || null) as string | null;
  return { code, firstName, userId };
}

export function captureRefFromURL(): string | null {
  try {
    if (typeof window === "undefined") return null;
    const url = new URL(window.location.href);
    // Normalize: first ref in query wins, decode once, restrict to A-Z0-9
    const raw = (url.searchParams.getAll("ref")[0] || "").trim();
    const once = (() => { try { return decodeURIComponent(raw); } catch { return raw; } })();
    const upper = once.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const ref = upper;
    if (!ref) return null;
    // Persist new ref; update if changed
    const prev = getWithTTL<string>(REF_CODE_KEY);
    if (!prev || prev !== ref) {
      setWithTTL(REF_CODE_KEY, ref, REF_CODE_TTL_MS);
      // Also write cookie contract (best-effort)
      try {
        const attrs = ["Path=/", "Max-Age=" + Math.floor(REF_CODE_TTL_MS / 1000), "SameSite=Lax"];
        // Add Secure when served over https
        if (window.location.protocol === "https:") attrs.push("Secure");
        document.cookie = `river_ref=${ref}; ${attrs.join("; ")}`;
      } catch {}
      dispatchRefUpdate({ code: ref });
    }
    return ref;
  } catch {
    return null;
  }
}

export async function resolveReferrer(code: string): Promise<{ firstName: string | null; userId: string | null }> {
  try {
    const base = (process.env.NEXT_PUBLIC_SITE_URL || process.env.PUBLIC_APP_BASE_URL || (typeof window !== "undefined" ? window.location.origin : "")) as string;
    const url = `${String(base).replace(/\/$/, "")}/api/referral/resolve?code=${encodeURIComponent(code)}`;
    const resp = await fetch(url, { method: "GET" });
    if (!resp.ok) return { firstName: null, userId: null };
    const json = await resp.json();
    const first = typeof json?.first_name === "string" ? json.first_name : null;
    const uid = typeof json?.user_id === "string" ? json.user_id : null;
    return { firstName: first, userId: uid };
  } catch {
    return { firstName: null, userId: null };
  }
}

export async function ensureRefCapturedAndResolved(): Promise<void> {
  try {
    // Precedence: URL > cookie > localStorage
    const fromUrl = captureRefFromURL();
    const fromCookie = (() => {
      try {
        if (typeof document === "undefined") return null;
        const m = document.cookie.match(/(?:^|; )river_ref=([^;]+)/);
        const v = m ? decodeURIComponent(m[1]) : "";
        const norm = (v || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
        return norm || null;
      } catch { return null; }
    })();
    const fromLocal = getWithTTL<string>(REF_CODE_KEY) || null;
    const ref = fromUrl || fromCookie || fromLocal;
    if (!ref) return;

    const existingFirst = getWithTTL<string>(REF_FIRST_KEY);
    const existingUid = getWithTTL<string>(REF_UID_KEY);
    if (existingFirst && existingUid) return; // fresh enough

    // Background resolve; do not block UI
    const timer = setTimeout(() => { /* intentional: no-op placeholder for potential UX hooks */ }, 500);
    const { firstName, userId } = await resolveReferrer(ref);
    clearTimeout(timer);
    if (firstName) setWithTTL(REF_FIRST_KEY, firstName, REF_FIRST_TTL_MS);
    if (userId) setWithTTL(REF_UID_KEY, userId, REF_FIRST_TTL_MS);
    dispatchRefUpdate({ code: ref, firstName: firstName || null, userId: userId || null });
  } catch {}
}

export function hasCookieRef(): boolean {
  try { if (typeof document === "undefined") return false; return /(?:^|; )river_ref=/.test(document.cookie); } catch { return false; }
}

export function trySetCookieRef(code: string): boolean {
  try {
    if (typeof document === "undefined") return false;
    const norm = (code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const attrs = ["Path=/", "Max-Age=" + Math.floor(REF_CODE_TTL_MS / 1000), "SameSite=Lax"];
    if (typeof window !== "undefined" && window.location.protocol === "https:") attrs.push("Secure");
    document.cookie = `river_ref=${norm}; ${attrs.join("; ")}`;
    // read-back
    return /(?:^|; )river_ref=/.test(document.cookie);
  } catch { return false; }
}





