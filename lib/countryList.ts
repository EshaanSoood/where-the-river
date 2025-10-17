import { ALL_ISO2 } from "@/lib/iso2";

export type IsoCountry = { code: string; name: string };

type RegionDisplayNames = {
  of: (code: string) => string | undefined;
};

export function getIsoCountries(locale: string = "en"): IsoCountry[] {
  const dn = createRegionDisplayNames(locale);
  const list = ALL_ISO2.map((code) => ({ code, name: safeRegionName(dn, code) }));
  list.sort((a, b) => a.name.localeCompare(b.name));
  return list;
}

function createRegionDisplayNames(locale: string): RegionDisplayNames {
  try {
    // Narrow typing for Intl.DisplayNames; not all environments support it
    type DisplayNamesCtor = new (
      locale: string,
      options: { type: "region" }
    ) => { of: (code: string) => string | undefined };
    const Ctor = (Intl as unknown as { DisplayNames?: DisplayNamesCtor }).DisplayNames;
    if (Ctor && typeof Ctor === "function") {
      const inst = new Ctor(locale, { type: "region" });
      return { of: (code: string) => inst.of(code) as string | undefined };
    }
  } catch {}
  return { of: (code: string) => code };
}

function safeRegionName(dn: RegionDisplayNames, code: string): string {
  const n = dn.of(code);
  return typeof n === "string" && n.length > 0 ? n : code;
}


