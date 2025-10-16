import { countryCodeToLatLng } from "@/app/data/countryCentroids";

export function normalizeInput(raw: string): string {
  const s = String(raw || "");
  // strip common punctuation such as em-dash and trim whitespace
  return s.replace(/—/g, "").trim();
}

export function getAllIso2Codes(): string[] {
  return Object.keys(countryCodeToLatLng);
}

export function isIso2(code: string): boolean {
  return /^[A-Za-z]{2}$/.test(code);
}

export function toIso2Upper(code: string): string {
  return code.toUpperCase();
}

// Safe DisplayNames wrapper for server and client
function getDisplayNameForCode(code: string, locale: string = "en"): string {
  try {
    // Narrow typing for Intl.DisplayNames to avoid 'any'
    type DisplayNamesCtor = new (
      locale: string,
      options: { type: "region" }
    ) => { of: (code: string) => string | undefined };
    const Ctor = (Intl as unknown as { DisplayNames?: DisplayNamesCtor }).DisplayNames;
    if (Ctor && typeof Ctor === "function") {
      const inst = new Ctor(locale, { type: "region" });
      const name = inst.of(code);
      if (typeof name === "string" && name.length > 0) return name;
    }
  } catch {}
  return code;
}

export function getCountryNameFromCode(code: string, locale: string = "en"): string {
  const upper = toIso2Upper(code);
  if (!getAllIso2Codes().includes(upper)) return upper;
  return getDisplayNameForCode(upper, locale);
}

export function resolveIso2(input: string, locale: string = "en"): string | null {
  const cleaned = normalizeInput(input);
  if (isIso2(cleaned)) return toIso2Upper(cleaned);
  // attempt label -> code match (case-insensitive)
  const codes = getAllIso2Codes();
  for (const code of codes) {
    const label = getCountryNameFromCode(code, locale);
    if (label.toLowerCase() === cleaned.toLowerCase()) return toIso2Upper(code);
  }
  return null;
}
