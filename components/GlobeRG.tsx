"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactGlobe from "react-globe.gl";
import * as THREE from "three";
import * as topojson from "topojson-client";
// import { geoCentroid } from "d3-geo";
import { fetchGlobeData } from "@/lib/globeData";
import { countryCodeToLatLng } from "@/app/data/countryCentroids";
import { getSupabase } from "@/lib/supabaseClient";

type ArcData = { startLat: number; startLng: number; endLat: number; endLng: number; key?: string };
type PointData = { lat: number; lng: number; size: number; color: string; id?: string; countryCode?: string; name?: string };
type CountriesData = { features: any[] };
type Boat = { id: number; mesh: THREE.Mesh; curve: THREE.CatmullRomCurve3; startTime: number; duration: number };

const createPaperTexture = (): THREE.CanvasTexture | null => {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.fillStyle = "#f8f8f4";
  context.fillRect(0, 0, canvas.width, canvas.height);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const noise = (Math.random() - 0.5) * 20;
    data[i] = Math.max(0, Math.min(255, data[i] + noise));
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise));
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise));
  }
  context.putImageData(imageData, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
};

type GlobeRGProps = {
  describedById?: string;
  ariaLabel?: string;
  tabIndex?: number;
};

export default function GlobeRG({ describedById = "globe-sr-summary", ariaLabel = "Interactive globe showing Dream River connections", tabIndex = 0 }: GlobeRGProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const globeEl = useRef<any>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const boatsRef = useRef<Boat[]>([]);
  // Session seed (stable for the life of the page) and per-edge params cache
  const createSessionSeed = () => {
    try {
      const arr = new Uint32Array(1);
  if (typeof crypto !== 'undefined' && (crypto as Crypto).getRandomValues) { (crypto as Crypto).getRandomValues(arr); return arr[0] >>> 0; }
    } catch {}
    return (Math.floor(Math.random() * 0xffffffff) >>> 0);
  };
  const sessionSeedRef = useRef<number>(createSessionSeed());
  type EdgeParams = {
    // Legacy params (kept for compatibility)
    curvatureT: number;
    lateralJitter: number;
    altitudeJitter: number;
    // Organic river params (stable, bounded)
    sign: -1 | 1;               // left vs right bend
    curvFactor: number;         // fraction of chord length (0.10..0.22)
    wiggleAmpFactor: number;    // fraction of chord length (0.015..0.06)
    wiggleFreq: number;         // small integer 1..3
    phase: number;              // 0..2π
  };
  const edgeParamsRef = useRef<Map<string, EdgeParams>>(new Map());
  const getOrCreateEdgeParams = (edgeKey: string): EdgeParams => {
    const existing = edgeParamsRef.current.get(edgeKey);
    if (existing) return existing;
    // Mulberry32 PRNG seeded by sessionSeed ^ hash(edgeKey)
    const seed = (sessionSeedRef.current ^ hashString(edgeKey)) >>> 0;
    const rand = mulberry32(seed);
    // Helper mappers
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    const r1 = rand();
    const r2 = rand();
    const r3 = rand();
    const r4 = rand();
    const r5 = rand();
    const p: EdgeParams = {
      curvatureT: clamp01(r1),
      lateralJitter: (r2 * 2 - 1) * 0.25,
      altitudeJitter: r3 * 0.15,
      sign: (r4 < 0.5 ? -1 : 1),
      curvFactor: lerp(0.10, 0.22, r1),
      wiggleAmpFactor: lerp(0.015, 0.05, r2),
      wiggleFreq: Math.max(1, Math.min(3, 1 + Math.floor(r3 * 3))),
      phase: r5 * Math.PI * 2,
    };
    edgeParamsRef.current.set(edgeKey, p);
    return p;
  };
  const countriesLODRef = useRef<{ low: CountriesData; high: CountriesData }>({ low: { features: [] }, high: { features: [] } });

  const [countriesLOD, setCountriesLOD] = useState<{ low: CountriesData; high: CountriesData }>({ low: { features: [] }, high: { features: [] } });
  const [currentLOD, setCurrentLOD] = useState<"low" | "high">("low");
  const [arcsData, setArcsData] = useState<ArcData[]>([]);
  const [pointsData, setPointsData] = useState<PointData[]>([]);
  const [visiblePoints, setVisiblePoints] = useState<PointData[]>([]);
  const [pointLabelOverlays, setPointLabelOverlays] = useState<{ id: string; x: number; y: number; text: string }[]>([]);
  const [hoveredPointId, setHoveredPointId] = useState<string | null>(null);
  const [hoveredCountry, setHoveredCountry] = useState<any | null>(null);
  const nodesRef = useRef<{ id: string; lat: number; lng: number }[]>([]);
  const userRefCodeRef = useRef<string | null>(null);
  const userLatLngRef = useRef<{ lat: number; lng: number } | null>(null);
  const userGlowRef = useRef<HTMLDivElement | null>(null);
  const userBadgeRef = useRef<HTMLDivElement | null>(null);
  const [userBadgeOpen, setUserBadgeOpen] = useState<boolean>(false);
  const userMeRef = useRef<{ name?: string | null; boats_total?: number | null; boat_color?: string | null; country_name?: string | null } | null>(null);
  const userHotspotRef = useRef<HTMLButtonElement | null>(null);
  const userBadgeHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const [srAnnounce, setSrAnnounce] = useState<string>("");

  const [tooltip, setTooltip] = useState<{ content: string | null; x: number; y: number }>({ content: null, x: 0, y: 0 });
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  // SVG path reuse: keep a single <svg> element and update individual <path> d/opacity
  const svgRef = useRef<SVGSVGElement | null>(null);
  const pathMapRef = useRef<Map<string, SVGPathElement>>(new Map());
  const anchorsRef = useRef<Map<string, { startLat: number; startLng: number; endLat: number; endLng: number }>>(new Map());
  const prevSizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });
  const projectPathsRef = useRef<(() => void) | null>(null);
  const [svgPaths, setSvgPaths] = useState<{ d: string; w: number; dash: number; opacity: number }[]>([]);

  useEffect(() => { countriesLODRef.current = countriesLOD; }, [countriesLOD]);

  // Capacity & overflow (+K) state
  const baselineDistanceRef = useRef<number>(0);
  const zoomBucketRef = useRef<string>("");
  const countryCapacityRef = useRef<Map<string, number>>(new Map());
  const overflowBadgesRef = useRef<Map<string, { x: number; y: number; k: number; label: string }>>(new Map());
  const nearFullBadgesRef = useRef<Map<string, { x: number; y: number; label: string }>>(new Map());
  const clusterPeopleLabelsRef = useRef<Map<string, { x: number; y: number; label: string }>>(new Map());
  const [pointsTransitionMs, setPointsTransitionMs] = useState<number>(250);
  const pointEnterAtRef = useRef<Map<string, number>>(new Map());
  const pointExitAtRef = useRef<Map<string, number>>(new Map());
  const prevVisibleIdsRef = useRef<Set<string>>(new Set());
  const animRafRef = useRef<number | null>(null);
  const [animTick, setAnimTick] = useState<number>(0);
  const animActiveRef = useRef<boolean>(false);
  const pendingRecalcRef = useRef<boolean>(false);
  const lastRecalcAtRef = useRef<number>(0);
  const allPointsByIdRef = useRef<Map<string, PointData>>(new Map());
  const connectedIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    try {
      const prefersReduced = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      setPointsTransitionMs(prefersReduced ? 0 : 300);
    } catch { setPointsTransitionMs(300); }
  }, []);

  // Helper: project lat/lng to screen coords using current camera
  const projectLatLng = (lat: number, lng: number): { x: number; y: number } | null => {
    try {
      const wrap = wrapRef.current;
      const globe = globeEl.current;
      if (!wrap || !globe) return null;
      const rect = wrap.getBoundingClientRect();
      const camera = globe.camera();
      const c = globe.getCoords(lat, lng);
      if (!c) return null;
      const v = new THREE.Vector3(c.x, c.y, c.z);
      v.project(camera);
      const x = (v.x * 0.5 + 0.5) * rect.width;
      const y = (-v.y * 0.5 + 0.5) * rect.height;
      return { x, y };
    } catch { return null; }
  };

  // Recalculate visible points and overflow badges per zoom bucket
  const recalcVisiblePoints = () => {
    try {
      if (!pointsData || pointsData.length === 0) return;
      const globe = globeEl.current;
      if (!globe) return;
      const dist = globe.camera().position.length();
      const ratio = Math.max(0.0001, baselineDistanceRef.current / dist);
      const buckets = [1.0,1.2,1.4,1.6,1.8,2.0,2.2,2.4];
      const pick = buckets.reduce((acc, b) => (Math.abs(b - ratio) < Math.abs(acc - ratio) ? b : acc), buckets[0]);
      const bucketLabel = `z${pick.toFixed(1)}`;
      // If we're mid-animation, queue and return to avoid flicker
      if (animActiveRef.current) { pendingRecalcRef.current = true; return; }
      if (zoomBucketRef.current && zoomBucketRef.current === bucketLabel) return; // hysteresis via buckets

      const wrap = wrapRef.current;
      const rect = wrap ? wrap.getBoundingClientRect() : { width: 1024, height: 768 } as any;
      const baseCap = 4;

      const byCountry = new Map<string, PointData[]>();
      for (const p of pointsData) {
        const key = p.countryCode || "";
        if (!byCountry.has(key)) byCountry.set(key, []);
        byCountry.get(key)!.push(p);
      }

      const nextVisible: PointData[] = [];
      overflowBadgesRef.current.clear();
      nearFullBadgesRef.current.clear();

      byCountry.forEach((arr, cc) => {
        const mine = arr.find(p => p.id === userRefCodeRef.current);
        const rest = arr.filter(p => p !== mine);
        // per-country pixel scale via centroid
        let cap = baseCap;
        let dx = 0;
        if (cc) {
          const centroid = countryCodeToLatLng[cc];
          if (centroid) {
            const c0 = projectLatLng(centroid[0], centroid[1]);
            const c1 = projectLatLng(centroid[0], Math.min(179.999, centroid[1] + 1));
            if (c0 && c1) {
              dx = Math.hypot(c1.x - c0.x, c1.y - c0.y);
              const r = Math.max(10, dx * 0.45 * pick);
              const minSpacingPx = 12;
              cap = Math.max(baseCap, Math.floor((2 * Math.PI * r) / minSpacingPx));
            }
          }
        }
        // Small screens and tiny countries prefer clustering sooner
        const isSmallScreen = rect.width < 768;
        const isTinyCountry = dx > 0 && dx < 18; // ~small on-screen footprint
        if (isSmallScreen) cap = Math.max(baseCap, Math.floor(cap * 0.75));
        if (isTinyCountry) cap = Math.min(cap, baseCap + 1);
        const allowed = Math.max(0, cap - (mine ? 1 : 0));
        const shown = rest.slice(0, allowed);
        if (mine) nextVisible.push(mine);
        nextVisible.push(...shown);
        const total = arr.length;
        const overflow = total - (shown.length + (mine ? 1 : 0));
        const nearFullThreshold = (isSmallScreen || isTinyCountry) ? 0.75 : 0.8;
        const nearFull = overflow <= 0 && total > nearFullThreshold * cap && total <= cap;
        if (overflow > 0) {
          // centroid from country code
          const centroid = cc && countryCodeToLatLng[cc] ? { lat: countryCodeToLatLng[cc][0], lng: countryCodeToLatLng[cc][1] } : null;
          const pr = centroid ? projectLatLng(centroid.lat, centroid.lng) : null;
          if (pr) overflowBadgesRef.current.set(cc, { x: pr.x, y: pr.y - 10, k: overflow, label: `+${overflow} more` });
        } else if (nearFull) {
          const centroid = cc && countryCodeToLatLng[cc] ? { lat: countryCodeToLatLng[cc][0], lng: countryCodeToLatLng[cc][1] } : null;
          const pr = centroid ? projectLatLng(centroid.lat, centroid.lng) : null;
          if (pr) nearFullBadgesRef.current.set(cc, { x: pr.x, y: pr.y - 10, label: `${total} listeners` });
        }
      });

      // Track new entries for bloom animation
      try {
        const nextIds = new Set<string>(nextVisible.map(p => p.id!).filter(Boolean) as string[]);
        const now = performance.now();
        // mark enters
        nextIds.forEach(id => { if (!prevVisibleIdsRef.current.has(id)) { pointEnterAtRef.current.set(id, now); pointExitAtRef.current.delete(id); } });
        // mark exits
        prevVisibleIdsRef.current.forEach(id => { if (!nextIds.has(id)) { pointExitAtRef.current.set(id, now); pointEnterAtRef.current.delete(id); } });
        prevVisibleIdsRef.current = nextIds;
      } catch {}

      setVisiblePoints(nextVisible);
      // Build per-point label overlays for currently visible points
      try {
        const labels: { id: string; x: number; y: number; text: string }[] = [];
        const wrap = wrapRef.current;
        const globe = globeEl.current;
        if (wrap && globe) {
          const cam = globe.camera();
          nextVisible.forEach(p => {
            if (!p.id) return;
            const c = globe.getCoords(p.lat, p.lng);
            if (!c) return;
            const rect = wrap.getBoundingClientRect();
            const v = new THREE.Vector3(c.x, c.y, c.z);
            const dot = v.clone().normalize().dot(cam.position.clone().normalize());
            if (dot <= 0) return;
            v.project(cam);
            const x = (v.x * 0.5 + 0.5) * rect.width;
            const y = (-v.y * 0.5 + 0.5) * rect.height;
            const initials = (p.name || '').trim().split(/\s+/).slice(0,2).map(s => s[0]?.toUpperCase() || '').join('') || '—';
            labels.push({ id: p.id, x, y: y + 10, text: initials });
          });
        }
        setPointLabelOverlays(labels);
      } catch {}
      // Update current bucket after applying
      zoomBucketRef.current = bucketLabel;
      lastRecalcAtRef.current = performance.now();
      // Kick bloom RAF
      startBloomAnim();
    } catch {}
  };

  const startBloomAnim = () => {
    try {
      if (animRafRef.current) return;
      const prefersReduced = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (prefersReduced) return;
      const step = () => {
        let anyActive = false;
        const now = performance.now();
        pointEnterAtRef.current.forEach((t0, id) => {
          const elapsed = now - t0;
          if (elapsed < 380) anyActive = true; else pointEnterAtRef.current.delete(id);
        });
        pointExitAtRef.current.forEach((t0, id) => {
          const elapsed = now - t0;
          if (elapsed < 220) anyActive = true; else pointExitAtRef.current.delete(id);
        });
        setAnimTick(now);
        animActiveRef.current = anyActive;
        if (anyActive) {
          animRafRef.current = requestAnimationFrame(step);
        } else {
          if (animRafRef.current) cancelAnimationFrame(animRafRef.current);
          animRafRef.current = null;
          // If a recompute was queued during animation, run it now on next frame
          if (pendingRecalcRef.current) {
            pendingRecalcRef.current = false;
            requestAnimationFrame(() => recalcVisiblePoints());
          }
        }
      };
      animRafRef.current = requestAnimationFrame(step);
    } catch {}
  };

  // Recalc on points data changes
  useEffect(() => { try { recalcVisiblePoints(); } catch {} }, [pointsData]);

  // Project the logged-in user's node to screen coords and position overlays
  const updateUserOverlaysPosition = () => {
    try {
      const wrap = wrapRef.current;
      const globe = globeEl.current;
      const glow = userGlowRef.current;
      const badge = userBadgeRef.current;
      const hotspot = userHotspotRef.current;
      const pos = userLatLngRef.current;
      if (!wrap || !globe || !pos) { if (glow) glow.style.opacity = '0'; if (badge) badge.style.opacity = '0'; if (hotspot) hotspot.style.opacity = '0'; return; }
      const rect = wrap.getBoundingClientRect();
      const cam = globe.camera();
      const c = globe.getCoords(pos.lat, pos.lng);
      if (!c) { if (glow) glow.style.opacity = '0'; if (badge) badge.style.opacity = '0'; if (hotspot) hotspot.style.opacity = '0'; return; }
      const world = new THREE.Vector3(c.x, c.y, c.z);
      const dot = world.clone().normalize().dot(cam.position.clone().normalize());
      if (dot <= 0) { if (glow) glow.style.opacity = '0'; if (badge) badge.style.opacity = '0'; if (hotspot) hotspot.style.opacity = '0'; return; } // hide when on back side
      const v = world.project(cam);
      const x = (v.x * 0.5 + 0.5) * rect.width;
      const y = (-v.y * 0.5 + 0.5) * rect.height;
      if (glow) { glow.style.left = `${x}px`; glow.style.top = `${y}px`; glow.style.opacity = '1'; }
      if (badge && userBadgeOpen) { badge.style.left = `${x}px`; badge.style.top = `${y - 36}px`; badge.style.opacity = '1'; }
      if (hotspot) { hotspot.style.left = `${x}px`; hotspot.style.top = `${y}px`; hotspot.style.opacity = '0.001'; hotspot.style.pointerEvents = 'auto'; hotspot.tabIndex = 0; hotspot.setAttribute('aria-hidden', 'false'); }
    } catch {}
  };

  // Fetch countries LOD
  useEffect(() => {
    fetch("https://unpkg.com/world-atlas@2/countries-110m.json")
      .then(res => res.json())
      .then((countriesTopo) => {
        const lowResFeatures = topojson.feature(countriesTopo, (countriesTopo as any).objects.countries);
        setCountriesLOD(prev => ({ ...prev, low: lowResFeatures as any }));
      })
      .catch(() => setCountriesLOD(prev => ({ ...prev, low: { features: [] } })));

    fetch("https://unpkg.com/world-atlas@2/countries-50m.json")
      .then(res => res.json())
      .then((countriesTopo) => {
        const highResFeatures = topojson.feature(countriesTopo, (countriesTopo as any).objects.countries);
        setCountriesLOD(prev => ({ ...prev, high: highResFeatures as any }));
      })
      .catch(() => setCountriesLOD(prev => ({ ...prev, high: { features: [] } })));
  }, []);

  // Build polygons layers
  const polygonsData = useMemo(() => {
    const active = countriesLOD[currentLOD];
    if (!active || !active.features.length) return [] as any[];
    const topLayer = active.features.map((f: any) => ({ ...f, properties: { ...f.properties, layer: "top" } }));
    const bottomLayer = active.features.map((f: any) => ({ ...f, properties: { ...f.properties, layer: "bottom" } }));
    return [...topLayer, ...bottomLayer];
  }, [countriesLOD, currentLOD]);

  // Fetch real data: nodes/links -> arcs
  useEffect(() => {
    let cancelled = false;
    fetchGlobeData("all").then(({ nodes, links }) => {
      if (cancelled) return;
      // Points (origins/destinations) from nodes for subtle markers
      const pts: PointData[] = nodes.map(n => ({ id: n.id, name: n.name, lat: n.lat, lng: n.lng, size: 0.15, color: "rgba(255,255,255,0.6)", countryCode: n.countryCode }));
      setPointsData(pts);
      setVisiblePoints(pts);
      try { const map = new Map<string, PointData>(); pts.forEach(p => { if (p.id) map.set(p.id, p); }); allPointsByIdRef.current = map; } catch {}
      nodesRef.current = nodes.map(n => ({ id: n.id, lat: n.lat, lng: n.lng }));
      const arcs: ArcData[] = [];
      links.forEach(l => {
        const a = nodes.find(n => n.id === l.source);
        const b = nodes.find(n => n.id === l.target);
        if (a && b) {
          const key = `${l.source}\u2192${l.target}`; // use arrow separator to avoid ambiguity
          // Ensure params are created once per edge and reused later
          try { getOrCreateEdgeParams(key); } catch {}
          arcs.push({ startLat: a.lat, startLng: a.lng, endLat: b.lat, endLng: b.lng, key });
        }
      });
      setArcsData(arcs);
      // Precompute adjacency for connection highlighting
      try {
        const adj = new Map<string, Set<string>>();
        links.forEach(l => {
          if (!adj.has(l.source)) adj.set(l.source, new Set());
          if (!adj.has(l.target)) adj.set(l.target, new Set());
          adj.get(l.source)!.add(l.target);
          adj.get(l.target)!.add(l.source);
        });
        const myId = userRefCodeRef.current;
        const set = new Set<string>();
        if (myId && adj.has(myId)) { adj.get(myId)!.forEach(id => set.add(id)); }
        connectedIdsRef.current = set;
      } catch {}
    }).catch(() => {
      if (!cancelled) { setPointsData([]); setArcsData([]); }
    });
    return () => { cancelled = true; };
  }, []);

  // Fetch logged-in user's referral code to highlight their node
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const supabase = getSupabase();
        const { data: auth } = await supabase.auth.getUser();
        const email = auth?.user?.email || null;
        if (!email) return;
        const base = (process.env.NEXT_PUBLIC_SITE_URL || (typeof window !== 'undefined' ? window.location.origin : '')).replace(/\/$/, "");
        const resp = await fetch(`${base}/api/me`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
        if (!resp.ok) return;
        const j = await resp.json();
        const ref = j?.me?.referral_code || j?.me?.ref_code_8 || null;
        if (!alive) return;
        userRefCodeRef.current = typeof ref === 'string' ? ref : null;
        userMeRef.current = { name: j?.me?.name ?? null, boats_total: j?.me?.boats_total ?? null, boat_color: j?.me?.boat_color ?? null, country_name: j?.me?.country_name ?? null };
        // Resolve user's lat/lng from nodes once data is available
        const n = nodesRef.current.find(x => x.id === userRefCodeRef.current);
        userLatLngRef.current = n ? { lat: n.lat, lng: n.lng } : null;
        // Try initial position after we know it
        requestAnimationFrame(() => updateUserOverlaysPosition());
      } catch {}
    })();
    return () => { alive = false; };
  }, []);

  // Materials
  const globeMaterial = useMemo(() => new THREE.MeshPhongMaterial({ color: "#a8c5cd", opacity: 0.6, transparent: true }), []);
  const paperTexture = useMemo(() => createPaperTexture(), []);

  const createPaperBoatGeometry = () => {
    const geometry = new THREE.BufferGeometry();
    const vertices = new Float32Array([0, 0.25, 1, 0, -0.25, 1, -0.5, -0.25, -1, 0.5, -0.25, -1, 0, 0.75, -0.5]);
    const indices = [1, 3, 2, 0, 1, 2, 0, 2, 4, 0, 3, 1, 0, 4, 3, 2, 3, 4];
    geometry.setIndex(indices);
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geometry.computeVertexNormals();
    return geometry;
  };
  const paperBoatGeometry = useMemo(() => createPaperBoatGeometry(), []);

  // Build boats for arcs when globe ready and arcs available
  const ensureBoatsForArcs = () => {
    const globe = globeEl.current;
    const scene = sceneRef.current;
    if (!globe || !scene) return;
    // Clear existing
    boatsRef.current.forEach(b => scene.remove(b.mesh));
    boatsRef.current = [];
    const ARC_ALTITUDE = 0.2;
    const BOAT_PATH_ALTITUDE = 0.07;
    const GLOBE_RADIUS = 100;
    arcsData.forEach((a) => {
      const sc = globe.getCoords(a.startLat, a.startLng);
      const ec = globe.getCoords(a.endLat, a.endLng);
      if (!sc || !ec) return;
      // Read cached per-edge params to bias mid control point to the same side as SVG rivers
      const params = a.key ? getOrCreateEdgeParams(a.key) : { curvatureT: 0.5, lateralJitter: 0, altitudeJitter: 0, sign: 1 as -1 | 1, curvFactor: 0.12, wiggleAmpFactor: 0.02, wiggleFreq: 1, phase: 0 };
      const startPos = new THREE.Vector3(sc.x, sc.y, sc.z).normalize().multiplyScalar(GLOBE_RADIUS * (1 + BOAT_PATH_ALTITUDE));
      const endPos = new THREE.Vector3(ec.x, ec.y, ec.z).normalize().multiplyScalar(GLOBE_RADIUS * (1 + BOAT_PATH_ALTITUDE));
      // Midpoint elevated slightly
      const baseMid = new THREE.Vector3().addVectors(startPos, endPos).multiplyScalar(0.5);
      const midAltitude = GLOBE_RADIUS * (1 + ARC_ALTITUDE + (params.altitudeJitter || 0) * 0.0);
      baseMid.normalize().multiplyScalar(midAltitude);
      // Compute lateral direction at mid: perpendicular to great-circle, tangent at mid
      const normal = startPos.clone().cross(endPos).normalize();
      let lateral = normal.clone().cross(baseMid.clone().normalize()).normalize();
      if (!isFinite(lateral.length())) lateral = normal.clone();
      // Guardrails: clamp lateral offset ≤ 22% of chord length
      const chord = endPos.clone().sub(startPos);
      const chordLen = chord.length();
      const curv3d = Math.min(0.22 * chordLen, (params.curvFactor || 0.12) * chordLen);
      // Tiny deterministic wiggle to keep boats visually aligned with SVG shape
      const tmid = 0.5;
      const windowFn = (t: number) => Math.sin(Math.PI * t) ** 2;
      const wiggle = (params.sign as number) * Math.min(curv3d * 0.35, (params.wiggleAmpFactor || 0.02) * chordLen) * windowFn(tmid) * Math.sin(Math.PI * (params.wiggleFreq || 1) * tmid + (params.phase || 0));
      const lateralOffset = (params.sign as number) * (0.5 * curv3d) + 0.2 * wiggle;
      const biasedMid = baseMid.clone().add(lateral.multiplyScalar(lateralOffset));
      const curve = new THREE.CatmullRomCurve3([startPos, biasedMid, endPos]);
      const boatMaterial = new THREE.MeshPhongMaterial({ map: paperTexture ?? undefined, color: 0xffffff, shininess: 5, specular: 0x111111 });
      const boatMesh = new THREE.Mesh(paperBoatGeometry, boatMaterial);
      boatMesh.scale.set(6, 6, 6);
      const boatId = Date.now() + Math.random();
      boatsRef.current.push({ id: boatId, mesh: boatMesh, curve, startTime: performance.now(), duration: 15000 });
      scene.add(boatMesh);
    });
  };

  // Animate boats
  useEffect(() => {
    let raf = 0;
    const animate = () => {
      const now = performance.now();
      boatsRef.current.forEach((boat) => {
        const progress = ((now - boat.startTime) / boat.duration) % 1.0;
        const pos = boat.curve.getPointAt(progress);
        boat.mesh.position.copy(pos);
        const tangent = boat.curve.getTangentAt(progress);
        const lookAtPos = pos.clone().add(tangent);
        boat.mesh.up.copy(pos).normalize();
        boat.mesh.lookAt(lookAtPos);
      });
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Heavy: ensure per-edge params, cache anchors, and create <path> nodes once per data change
  const buildPaths = () => {
    try {
      const svg = svgRef.current;
      if (!svg) return;
      const seen = new Set<string>();
      for (const a of arcsData) {
        const key = a.key || `${a.startLat},${a.startLng}->${a.endLat},${a.endLng}`;
        seen.add(key);
        anchorsRef.current.set(key, { startLat: a.startLat, startLng: a.startLng, endLat: a.endLat, endLng: a.endLng });
        getOrCreateEdgeParams(key); // ensure cached params exist
        if (!pathMapRef.current.get(key)) {
          const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          pathEl.setAttribute('fill', 'none');
          pathEl.setAttribute('vector-effect', 'non-scaling-stroke');
          pathEl.setAttribute('stroke-linecap', 'round');
          pathEl.setAttribute('stroke-linejoin', 'round');
          const prefersReduced = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
          if (!prefersReduced) pathEl.style.animation = 'riverFlow 6000ms linear infinite';
          svg.appendChild(pathEl);
          pathMapRef.current.set(key, pathEl);
        }
      }
      // Remove paths for edges that no longer exist
      pathMapRef.current.forEach((el, key) => { if (!seen.has(key)) { el.remove(); pathMapRef.current.delete(key); anchorsRef.current.delete(key); } });
    } catch {}
  };

  // Light: reproject cached anchors to screen space and update existing <path> d/opacity only
  const projectPaths = () => {
    try {
      const wrap = wrapRef.current;
      const globe = globeEl.current;
      if (!wrap || !globe) return;
      const rect = wrap.getBoundingClientRect();
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);
      prevSizeRef.current = { w: width, h: height };
      const camera = globe.camera();
      const camDir = camera.position.clone().normalize();
      const project = (lat: number, lng: number): { x: number; y: number; front: boolean; dot: number } | null => {
        const c = globe.getCoords(lat, lng);
        if (!c) return null;
        const v = new THREE.Vector3(c.x, c.y, c.z);
        const dcam = v.clone().normalize().dot(camDir);
        const front = dcam > 0;
        v.project(camera);
        const x = (v.x * 0.5 + 0.5) * width;
        const y = (-v.y * 0.5 + 0.5) * height;
        return { x, y, front, dot: Math.max(0, Math.min(1, dcam)) };
      };
      const windowFn = (t: number) => Math.sin(Math.PI * t) ** 2;
      const smoothFn = (t: number, freq: number, phase: number) => Math.sin(Math.PI * freq * t + phase);
      anchorsRef.current.forEach((anch, key) => {
        const s = project(anch.startLat, anch.startLng);
        const e = project(anch.endLat, anch.endLng);
        const pathEl = pathMapRef.current.get(key) || null;
        if (!pathEl || !s || !e) return;
        const dx = e.x - s.x, dy = e.y - s.y, len = Math.hypot(dx, dy);
        if (len < 2) { pathEl.setAttribute('opacity', '0'); return; }
        const px = -dy / len, py = dx / len;
        const params = getOrCreateEdgeParams(key);
        const curvPx = Math.min(0.22 * len, params.curvFactor * len);
        const side = params.sign;
        const c1x = s.x + 0.33 * dx + side * px * (0.65 * curvPx);
        const c1y = s.y + 0.33 * dy + side * py * (0.65 * curvPx);
        const c2x = s.x + 0.66 * dx + side * px * (0.35 * curvPx);
        const c2y = s.y + 0.66 * dy + side * py * (0.35 * curvPx);
        const maxLat = 0.22 * len;
        const baseLatApprox = curvPx * 0.85;
        let wiggleAmpPx = Math.min(curvPx * 0.35, params.wiggleAmpFactor * len);
        wiggleAmpPx = Math.max(0, Math.min(wiggleAmpPx, Math.max(0, maxLat - baseLatApprox)));
        const N = 28;
        let d = `M ${s.x.toFixed(1)},${s.y.toFixed(1)}`;
        for (let i = 1; i <= N; i++) {
          const t = i / N, u = 1 - t, tt = t * t, uu = u * u, uuu = uu * u, ttt = tt * t;
          const bx = uuu * s.x + 3 * uu * t * c1x + 3 * u * tt * c2x + ttt * e.x;
          const by = uuu * s.y + 3 * uu * t * c1y + 3 * u * tt * c2y + ttt * e.y;
          const wiggle = side * wiggleAmpPx * windowFn(t) * smoothFn(t, params.wiggleFreq, params.phase);
          const wx = bx + px * wiggle, wy = by + py * wiggle;
          d += ` L ${wx.toFixed(1)},${wy.toFixed(1)}`;
        }
        const rEdge = (params.phase / (Math.PI * 2)) % 1;
        const w = 0.9 + 0.7 * rEdge;
        const dash = 6 + (params.curvFactor - 0.10) / (0.22 - 0.10) * 6;
        const facing = Math.min(s.dot, e.dot);
        const opacity = 0.10 + (0.40 - 0.10) * facing;
        const hue = 200 + (rEdge - 0.5) * 10; // subtle variance
        pathEl.setAttribute('d', d);
        pathEl.setAttribute('stroke', `hsl(${hue}, 90%, 66%)`);
        pathEl.setAttribute('stroke-width', String(w));
        pathEl.setAttribute('stroke-dasharray', `${Math.round(dash)} ${Math.round(dash + 6)}`);
        pathEl.setAttribute('opacity', opacity.toFixed(3));
      });
    } catch {}
  };

  const onGlobeReady = () => {
    if (!globeEl.current) return;
    sceneRef.current = globeEl.current.scene();
    const controls = globeEl.current.controls();
    const camera = globeEl.current.camera();

    const ZOOM_LOD_THRESHOLD = 220;
    const handleZoom = () => {
      const distance = camera.position.length();
      if (distance < ZOOM_LOD_THRESHOLD && countriesLODRef.current.high.features.length > 0) setCurrentLOD("high");
      else setCurrentLOD("low");
    };
    controls.addEventListener("change", handleZoom);

    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.25;
    controls.enableZoom = true;
    // Enforce minimum zoom = 1× (no zooming out beyond the baseline distance)
    const baselineDistance = camera.position.length();
    baselineDistanceRef.current = baselineDistance;
    controls.maxDistance = baselineDistance; // prevent zooming out smaller than baseline
    controls.minDistance = Math.max(120, baselineDistance * 0.6); // allow zooming in, but not excessively
    if (camera.position.length() > baselineDistance) {
      camera.position.setLength(baselineDistance);
    }
    const canvasEl = globeEl.current.renderer().domElement as HTMLCanvasElement;
    (canvasEl.style as CSSStyleDeclaration).touchAction = "none";
    try {
      canvasEl.setAttribute("aria-hidden", "true");
      canvasEl.setAttribute("role", "presentation");
      canvasEl.setAttribute("tabindex", "-1");
    } catch {}

    // Ambient light
    const scene = globeEl.current.scene();
    scene.add(new THREE.AmbientLight(0xffffff, 0.7));

    // Stars (gated count on mobile)
    const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
    const starCount = isMobile ? 3000 : 10000;
    const starGeometry = new THREE.BufferGeometry();
    const verts: number[] = [];
    const starRadius = 1500;
    for (let i = 0; i < starCount; i++) {
      const u = Math.random();
      const v = Math.random();
      const theta = 2 * Math.PI * u;
      const phi = Math.acos(2 * v - 1);
      const x = starRadius * Math.sin(phi) * Math.cos(theta);
      const y = starRadius * Math.sin(phi) * Math.sin(theta);
      const z = starRadius * Math.cos(phi);
      verts.push(x, y, z);
    }
    starGeometry.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    const starMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 0.7, transparent: true, opacity: 0.8 });
    const stars = new THREE.Points(starGeometry, starMaterial);
    scene.add(stars);

    handleZoom();
    ensureBoatsForArcs();

    const computePaths = () => {
      try {
        if (!wrapRef.current || !globeEl.current) return;
        const rect = wrapRef.current.getBoundingClientRect();
        const width = Math.max(1, rect.width);
        const height = Math.max(1, rect.height);
        prevSizeRef.current = { w: width, h: height };
        const camDir = camera.position.clone().normalize();
        const project = (lat: number, lng: number): { x: number; y: number; front: boolean; dot: number } | null => {
          const c = globeEl.current.getCoords(lat, lng);
          if (!c) return null;
          const v = new THREE.Vector3(c.x, c.y, c.z);
          const dcam = v.clone().normalize().dot(camDir);
          const front = dcam > 0; // front-facing check
          v.project(camera);
          const x = (v.x * 0.5 + 0.5) * width;
          const y = (-v.y * 0.5 + 0.5) * height;
          return { x, y, front, dot: Math.max(0, Math.min(1, dcam)) };
        };
        const bezierPoint = (t: number, p0: {x:number;y:number}, p1: {x:number;y:number}, p2: {x:number;y:number}, p3: {x:number;y:number}) => {
          const u = 1 - t;
          const tt = t * t, uu = u * u;
          const uuu = uu * u, ttt = tt * t;
          const x = uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x;
          const y = uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y;
          return { x, y };
        };
        const windowFn = (t: number) => Math.sin(Math.PI * t) ** 2; // zero at ends, peak mid
        const smoothFn = (t: number, freq: number, phase: number) => {
          // deterministic low-frequency sine per spec
          return Math.sin(Math.PI * freq * t + phase);
        };
        const seen = new Set<string>();
        for (const a of arcsData) {
          const s = project(a.startLat, a.startLng);
          const e = project(a.endLat, a.endLng);
          if (!s || !e) continue;
          // No early skip; let opacity easing fade back-facing edges to 0
          const dx = e.x - s.x;
          const dy = e.y - s.y;
          const len = Math.hypot(dx, dy);
          if (len < 2) continue;
          const ux = dx / len;
          const uy = dy / len;
          // Perpendicular to chord (unit)
          const px = -uy;
          const py = ux;
          const params = a.key ? getOrCreateEdgeParams(a.key) : { sign: 1 as -1 | 1, curvFactor: 0.12, wiggleAmpFactor: 0.02, wiggleFreq: 1, phase: 0, curvatureT: 0.5, lateralJitter: 0, altitudeJitter: 0 };
          // Curvature magnitude in pixels, clamped ≤ 0.22*len
          const curvMax = 0.22 * len;
          const curvPx = Math.min(curvMax, params.curvFactor * len);
          const side = params.sign;
          // Control points along chord with lateral offset on the same side
          const c1x = s.x + 0.33 * dx + side * px * (0.65 * curvPx);
          const c1y = s.y + 0.33 * dy + side * py * (0.65 * curvPx);
          const c2x = s.x + 0.66 * dx + side * px * (0.35 * curvPx);
          const c2y = s.y + 0.66 * dy + side * py * (0.35 * curvPx);
          // Wiggle amplitude much smaller than curvature, and clamp so total lateral <= 0.22*len
          const maxLat = 0.22 * len;
          const baseLatApprox = curvPx * 0.85; // conservative upper bound of bezier lateral
          let wiggleAmpPx = Math.min(curvPx * 0.35, params.wiggleAmpFactor * len);
          wiggleAmpPx = Math.max(0, Math.min(wiggleAmpPx, Math.max(0, maxLat - baseLatApprox)));
          // Sample points along base Bezier and add lateral offset along chord-perpendicular
          const N = 28;
          let d = `M ${s.x.toFixed(1)},${s.y.toFixed(1)}`;
          for (let i = 1; i <= N; i++) {
            const t = i / N;
            const base = bezierPoint(t, s, {x:c1x,y:c1y}, {x:c2x,y:c2y}, e);
            const wiggle = params.sign * wiggleAmpPx * windowFn(t) * smoothFn(t, params.wiggleFreq, params.phase);
            const wx = base.x + px * wiggle;
            const wy = base.y + py * wiggle;
            d += ` L ${wx.toFixed(1)},${wy.toFixed(1)}`;
          }
          // Seeded stroke width variance and dash size
          const rEdge = (params.phase / (Math.PI * 2)) % 1;
          const w = 0.9 + 0.7 * rEdge; // ~0.9..1.6
          const dash = 6 + (params.curvFactor - 0.10) / (0.22 - 0.10) * 6; // ~6..12
          // Fade-out easing: use dot with midpoint world vector for smooth horizon fade
          let opacity = 0;
          try {
            const sc = globeEl.current?.getCoords(a.startLat, a.startLng);
            const ec = globeEl.current?.getCoords(a.endLat, a.endLng);
            if (sc && ec) {
              const sv = new THREE.Vector3(sc.x, sc.y, sc.z).normalize();
              const ev = new THREE.Vector3(ec.x, ec.y, ec.z).normalize();
              const mid = sv.add(ev).normalize();
              const f = Math.max(0, mid.dot(camera.position.clone().normalize()));
              opacity = Math.pow(f, 2.5) * 0.45; // maxOpacity ~0.45 for better brightness
            }
          } catch { opacity = 0; }
          const key = a.key || `${a.startLat},${a.startLng}->${a.endLat},${a.endLng}`;
          seen.add(key);
          let pathEl = pathMapRef.current.get(key) || null;
          if (!pathEl && svgRef.current) {
            pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            pathEl.setAttribute('fill', 'none');
            // Tiny per-edge hue variance within cyan/blue palette
            const hue = 200 + (rEdge - 0.5) * 10; // ~195..205
            pathEl.setAttribute('stroke', `hsl(${hue}, 90%, 66%)`);
            pathEl.setAttribute('vector-effect', 'non-scaling-stroke');
            pathEl.setAttribute('stroke-linecap', 'round');
            pathEl.setAttribute('stroke-linejoin', 'round');
            const prefersReduced = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            if (!prefersReduced) pathEl.style.animation = 'riverFlow 6000ms linear infinite';
            svgRef.current.appendChild(pathEl);
            pathMapRef.current.set(key, pathEl);
          }
          if (pathEl) {
            pathEl.setAttribute('d', d);
            pathEl.setAttribute('stroke-width', String(w));
            pathEl.setAttribute('stroke-dasharray', `${Math.round(dash)} ${Math.round(dash + 6)}`);
            pathEl.setAttribute('opacity', opacity.toFixed(3));
          }
        }
        // Hide/remove only edges that no longer exist in data
        pathMapRef.current.forEach((el, key) => { if (!anchorsRef.current.has(key)) { el.remove(); pathMapRef.current.delete(key); } });
      } catch {}
    };
    // Lightweight projector alias for camera changes
    const projectPaths = computePaths;
    projectPathsRef.current = projectPaths;

    controls.addEventListener("change", projectPaths);
    // Also reposition the user glow on camera changes
    const onControlsChange = () => { try { updateUserOverlaysPosition(); } catch {} };
    controls.addEventListener("change", onControlsChange);
    // Recalc visible points at bucket boundaries
    const onControlsBucket = () => { try { recalcVisiblePoints(); } catch {} };
    controls.addEventListener("change", onControlsBucket);
    let resizeTimer: number | null = null;
    const onResize = () => {
      if (resizeTimer) window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        try {
          const rect = wrapRef.current?.getBoundingClientRect();
          const prev = prevSizeRef.current;
          const w = rect ? rect.width : prev.w;
          const h = rect ? rect.height : prev.h;
          const changed = prev.w > 0 && (Math.abs(w - prev.w) / prev.w > 0.10 || Math.abs(h - prev.h) / prev.h > 0.10);
          if (changed) { computePaths(); }
          projectPaths();
          updateUserOverlaysPosition();
        } catch { projectPaths(); }
      }, 150) as unknown as number;
    };
    window.addEventListener("resize", onResize);
    // Recalc points on resize bucket changes as well
    window.addEventListener("resize", () => { try { recalcVisiblePoints(); } catch {} });
    computePaths();
    return () => {
      try { controls.removeEventListener("change", projectPaths); } catch {}
      try { controls.removeEventListener("change", onControlsChange); } catch {}
      try { controls.removeEventListener("change", onControlsBucket); } catch {}
      try { window.removeEventListener("resize", onResize); } catch {}
      if (resizeTimer) window.clearTimeout(resizeTimer);
    };
  };

  // Rebuild boats when arcs change and globe is ready
  useEffect(() => { ensureBoatsForArcs(); }, [arcsData]);

  // When data arrives and globe is ready, draw paths once with the lightweight projector
  useEffect(() => {
    try { projectPathsRef.current?.(); } catch {}
  }, [arcsData]);

  // Hover tooltip using our clamped logic
  const handlePolygonHover = (feature: any | null) => {
    setHoveredCountry(feature);
    if (!wrapRef.current) return;
    if (feature) {
      setTooltip((t) => ({ ...t, content: feature.properties?.name ?? null }));
    } else {
      setTooltip((t) => ({ ...t, content: null }));
    }
  };
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const offset = 12;
    let tipW = 120, tipH = 28;
    if (tooltipRef.current) {
      const bb = tooltipRef.current.getBoundingClientRect();
      tipW = Math.ceil(bb.width || tipW);
      tipH = Math.ceil(bb.height || tipH);
    }
    let x = e.clientX - rect.left + offset;
    let y = e.clientY - rect.top + offset;
    x = Math.min(Math.max(0, x), Math.max(0, rect.width - tipW - 1));
    y = Math.min(Math.max(0, y), Math.max(0, rect.height - tipH - 1));
    setTooltip((t) => ({ ...t, x, y }));
  };

  return (
    <div
      ref={wrapRef}
      className="absolute inset-0 globe-wrap flex items-center justify-center"
      onMouseMove={handleMouseMove}
      role="region"
      aria-label={ariaLabel}
      aria-describedby={describedById}
      tabIndex={tabIndex}
    >
      <ReactGlobe
        ref={globeEl}
        onGlobeReady={onGlobeReady}
        backgroundColor="rgba(0,0,0,0)"
        globeMaterial={globeMaterial}
        atmosphereColor="#66c2ff"
        atmosphereAltitude={0.25}
        arcsData={[]}
        pointsData={visiblePoints.length ? visiblePoints : pointsData}
        pointAltitude={(d: any) => (d?.id && d.id === userRefCodeRef.current ? 0.205 : 0.201)}
        pointRadius={(d: any) => {
          const base = (d?.id && d.id === userRefCodeRef.current ? Math.max(0.18, d.size || 0.15) : (d?.size || 0.15));
          try {
            if (!d?.id) return base;
            const t0 = pointEnterAtRef.current.get(d.id);
            if (!t0) return base;
            const now = performance.now();
            const t = Math.min(1, Math.max(0, (now - t0) / 300));
            const ease = t * (2 - t); // ease-out
            return base * (1.0 + 0.35 * ease);
          } catch { return base; }
        }}
        pointColor={(d: any) => {
          const isUser = d?.id && d.id === userRefCodeRef.current;
          const isConnected = d?.id && connectedIdsRef.current.has(d.id);
          const base = (isUser ? "#2AA7B5" : isConnected ? "#2AA7B5" : (d?.color || "rgba(255,255,255,0.6)"));
          try {
            if (!d?.id) return base;
            const tHide = pointExitAtRef.current.get(d.id);
            if (!tHide) return base;
            const now = performance.now();
            const t = Math.min(1, Math.max(0, (now - tHide) / 200));
            const alpha = 1 - t; // fade out
            if (base.startsWith('#')) return base; // solid color, leave as is
            return base.replace(/rgba\(([^)]+)\)/, (_m: string, inner: string) => {
              const parts = inner.split(',').map(s => s.trim());
              const r = parts[0], g = parts[1], b = parts[2];
              const a = (parts[3] ? parseFloat(parts[3]) : 1) * alpha;
              return `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`;
            });
          } catch { return base; }
        }}
        pointsMerge={true}
        pointsTransitionDuration={pointsTransitionMs}
        polygonsData={polygonsData}
        polygonCapColor={(feat: any) => {
          const isHovered = hoveredCountry && feat.properties.name === hoveredCountry.properties.name;
          if (feat.properties.layer === "bottom") return "#7C4A33";
          return isHovered ? "#B56B45" : "#DCA87E";
        }}
        polygonSideColor={(feat: any) => (feat.properties.layer === "bottom" ? "transparent" : "#7C4A33")}
        polygonStrokeColor={() => "transparent"}
        polygonAltitude={(feat: any) => {
          if (feat.properties.layer === "bottom") return 0.001;
          const isHovered = hoveredCountry && feat.properties.name === hoveredCountry.properties.name;
          return isHovered ? 0.06 : 0.04;
        }}
        polygonsTransitionDuration={300}
        onPolygonHover={handlePolygonHover}
        onPointClick={(pt: any) => {
          try {
            if (pt?.id && pt.id === userRefCodeRef.current) {
              setUserBadgeOpen((v) => !v);
              requestAnimationFrame(() => updateUserOverlaysPosition());
            }
          } catch {}
        }}
      />
      {/* 2D overlay for organic rivers in screen space (paths are created once and updated) */}
      <svg ref={svgRef} className="absolute inset-0 pointer-events-none" aria-hidden="true" />
      {/* Per-point initials under each visible node */}
      {pointLabelOverlays.map(l => {
        const fullName = allPointsByIdRef.current.get(l.id)?.name || '';
        const initials = l.text;
        const show = hoveredPointId === l.id && fullName ? fullName : initials;
        return (
          <div
            key={`lbl-${l.id}`}
            className="absolute text-[10px] leading-none px-1 rounded-sm"
            style={{ left: l.x, top: l.y, transform: 'translate(-50%, 0)', zIndex: 32, color: 'var(--ink)', background: hoveredPointId === l.id ? 'rgba(250,250,250,0.8)' : 'transparent' }}
            onMouseEnter={() => setHoveredPointId(l.id)}
            onMouseLeave={() => setHoveredPointId(null)}
          >
            {show}
          </div>
        );
      })}
      {/* Logged-in user glow marker (subtle, topmost) */}
      <div
        ref={userGlowRef}
        className="absolute pointer-events-none"
        style={{ width: 32, height: 32, borderRadius: "50%", boxShadow: "0 0 18px 8px rgba(42,167,181,0.35)", opacity: 0, transform: "translate(-50%, -50%)", zIndex: 60, display: "block" }}
        aria-hidden="true"
      />
      {/* Screen-reader and keyboard hotspot for the user's node */}
      <button
        ref={userHotspotRef}
        type="button"
        className="absolute"
        style={{ width: 44, height: 44, transform: "translate(-50%, -50%)", opacity: 0, zIndex: 61, pointerEvents: "none" }}
        aria-label={`Your marker${userMeRef.current?.country_name ? ` — ${userMeRef.current?.country_name}` : ''}${typeof userMeRef.current?.boats_total === 'number' ? `, ${userMeRef.current?.boats_total} boats` : ''}`}
        onClick={(e) => { e.preventDefault(); setUserBadgeOpen(true); requestAnimationFrame(() => { try { userBadgeHeadingRef.current?.focus(); } catch {} updateUserOverlaysPosition(); }); }}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setUserBadgeOpen(true); requestAnimationFrame(() => { try { userBadgeHeadingRef.current?.focus(); } catch {} updateUserOverlaysPosition(); }); } if (e.key === 'Escape') { e.preventDefault(); setUserBadgeOpen(false); requestAnimationFrame(() => { try { (e.currentTarget as HTMLButtonElement).focus(); } catch {} updateUserOverlaysPosition(); }); } }}
        aria-hidden="true"
      />
      {/* Logged-in user badge (click target) */}
      {userBadgeOpen && (
        <div
          ref={userBadgeRef}
          className="absolute z-60"
          style={{ transform: "translate(-50%, -100%)", opacity: 0 }}
          role="dialog"
          aria-labelledby="sr-user-badge-title"
          aria-describedby="sr-user-badge-desc"
        >
          <div className="rounded-full px-3 py-2 shadow-md backdrop-blur-sm" style={{ background: 'rgba(210, 245, 250, 0.9)', border: '1px solid rgba(255,255,255,0.5)' }}>
            <div className="flex items-center gap-2">
              <span className="inline-block w-3.5 h-3.5 rounded-sm" style={{ background: userMeRef.current?.boat_color || '#2AA7B5' }} aria-hidden="true" />
              <h3 id="sr-user-badge-title" ref={userBadgeHeadingRef} tabIndex={-1} className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{userMeRef.current?.name || 'You'}</h3>
              <span className="text-xs" style={{ color: 'var(--ink-2)' }}>•</span>
              <span id="sr-user-badge-desc" className="text-xs" style={{ color: 'var(--ink-2)' }}>{(userMeRef.current?.boats_total ?? 0)} boats</span>
              <button type="button" className="ml-2 text-xs underline" onClick={(e) => { e.preventDefault(); setUserBadgeOpen(false); requestAnimationFrame(() => { try { userHotspotRef.current?.focus(); } catch {} updateUserOverlaysPosition(); }); }} aria-label="Close profile">Close</button>
            </div>
          </div>
        </div>
      )}
      {/* Overflow +K badges */}
      {Array.from(overflowBadgesRef.current.entries()).map(([cc, b]) => (
        <div key={cc} className="absolute" style={{ left: b.x, top: b.y, transform: 'translate(-50%, -50%)', zIndex: 45 }} aria-hidden="true">
          <div className="rounded-full px-2 py-0.5 text-xs shadow-md backdrop-blur-sm transition-opacity duration-300" style={{ background: 'rgba(210,245,250,0.9)', border: '1px solid rgba(255,255,255,0.6)', color: 'var(--ink)', opacity: 0.95 }}>
            {b.label}
          </div>
        </div>
      ))}
      {/* Cluster people count for countries (same as +K, show total) */}
      {Array.from(overflowBadgesRef.current.entries()).map(([cc, b]) => (
        <div key={`cpc-${cc}`} className="absolute text-[10px]" style={{ left: b.x, top: b.y + 14, transform: 'translate(-50%, 0)', zIndex: 43, color: 'var(--ink-2)' }} aria-hidden="true">
          {b.label.replace('+', '')} people
        </div>
      ))}
      {/* Near-full labels */}
      {Array.from(nearFullBadgesRef.current.entries()).map(([cc, b]) => (
        <div key={`nf-${cc}`} className="absolute" style={{ left: b.x, top: b.y, transform: 'translate(-50%, -50%)', zIndex: 44 }} aria-hidden="true">
          <div className="rounded-full px-2 py-0.5 text-xs shadow-sm backdrop-blur-sm transition-opacity duration-300" style={{ background: 'rgba(210,245,250,0.75)', border: '1px solid rgba(255,255,255,0.5)', color: 'var(--ink)' }}>
            {b.label}
          </div>
        </div>
      ))}
      <div className="sr-only" aria-live="polite">{srAnnounce}</div>
      <style jsx>{`
        @keyframes riverFlow { from { stroke-dashoffset: 0; } to { stroke-dashoffset: 120; } }
        @media (prefers-reduced-motion: reduce) { svg path { animation: none !important; } }
        /* Center the internal WebGL canvas within the globe container */
        :global(.globe-wrap canvas) { display: block; margin-left: auto; margin-right: auto; }
      `}</style>
      {tooltip.content && (
        <div ref={tooltipRef} className="absolute bg-white/80 backdrop-blur-sm px-2 py-1 rounded-md shadow-lg pointer-events-none" style={{ top: `${tooltip.y}px`, left: `${tooltip.x}px`, zIndex: 30 }}>
          <p className="font-mono text-sm text-gray-800">{tooltip.content}</p>
        </div>
      )}
    </div>
  );
}
// --- Seeded randomness helpers ---
function mulberry32(a: number) {
  return function() {
    let t = (a += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashString(s: string): number {
  let h = 2166136261 >>> 0; // FNV-1a base
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function clamp01(x: number): number { return Math.min(1, Math.max(0, x)); }

// --- Helpers ---
function updateUserGlowPosition(this: any) {
  try {
    const self = (this as unknown) as void; // avoid TS this binding confusion
  } catch {}
}


