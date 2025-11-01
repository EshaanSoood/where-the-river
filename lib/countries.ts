import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { FeatureCollection, Feature } from 'geojson';

export type Country = { name: string; code?: string };

export async function fetchCountries110m(): Promise<Country[]> {
  try {
    const filePath = path.join(process.cwd(), 'public', 'world-atlas', 'countries-110m.json');
    const fileContents = await fs.readFile(filePath, 'utf-8');
    const topo: unknown = JSON.parse(fileContents);
    const topojson = await import('topojson-client');
    const result = topojson.feature(
      topo as unknown as Parameters<typeof topojson.feature>[0],
      (topo as { objects: { countries: unknown } }).objects.countries as unknown as Parameters<typeof topojson.feature>[1]
    ) as unknown;

    const names = new Set<string>();
    const countries: Country[] = [];
    let features: Feature[] = [];
    if (typeof result === 'object' && result !== null && 'type' in result) {
      const r = result as { type: string; features?: Feature[] };
      if (r.type === 'FeatureCollection' && Array.isArray(r.features)) {
        features = r.features as Feature[];
      }
    }
    for (const f of features) {
      const name = (f.properties as { name?: string } | null)?.name;
      if (name && !names.has(name)) {
        names.add(name);
        countries.push({ name });
      }
    }
    countries.sort((a, b) => a.name.localeCompare(b.name));
    return countries;
  } catch {
    return [];
  }
}


