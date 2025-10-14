export type Country = { name: string; code?: string };

export async function fetchCountries110m(): Promise<Country[]> {
  const res = await fetch('https://unpkg.com/world-atlas@2.0.2/countries-110m.json');
  if (!res.ok) return [];
  const topo = await res.json();
  const features = (await import('topojson-client')).feature(topo, topo.objects.countries) as unknown as { features: any[] };
  const names = new Set<string>();
  const countries: Country[] = [];
  for (const f of features.features || []) {
    const name = f?.properties?.name;
    if (name && !names.has(name)) {
      names.add(name);
      countries.push({ name });
    }
  }
  countries.sort((a, b) => a.name.localeCompare(b.name));
  return countries;
}


