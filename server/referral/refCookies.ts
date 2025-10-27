import { cookies } from 'next/headers';

export function normalizeReferralCode(input: unknown): string | null {
  if (input === undefined || input === null) return null;
  try {
    const s = String(input).trim();
    const digits = s.replace(/\D+/g, '');
    return digits.length > 0 ? digits : null;
  } catch {
    return null;
  }
}

export async function readReferralFromHttpOnlyCookie(): Promise<string | null> {
  try {
    const jar = await cookies();
    const raw = (jar.get('river_ref_h')?.value ?? '').trim();
    return normalizeReferralCode(raw);
  } catch {
    return null;
  }
}

// Back-compat alias used elsewhere in the codebase
export const readReferralFromCookies = readReferralFromHttpOnlyCookie;


