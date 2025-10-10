// Geometry types to support Polygon and MultiPolygon with proper narrowing
export type Geometry = {
  type: 'Polygon';
  coordinates: number[][][];
} | {
  type: 'MultiPolygon';
  coordinates: number[][][][];
};

export interface Feature {
  type: 'Feature';
  id?: string | number;
  properties: { [key: string]: any };
  geometry: Geometry;
}

export interface FeatureCollection {
  type: 'FeatureCollection';
  features: Feature[];
}


