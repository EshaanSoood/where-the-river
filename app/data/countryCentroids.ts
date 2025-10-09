// Minimal ISO-2 to [lat, lng] centroid mapping.
// Extend as needed; unknown codes should be handled upstream.
export const countryCodeToLatLng: Record<string, [number, number]> = {
  US: [39.7837304, -100.445882],
  CA: [61.0666922, -107.991707],
  GB: [54.7023545, -3.2765753],
  IN: [22.3511148, 78.6677428],
  DE: [51.1638175, 10.4478313],
  FR: [46.603354, 1.8883335],
  ES: [39.3260685, -4.8379791],
  IT: [42.6384261, 12.674297],
  BR: [-10.3333333, -53.2],
  AR: [-34.9964963, -64.9672817],
  AU: [-24.7761086, 134.755],
  JP: [36.5748441, 139.2394179],
  CN: [35.000074, 104.999927],
  SG: [1.357107, 103.8194992],
  ZA: [-28.8166236, 24.991639],
  KE: [-0.1768696, 37.9083264],
  NG: [9.6000359, 7.9999721],
  MX: [23.6585116, -102.0077097],
  RU: [64.6863136, 97.7453061],
  TR: [39.0616, 35.1623],
};

export function jitterLatLng(
  lat: number,
  lng: number,
  magnitudeDeg: number = 1.0
): [number, number] {
  // Light random offset within a small box around the centroid
  const r1 = (Math.random() - 0.5) * magnitudeDeg;
  const r2 = (Math.random() - 0.5) * magnitudeDeg;
  const jLat = Math.max(-85, Math.min(85, lat + r1));
  const jLng = ((lng + r2 + 540) % 360) - 180; // normalize
  return [jLat, jLng];
}


