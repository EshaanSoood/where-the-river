import type { FeatureCollection, Feature } from 'geojson';

export type Country = { name: string; code?: string };

export async function fetchCountries110m(): Promise<Country[]> {
  const res = await fetch('https://unpkg.com/world-atlas@2.0.2/countries-110m.json');
  if (!res.ok) return [];
  const topo: unknown = await res.json();
  const topojson = await import('topojson-client');
  const fc = topojson.feature(
    topo as never,
    (topo as { objects: { countries: unknown } }).objects.countries as never
  ) as FeatureCollection;

  const names = new Set<string>();
  const countries: Country[] = [];
  for (const f of fc.features as Feature[]) {
    const name = (f.properties as { name?: string } | null)?.name;
    if (name && !names.has(name)) {
      names.add(name);
      countries.push({ name });
    }
  }
  countries.sort((a, b) => a.name.localeCompare(b.name));
  return countries;
}


