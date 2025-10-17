"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactGlobe from "react-globe.gl";
import * as THREE from "three";
import * as topojson from "topojson-client";
// Relax typing for newer 'paths*' props that may not exist in installed types
const RG: any = ReactGlobe as unknown as any;
// import { geoCentroid } from "d3-geo";
import { fetchGlobeData } from "@/lib/globeData";
import { countryCodeToLatLng } from "@/app/data/countryCentroids";
import { getSupabase } from "@/lib/supabaseClient";
import { getCountryNameFromCode, resolveIso2 } from "@/lib/countryMap";

type ArcData = { startLat: number; startLng: number; endLat: number; endLng: number; key?: string };
type ArcDataRich = ArcData & { startCc?: string; endCc?: string; aggregatedCount?: number };
type PointData = { lat: number; lng: number; size: number; color: string; id?: string; countryCode?: string; name?: string; kind?: 'self' | 'friend' | 'other' | 'aggregate'; aggregateCount?: number };
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
  starsDesktopCount?: number;
  starsMobileCount?: number;
};

export default function GlobeRG({ describedById = "globe-sr-summary", ariaLabel = "Interactive globe showing Dream River connections", tabIndex = 0, starsDesktopCount = 6000, starsMobileCount = 2000 }: GlobeRGProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const globeEl = useRef<any>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  // Single active boat that rides cached path points from built-in paths
  const activeBoatRef = useRef<{
    key: string;
    mesh: THREE.Mesh;
    points: THREE.Vector3[];
    startTime: number;
    duration: number;
  } | null>(null);
  const persistKeyRef = useRef<string | null>(null);
  const pathShownRef = useRef<Set<string>>(new Set());
  const path3DCacheRef = useRef<Map<string, THREE.Vector3[]>>(new Map());
  const PATH_CACHE_MAX = 512;
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
  const [arcsData, setArcsData] = useState<ArcDataRich[]>([]);
  const [pointsData, setPointsData] = useState<PointData[]>([]);
  const [visiblePoints, setVisiblePoints] = useState<PointData[]>([]);
  const [hoveredCountry, setHoveredCountry] = useState<any | null>(null);
  const [globeReady, setGlobeReady] = useState<boolean>(false);
  const nodesRef = useRef<{ id: string; lat: number; lng: number }[]>([]);
  const linksRef = useRef<{ source: string; target: string }[]>([]);
  const userRefCodeRef = useRef<string | null>(null);
  const userLatLngRef = useRef<{ lat: number; lng: number } | null>(null);
  const userGlowRef = useRef<HTMLDivElement | null>(null);
  const userBadgeRef = useRef<HTMLDivElement | null>(null);
  const [userBadgeOpen, setUserBadgeOpen] = useState<boolean>(false);
  const userMeRef = useRef<{ name?: string | null; boats_total?: number | null; boat_color?: string | null; country_name?: string | null } | null>(null);
  const userHotspotRef = useRef<HTMLButtonElement | null>(null);
  const userBadgeHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const userNameRef = useRef<HTMLDivElement | null>(null);
  const [userFirstName, setUserFirstName] = useState<string>("");
  const [srAnnounce, setSrAnnounce] = useState<string>("");

  const [tooltip, setTooltip] = useState<{ content: string | null; x: number; y: number }>({ content: null, x: 0, y: 0 });
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const hasInteractedRef = useRef<boolean>(false);
  // Removed SVG overlay/state: lines will use Globe's built-in arcs
  // Resolve CSS variable once for soft white (fallback to #ffffff for Three.js parsing)
  const whiteSoft = useMemo(() => getCssVar('--white-soft', '#ffffff'), []);
  const [hoveredPointId, setHoveredPointId] = useState<string | null>(null);
  const autoRotateTimerRef = useRef<number | null>(null);
  const autoRotatePrevRef = useRef<boolean>(true);
  const hoverRaiseTimerRef = useRef<number | null>(null);

  // Unified country raise: highlight and pause auto-rotate briefly
  const raiseCountryByName = (name: string) => {
    try {
      setHoveredCountry({ properties: { name } });
      setTooltip((t) => ({ ...t, content: `${name}` }));
      const globe = globeEl.current;
      if (globe) {
        const controls = globe.controls();
        autoRotatePrevRef.current = !!controls.autoRotate;
        controls.autoRotate = false;
        if (autoRotateTimerRef.current) window.clearTimeout(autoRotateTimerRef.current);
        autoRotateTimerRef.current = window.setTimeout(() => {
          try { controls.autoRotate = autoRotatePrevRef.current; } catch {}
        }, 1800) as unknown as number;
      }
    } catch {}
  };

  useEffect(() => { countriesLODRef.current = countriesLOD; }, [countriesLOD]);

  // Capacity & overflow (+K) state
  const baselineDistanceRef = useRef<number>(0);
  const zoomBucketRef = useRef<string>("");
  const countryCapacityRef = useRef<Map<string, number>>(new Map());
  const overflowBadgesRef = useRef<Map<string, { x: number; y: number; k: number; label: string }>>(new Map());
  const nearFullBadgesRef = useRef<Map<string, { x: number; y: number; label: string }>>(new Map());
  const clusterPeopleLabelsRef = useRef<Map<string, { x: number; y: number; label: string }>>(new Map());
  const expandedCountriesRef = useRef<Set<string>>(new Set());
  const isIndividualBucketRef = useRef<boolean>(false);
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
        // Respect expanded country toggle (aggregate expansion)
        if (expandedCountriesRef.current.has(cc)) cap = Math.floor(cap * 2.5);
        // FRIEND-FIRST CLUSTERING
        const friends = rest.filter(p => p.id && connectedIdsRef.current.has(p.id)).map(p => ({ ...p, kind: 'friend' as const }));
        const othersBase = rest.filter(p => !p.id || !connectedIdsRef.current.has(p.id)).map(p => ({ ...p, kind: 'other' as const }));
        // Deterministic seed sort for others (stable across sessions)
        const others = othersBase.sort((a, b) => {
          const ha = a.id ? hashString(a.id) : 0;
          const hb = b.id ? hashString(b.id) : 0;
          return ha - hb;
        });
        const allowed = Math.max(0, cap - (mine ? 1 : 0) - friends.length);
        const sampledOthers = others.slice(0, allowed);
        const shown = [ ...(mine ? [{ ...mine, kind: 'self' as const }] : []), ...friends, ...sampledOthers ];
        shown.forEach(p => nextVisible.push(p));
        // Aggregate reflects ONLY the overspill of others
        const totalOthers = others.length;
        const overflowOthers = Math.max(0, totalOthers - sampledOthers.length);
        const nearFullThreshold = (isSmallScreen || isTinyCountry) ? 0.75 : 0.8;
        const total = arr.length;
        const nearFull = overflowOthers <= 0 && total > nearFullThreshold * cap && total <= cap;
        if (overflowOthers > 0) {
          // Add aggregate synthetic node at centroid
          const centroid = cc && countryCodeToLatLng[cc] ? { lat: countryCodeToLatLng[cc][0], lng: countryCodeToLatLng[cc][1] } : null;
          if (centroid) nextVisible.push({ id: `__agg__:${cc}`, lat: centroid.lat, lng: centroid.lng, size: 0.22, color: whiteSoft, countryCode: cc, name: undefined as any, kind: 'aggregate', aggregateCount: overflowOthers });
        } else if (nearFull) {
          // No aggregate node; near full badge not needed visually anymore
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

      // GLOBAL CAP: trim only "others", never friends/self
      const GLOBAL_CAP = 1200;
      if (nextVisible.length > GLOBAL_CAP) {
        const selfs = nextVisible.filter(p => p.kind === 'self');
        const friendsOnly = nextVisible.filter(p => p.kind === 'friend');
        const aggregates = nextVisible.filter(p => p.kind === 'aggregate');
        const othersOnly = nextVisible.filter(p => p.kind === 'other');
        const remainingSlots = Math.max(0, GLOBAL_CAP - (selfs.length + friendsOnly.length + aggregates.length));
        const trimmedOthers = othersOnly.slice(0, remainingSlots);
        setVisiblePoints([...selfs, ...friendsOnly, ...aggregates, ...trimmedOthers]);
      } else {
        setVisiblePoints(nextVisible);
      }
      // Update current bucket after applying
      zoomBucketRef.current = bucketLabel;
      isIndividualBucketRef.current = pick >= 2.0; // heuristic: closer zoom
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
      const nameEl = userNameRef.current;
      const pos = userLatLngRef.current;
      if (!wrap || !globe || !pos) { if (glow) glow.style.opacity = '0'; if (badge) badge.style.opacity = '0'; if (hotspot) hotspot.style.opacity = '0'; if (nameEl) nameEl.style.opacity = '0'; return; }
      const rect = wrap.getBoundingClientRect();
      const cam = globe.camera();
      const c = globe.getCoords(pos.lat, pos.lng);
      if (!c) { if (glow) glow.style.opacity = '0'; if (badge) badge.style.opacity = '0'; if (hotspot) hotspot.style.opacity = '0'; if (nameEl) nameEl.style.opacity = '0'; return; }
      const world = new THREE.Vector3(c.x, c.y, c.z);
      const dot = world.clone().normalize().dot(cam.position.clone().normalize());
      if (dot <= 0) { if (glow) glow.style.opacity = '0'; if (badge) badge.style.opacity = '0'; if (hotspot) hotspot.style.opacity = '0'; if (nameEl) nameEl.style.opacity = '0'; return; } // hide when on back side
      const v = world.project(cam);
      const x = (v.x * 0.5 + 0.5) * rect.width;
      const y = (-v.y * 0.5 + 0.5) * rect.height;
      if (glow) { glow.style.left = `${x}px`; glow.style.top = `${y}px`; glow.style.opacity = '1'; }
      if (badge && userBadgeOpen) { badge.style.left = `${x}px`; badge.style.top = `${y - 36}px`; badge.style.opacity = '1'; }
      if (hotspot) { hotspot.style.left = `${x}px`; hotspot.style.top = `${y}px`; hotspot.style.opacity = '0.001'; hotspot.style.pointerEvents = 'auto'; hotspot.tabIndex = 0; hotspot.setAttribute('aria-hidden', 'false'); }
      if (nameEl) { nameEl.style.left = `${x}px`; nameEl.style.top = `${y + 12}px`; nameEl.style.opacity = userFirstName ? '1' : '0'; }
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
      const pts: PointData[] = nodes.map(n => ({ id: n.id, name: n.name, lat: n.lat, lng: n.lng, size: 0.15, color: whiteSoft, countryCode: n.countryCode }));
      setPointsData(pts);
      setVisiblePoints(pts);
      try { const map = new Map<string, PointData>(); pts.forEach(p => { if (p.id) map.set(p.id, p); }); allPointsByIdRef.current = map; } catch {}
      nodesRef.current = nodes.map(n => ({ id: n.id, lat: n.lat, lng: n.lng }));
      linksRef.current = links.map(l => ({ source: l.source, target: l.target }));
      const arcs: ArcDataRich[] = [];
      links.forEach(l => {
        const a = nodes.find(n => n.id === l.source);
        const b = nodes.find(n => n.id === l.target);
        if (a && b) {
          const key = `${l.source}\u2192${l.target}`; // use arrow separator to avoid ambiguity
          // Ensure params are created once per edge and reused later
          try { getOrCreateEdgeParams(key); } catch {}
          arcs.push({ startLat: a.lat, startLng: a.lng, endLat: b.lat, endLng: b.lng, key, startCc: a.countryCode, endCc: b.countryCode });
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
        try { const full = (userMeRef.current?.name || '').trim(); setUserFirstName(full ? full.split(/\s+/)[0] : ''); } catch { setUserFirstName(''); }
        // Resolve user's lat/lng from nodes once data is available
        const n = nodesRef.current.find(x => x.id === userRefCodeRef.current);
        userLatLngRef.current = n ? { lat: n.lat, lng: n.lng } : null;
        // Recompute connections and visible points now that myId is known
        try {
          const adj = new Map<string, Set<string>>();
          linksRef.current.forEach(l => {
            if (!adj.has(l.source)) adj.set(l.source, new Set());
            if (!adj.has(l.target)) adj.set(l.target, new Set());
            adj.get(l.source)!.add(l.target);
            adj.get(l.target)!.add(l.source);
          });
          const myId = userRefCodeRef.current;
          const set = new Set<string>();
          if (myId && adj.has(myId)) { adj.get(myId)!.forEach(id => set.add(id)); }
          connectedIdsRef.current = set;
          recalcVisiblePoints();
        } catch {}
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

  // Compute path altitude and styling once, used by globe and boat (single source of truth)
  const getPathAltitude = (d: ArcDataRich): number => {
    const ang = greatCircleAngleRad(d.startLat, d.startLng, d.endLat, d.endLng);
    const t = Math.min(1, Math.max(0, ang / Math.PI));
    const base = 0.06 + 0.18 * easeInOutCubic(t);
    const seed = d.key ? (hashString(d.key) % 1000) / 1000 : 0.5;
    const jitter = (seed - 0.5) * 0.02; // ±0.01
    return Math.max(0.04, base + jitter);
  };
  const getPathStroke = (d: ArcDataRich): number => {
    const base = 1.0;
    const agg = d.aggregatedCount ? Math.min(2.0, Math.log2(d.aggregatedCount + 1)) : 0;
    const seed = d.key ? (hashString(d.key) % 1000) / 1000 : 0.5;
    const jitter = (seed - 0.5) * 0.3;
    return Math.max(0.6, base + agg + jitter);
  };
  const getPathColor = (_d: ArcDataRich): string => 'rgba(42,167,181,0.7)';

  // Build path 3D points (cache by key) matching built-in path geometry
  const GLOBE_RADIUS = 100;
  const getPath3DPoints = (d: ArcDataRich): THREE.Vector3[] => {
    const key = d.key || `${d.startLat},${d.startLng}->${d.endLat},${d.endLng}`;
    const cached = path3DCacheRef.current.get(key);
    if (cached && cached.length) return cached;
    const globe = globeEl.current;
    if (!globe) return [];
    const latLngPts = buildPathPoints(d);
    const alt = getPathAltitude(d);
    const pts: THREE.Vector3[] = [];
    for (const p of latLngPts) {
      const c = globe.getCoords(p.lat, p.lng);
      if (!c) continue;
      const v = new THREE.Vector3(c.x, c.y, c.z).normalize().multiplyScalar(GLOBE_RADIUS * (1 + alt));
      pts.push(v);
    }
    // LRU-ish: if value exists reinsert at end; cap size
    if (path3DCacheRef.current.has(key)) path3DCacheRef.current.delete(key);
    path3DCacheRef.current.set(key, pts);
    if (path3DCacheRef.current.size > PATH_CACHE_MAX) {
      const firstKey = path3DCacheRef.current.keys().next().value as string | undefined;
      if (firstKey) path3DCacheRef.current.delete(firstKey);
    }
    return pts;
  };

  // Create or switch the single active boat to follow a given path
  const ensureActiveBoat = (d: ArcDataRich, persistent: boolean) => {
    const scene = sceneRef.current;
    const globe = globeEl.current;
    if (!scene || !globe) return;
    const key = d.key || `${d.startLat},${d.startLng}->${d.endLat},${d.endLng}`;
    const pts = getPath3DPoints(d);
    if (pts.length < 2) return;
    // Fade/remove existing boat
    if (activeBoatRef.current && activeBoatRef.current.key !== key) {
      try {
        const old = activeBoatRef.current;
        const mat = (old.mesh.material as THREE.Material) as any;
        if (mat) { (mat.transparent = true); mat.opacity = 1; }
        const t0 = performance.now();
        const fade = () => {
          const dt = performance.now() - t0;
          const a = Math.max(0, 1 - dt / 180);
          if (mat) mat.opacity = a;
          if (a <= 0) {
            try { scene.remove(old.mesh); } catch {}
            try { (old.mesh.geometry as THREE.BufferGeometry).dispose(); } catch {}
            try { ((old.mesh.material as any) as THREE.Material & { dispose?: () => void }).dispose?.(); } catch {}
          } else requestAnimationFrame(fade);
        };
        requestAnimationFrame(fade);
      } catch {}
      activeBoatRef.current = null;
    }
    // Create boat if none
    if (!activeBoatRef.current) {
      const boatMaterial = new THREE.MeshPhongMaterial({ map: paperTexture ?? undefined, color: 0xffffff, shininess: 5, specular: 0x111111, transparent: true, opacity: 0 });
      const boatMesh = new THREE.Mesh(paperBoatGeometry, boatMaterial);
      boatMesh.scale.set(6, 6, 6);
      scene.add(boatMesh);
      // Sync duration with path draw-on for first-time paths
      const prefersReduced = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const drawOnMs = prefersReduced ? 0 : 1300;
      const hasShown = pathShownRef.current.has(key);
      const duration = hasShown ? 1250 : drawOnMs || 1250;
      activeBoatRef.current = { key, mesh: boatMesh, points: pts, startTime: performance.now(), duration };
      pathShownRef.current.add(key);
      // Fade in quickly
      const t0 = performance.now();
      const fadeIn = () => {
        const dt = performance.now() - t0;
        const a = Math.min(1, dt / 180);
        (boatMaterial as any).opacity = a;
        if (a < 1) requestAnimationFrame(fadeIn);
      };
      requestAnimationFrame(fadeIn);
    } else {
      // Update to match key and points if same key reused
      activeBoatRef.current.key = key;
      activeBoatRef.current.points = pts;
      activeBoatRef.current.startTime = performance.now();
    }
    if (persistent) persistKeyRef.current = key; else persistKeyRef.current = null;
  };

  // Animate single boat along cached points
  useEffect(() => {
    let raf = 0;
    const step = () => {
      const act = activeBoatRef.current;
      if (act) {
        const { mesh, points, startTime, duration } = act;
        const now = performance.now();
        const t = duration > 0 ? ((now - startTime) / duration) % 1.0 : 1.0;
        const total = points.length;
        const idx = Math.min(total - 2, Math.max(0, Math.floor(t * (total - 1))));
        const f = (t * (total - 1)) - idx;
        const p0 = points[idx];
        const p1 = points[idx + 1];
        const pos = new THREE.Vector3().copy(p0).lerp(p1, f);
        mesh.position.copy(pos);
        const tangent = new THREE.Vector3().copy(p1).sub(p0).normalize();
        const lookAtPos = pos.clone().add(tangent);
        mesh.up.copy(pos).normalize();
        mesh.lookAt(lookAtPos);
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => { if (raf) cancelAnimationFrame(raf); };
  }, []);

  // Removed SVG path builders/projectors; arcs use built-in globe rendering

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

    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.25;
    controls.enableZoom = true;
    // Fit globe at zoom = 1 (no clipping) and center
    const getFitDistance = () => {
      try {
        const fov = (camera.fov || 75) * Math.PI / 180;
        const R = 100;
        const margin = 1.02; // slight padding to avoid edge clipping
        const d = (R * margin) / Math.tan(fov / 2);
        return Math.max(d, R * 1.3);
      } catch { return camera.position.length(); }
    };
    const fitD = getFitDistance();
    controls.target.set(0, 0, 0);
    camera.position.set(0, 0, fitD);
    camera.updateProjectionMatrix();
    baselineDistanceRef.current = fitD;
    controls.maxDistance = fitD;
    controls.minDistance = Math.max(fitD / 3, 80);
    try { controls.addEventListener('start', () => { hasInteractedRef.current = true; }); } catch {}
    const canvasEl = globeEl.current.renderer().domElement as HTMLCanvasElement;
    (canvasEl.style as CSSStyleDeclaration).touchAction = "none";
    try {
      canvasEl.setAttribute("aria-hidden", "true");
      canvasEl.setAttribute("role", "presentation");
      canvasEl.setAttribute("tabindex", "-1");
    } catch {}

    handleZoom();
    // mark ready; listeners are managed by the effect below
    setGlobeReady(true);
  };

  // Scene add-ons and listeners with cleanup (ambient/stars, controls change, resize)
  useEffect(() => {
    const globe = globeEl.current;
    if (!globe || !globeReady) return;
    const scene = globe.scene();
    const controls = globe.controls();
    const camera = globe.camera();
    // Ambient light
    const amb = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(amb);
    // Stars
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    const starCount = isMobile ? starsMobileCount : starsDesktopCount;
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
    starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    const starMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 0.7, transparent: true, opacity: 0.8 });
    const stars = new THREE.Points(starGeometry, starMaterial);
    scene.add(stars);
    // Combined change handler
    const onControlsChange = () => {
      try { recalcVisiblePoints(); } catch {}
      try { updateUserOverlaysPosition(); } try { const dist = camera.position.length(); const threshold = 220; if (countriesLODRef.current) { if (dist < threshold && countriesLODRef.current.high.features.length > 0) setCurrentLOD('high'); else setCurrentLOD('low'); } } catch {}
    };
    controls.addEventListener('change', onControlsChange);
    let resizeTimer: number | null = null;
    const onResize = () => {
      if (resizeTimer) window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => { try { updateUserOverlaysPosition(); recalcVisiblePoints(); } catch {} }, 150) as unknown as number;
    };
    window.addEventListener('resize', onResize);
    return () => {
      try { controls.removeEventListener('change', onControlsChange); } catch {}
      try { window.removeEventListener('resize', onResize); } catch {}
      try { scene.remove(stars); } catch {}
      try { starGeometry.dispose(); } catch {}
      try { (starMaterial as THREE.Material & { dispose?: () => void }).dispose?.(); } catch {}
      try { scene.remove(amb); } catch {}
      if (resizeTimer) window.clearTimeout(resizeTimer);
    };
  }, [globeReady]);

  // Removed multi-boat curve; boat follows built-in paths via ensureActiveBoat on hover/click

  // Removed: projector for SVG paths

  // Hover tooltip using our clamped logic
  const handlePolygonHover = (feature: any | null) => {
    setHoveredCountry(feature);
    if (!wrapRef.current) return;
    if (feature) {
      try {
        const ccName = feature.properties?.name ?? null;
        let listening = 0;
        const countryCounts = new Map<string, number>();
        const list = pointsData || [];
        for (const p of list) {
          const cc = p.countryCode || '';
          countryCounts.set(cc, (countryCounts.get(cc) || 0) + 1);
        }
        // Resolve ISO-2 from the feature name reliably using our country map
        const iso2 = typeof ccName === 'string' ? resolveIso2(ccName) : null;
        if (iso2 && countryCounts.has(iso2)) listening = countryCounts.get(iso2) || 0;
        const content = listening > 0 ? `${ccName}\n${listening} people are listening to Dream River here.` : ccName;
        setTooltip((t) => ({ ...t, content }));
      } catch {
        setTooltip((t) => ({ ...t, content: feature.properties?.name ?? null }));
      }
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

  // --- Arc helpers (great-circle and easing) ---
  function greatCircleAngleRad(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const toRad = (d: number) => (d * Math.PI) / 180;
    const φ1 = toRad(lat1), λ1 = toRad(lon1);
    const φ2 = toRad(lat2), λ2 = toRad(lon2);
    const Δφ = φ2 - φ1;
    const Δλ = λ2 - λ1;
    const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return c;
  }
  function easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function buildPathPoints(d: ArcData): { lat: number; lng: number }[] {
    // Use seeded control to create a gentle S-curve in geodesic space by perturbing midpoint along lateral direction
    const key = d.key || `${d.startLat},${d.startLng}->${d.endLat},${d.endLng}`;
    const params = getOrCreateEdgeParams(key);
    // Lerp a few points along great-circle, then offset midpoint bearing a tiny amount
    const steps = 8;
    const pts: { lat: number; lng: number }[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      // Spherical linear interpolation using vector slerp
      const toRad = (x: number) => (x * Math.PI) / 180;
      const toDeg = (x: number) => (x * 180) / Math.PI;
      const φ1 = toRad(d.startLat), λ1 = toRad(d.startLng);
      const φ2 = toRad(d.endLat), λ2 = toRad(d.endLng);
      const sinφ1 = Math.sin(φ1), cosφ1 = Math.cos(φ1);
      const sinλ1 = Math.sin(λ1), cosλ1 = Math.cos(λ1);
      const sinφ2 = Math.sin(φ2), cosφ2 = Math.cos(φ2);
      const sinλ2 = Math.sin(λ2), cosλ2 = Math.cos(λ2);
      const v1 = new THREE.Vector3(cosφ1 * cosλ1, sinφ1, cosφ1 * sinλ1);
      const v2 = new THREE.Vector3(cosφ2 * cosλ2, sinφ2, cosφ2 * sinλ2);
      const theta = Math.acos(Math.min(1, Math.max(-1, v1.dot(v2))));
      if (theta === 0) { pts.push({ lat: d.startLat, lng: d.startLng }); continue; }
      const sinTheta = Math.sin(theta);
      const a = Math.sin((1 - t) * theta) / sinTheta;
      const b = Math.sin(t * theta) / sinTheta;
      const v = new THREE.Vector3().addScaledVector(v1, a).addScaledVector(v2, b).normalize();
      const lat = Math.asin(v.y);
      const lng = Math.atan2(v.z, v.x);
      pts.push({ lat: toDeg(lat), lng: toDeg(lng) });
    }
    // Apply tiny lateral wiggle around midpoint index
    const midIdx = Math.floor(pts.length / 2);
    const before = pts[Math.max(0, midIdx - 1)];
    const mid = pts[midIdx];
    const after = pts[Math.min(pts.length - 1, midIdx + 1)];
    if (before && mid && after) {
      // Approximate tangent bearing at mid
      const bearing = Math.atan2(
        Math.sin((after.lng - before.lng) * Math.PI / 180) * Math.cos(after.lat * Math.PI / 180),
        Math.cos(before.lat * Math.PI / 180) * Math.sin(after.lat * Math.PI / 180) -
        Math.sin(before.lat * Math.PI / 180) * Math.cos(after.lat * Math.PI / 180) * Math.cos((after.lng - before.lng) * Math.PI / 180)
      );
      const side = params.sign as number;
      const ampDeg = Math.max(0.05, Math.min(0.25, params.wiggleAmpFactor * 10)); // ~0.05..0.25 degrees
      const offsetBearing = bearing + side * Math.PI / 2;
      const dLat = ampDeg * Math.cos(offsetBearing);
      const dLng = ampDeg * Math.sin(offsetBearing) / Math.max(0.5, Math.cos(mid.lat * Math.PI / 180));
      pts[midIdx] = { lat: mid.lat + dLat, lng: mid.lng + dLng };
    }
    return pts;
  }

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
      <RG
        ref={globeEl}
        onGlobeReady={onGlobeReady}
        backgroundColor="rgba(0,0,0,0)"
        globeMaterial={globeMaterial}
        atmosphereColor="#66c2ff"
        atmosphereAltitude={0.25}
        pathsData={useMemo(() => {
          // Build capped & aggregated path edges once per data change
          const MAX = 200;
          const PER_PAIR = 8;
          if (!arcsData || arcsData.length === 0) return [] as any[];
          const byPair = new Map<string, ArcDataRich[]>();
          for (const a of arcsData) {
            const k = `${a.startCc || '??'}->${a.endCc || '??'}`;
            if (!byPair.has(k)) byPair.set(k, []);
            byPair.get(k)!.push(a);
          }
          const groups = Array.from(byPair.entries()).sort((a, b) => b[1].length - a[1].length);
          const out: any[] = [];
          for (const [k, arr] of groups) {
            if (out.length >= MAX) break;
            const keep = arr.slice(0, Math.min(arr.length, PER_PAIR));
            keep.forEach(edge => out.push({ ...edge }));
            if (arr.length > keep.length) {
              const [sCc, eCc] = k.split('->');
              const sCent = sCc && countryCodeToLatLng[sCc] ? countryCodeToLatLng[sCc] : [keep[0].startLat, keep[0].startLng];
              const eCent = eCc && countryCodeToLatLng[eCc] ? countryCodeToLatLng[eCc] : [keep[0].endLat, keep[0].endLng];
              out.push({ startLat: sCent[0], startLng: sCent[1], endLat: eCent[0], endLng: eCent[1], startCc: sCc, endCc: eCc, aggregatedCount: arr.length - keep.length, key: `__agg__:${sCc}->${eCc}` });
            }
            if (out.length >= MAX) break;
          }
          return out.slice(0, MAX);
        }, [arcsData]) as any}
        pathPoints={(d: any) => buildPathPoints(d)}
        pathColor={(d: any) => 'rgba(42,167,181,0.85)'}
        pathStroke={(d: any) => {
          const base = 1.0;
          const agg = d.aggregatedCount ? Math.min(2.0, Math.log2(d.aggregatedCount + 1)) : 0;
          const seed = d.key ? (hashString(d.key) % 1000) / 1000 : 0.5;
          const jitter = (seed - 0.5) * 0.3;
          return Math.max(0.6, base + agg + jitter);
        }}
        pathAltitude={(d: any) => getPathAltitude(d)}
        pathDashLength={(() => { try { return (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) ? 1 : 0.95; } catch { return 0.95; } })()}
        pathDashGap={(() => { try { return (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) ? 0 : 1.1; } catch { return 1.1; } })()}
        pathDashAnimateTime={(() => { try { return (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) ? 0 : 1300; } catch { return 0; } })()}
        pathCurveResolution={64}
        pointsData={visiblePoints.length ? visiblePoints : pointsData}
        pointAltitude={(d: any) => (d?.kind === 'aggregate' ? 0.203 : (d?.id && d.id === userRefCodeRef.current ? 0.205 : 0.201))}
        pointRadius={(d: any) => {
          const isSelf = d?.id && d.id === userRefCodeRef.current;
          const base = isSelf ? Math.max(0.18, d.size || 0.15) : (d?.kind === 'aggregate' ? 0.24 : (d?.size || 0.15));
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
        labelsData={visiblePoints.length ? visiblePoints : pointsData}
        labelText={(d: any) => {
          try {
            const isSelf = d?.id && d.id === userRefCodeRef.current;
            const isFriend = d?.kind === 'friend';
            const isOther = d?.kind === 'other' || (!isSelf && !isFriend && d?.kind !== 'aggregate');
            // show initials for friends when zoomed into individual bucket
            const inIndividual = isIndividualBucketRef.current;
            const initials = (d?.name || '').split(/\s+/).map((s: string) => s[0]).filter(Boolean).slice(0,2).join('').toUpperCase();
            if (isSelf) return '';
            // friends: always on
            if (isFriend) return initials;
            // others: on hover only
            if (isOther && hoveredPointId && hoveredPointId === d?.id) return initials;
            return '';
          } catch { return ''; }
        }}
        labelColor={(d: any) => {
          const isFriend = d?.kind === 'friend';
          return isFriend ? '#135E66' : '#ffffff';
        }}
        labelAltitude={(d: any) => 0.206}
        labelSize={(d: any) => 0.6}
        labelDotOrientation={() => 'bottom'}
        pointColor={(d: any) => {
          const isSelf = d?.id && d.id === userRefCodeRef.current;
          const isFriend = d?.kind === 'friend';
          const isAgg = d?.kind === 'aggregate';
          const baseHex = (isSelf ? "#2AA7B5" : isFriend ? "#135E66" : whiteSoft);
          const toRgba = (hexOrCss: string, a: number) => {
            try {
              // If already rgba(...), just replace alpha
              const m = /^rgba?\(([^)]+)\)$/.exec(hexOrCss);
              if (m) {
                const parts = m[1].split(',').map(s => s.trim());
                const [r, g, b] = parts.map((v, i) => (i < 3 ? parseFloat(v) : v)) as any;
                return `rgba(${r},${g},${b},${a})`;
              }
              // hex #rrggbb or #rgb
              let hx = hexOrCss.replace('#','').trim();
              if (hx.length === 3) {
                hx = hx.split('').map(c => c + c).join('');
              }
              const r = parseInt(hx.substring(0,2), 16);
              const g = parseInt(hx.substring(2,4), 16);
              const b = parseInt(hx.substring(4,6), 16);
              return `rgba(${r},${g},${b},${a})`;
            } catch { return hexOrCss; }
          };
          try {
            if (!d?.id) return baseHex;
            const tHide = pointExitAtRef.current.get(d.id);
            if (!tHide) return baseHex;
            const now = performance.now();
            const t = Math.min(1, Math.max(0, (now - tHide) / 200));
            const alpha = 1 - t; // fade out
            return toRgba(baseHex, alpha);
          } catch { return baseHex; }
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
        onPolygonHover={(feature: any | null) => {
          handlePolygonHover(feature);
          try {
            // Debounced hover-raise after ~1s
            if (hoverRaiseTimerRef.current) window.clearTimeout(hoverRaiseTimerRef.current);
            if (feature && feature.properties?.name) {
              hoverRaiseTimerRef.current = window.setTimeout(() => {
                try {
                  setHoveredCountry(feature);
                  const globe = globeEl.current;
                  if (globe) {
                    const controls = globe.controls();
                    autoRotatePrevRef.current = !!controls.autoRotate;
                    controls.autoRotate = false;
                    if (autoRotateTimerRef.current) window.clearTimeout(autoRotateTimerRef.current);
                    autoRotateTimerRef.current = window.setTimeout(() => {
                      try { controls.autoRotate = autoRotatePrevRef.current; } catch {}
                    }, 1800) as unknown as number;
                  }
                } catch {}
              }, 1000) as unknown as number;
            }
          } catch {}
        }}
        onPolygonClick={(feat: any) => {
          try {
            if (!feat) return;
            setHoveredCountry(feat);
            const globe = globeEl.current;
            if (globe) {
              const controls = globe.controls();
              autoRotatePrevRef.current = !!controls.autoRotate;
              controls.autoRotate = false;
              if (autoRotateTimerRef.current) window.clearTimeout(autoRotateTimerRef.current);
              autoRotateTimerRef.current = window.setTimeout(() => {
                try { controls.autoRotate = autoRotatePrevRef.current; } catch {}
              }, 1800) as unknown as number;
            }
          } catch {}
        }}
        onPointClick={(pt: any) => {
          try {
            if (pt?.id && pt.id === userRefCodeRef.current) {
              setUserBadgeOpen((v) => !v);
              requestAnimationFrame(() => updateUserOverlaysPosition());
              return; // consume; don't raise country
            }
            // For other nodes: raise the country by setting hoveredCountry using countryCode
            const cc = pt?.countryCode;
            if (cc) {
              const name = getCountryNameFromCode(cc) || cc;
              raiseCountryByName(name);
            }
          } catch {}
        }}
        onPathHover={(d: any) => {
          try {
            if (!d) return;
            ensureActiveBoat(d as ArcDataRich, false);
          } catch {}
        }}
        onPathClick={(d: any) => {
          try {
            if (!d) return;
            ensureActiveBoat(d as ArcDataRich, true);
          } catch {}
        }}
        onPointHover={(pt: any) => { try { setHoveredPointId(pt?.id || null); } catch {} }}
      />
      {/* Removed SVG overlay */}
      
      {/* Logged-in user glow marker (subtle, topmost) */}
      <div
        ref={userGlowRef}
        className="absolute pointer-events-none"
        style={{ width: 32, height: 32, borderRadius: "50%", boxShadow: "0 0 18px 8px rgba(42,167,181,0.35)", opacity: 0, transform: "translate(-50%, -50%)", zIndex: 60, display: "block" }}
        aria-hidden="true"
      />
      {/* Logged-in user's first name (always-on text) */}
      {userFirstName && (
        <div
          ref={userNameRef}
          className="absolute pointer-events-none"
          style={{ opacity: 0, transform: "translate(-50%, 0)", zIndex: 61, color: 'var(--ink)', fontSize: 11, fontWeight: 600, textShadow: '0 1px 2px rgba(0,0,0,0.25)' }}
          aria-hidden="true"
        >
          {userFirstName}
        </div>
      )}
      {/* Screen-reader and keyboard hotspot for the user's node */}
      <button
        ref={userHotspotRef}
        type="button"
        className="absolute"
        style={{ width: 44, height: 44, transform: "translate(-50%, -50%)", opacity: 0, zIndex: 61, pointerEvents: "none" }}
        aria-label={`Your marker${userMeRef.current?.country_name ? ` — ${userMeRef.current?.country_name}` : ''}${typeof userMeRef.current?.boats_total === 'number' ? `, ${userMeRef.current?.boats_total} boats` : ''}`}
        onClick={(e) => { e.preventDefault(); setUserBadgeOpen(true); requestAnimationFrame(() => { try { userBadgeHeadingRef.current?.focus(); } catch {} updateUserOverlaysPosition(); }); }}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setUserBadgeOpen(true); requestAnimationFrame(() => { try { userBadgeHeadingRef.current?.focus(); } catch {} updateUserOverlaysPosition(); }); } if (e.key === 'Escape') { e.preventDefault(); setUserBadgeOpen(false); requestAnimationFrame(() => { try { (e.currentTarget as HTMLButtonElement).focus(); } catch {} updateUserOverlaysPosition(); }); } }}
        
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
      {/* Legacy overlay badges removed */}
      <div className="sr-only" aria-live="polite">{srAnnounce}</div>
      <style jsx>{`
        /* Center the internal WebGL canvas within the globe container */
        :global(.globe-wrap canvas) { display: block; margin-left: auto; margin-right: auto; }
      `}</style>
      {tooltip.content && (
        <div ref={tooltipRef} className="absolute bg-white/80 backdrop-blur-sm px-2 py-1 rounded-md shadow-lg pointer-events-none" style={{ top: `${tooltip.y}px`, left: `${tooltip.x}px`, zIndex: 30 }}>
          <p className="font-mono text-sm text-gray-800" style={{ whiteSpace: 'pre-line' }}>{tooltip.content}</p>
        </div>
      )}
    </div>
  );
}
// --- Seeded randomness helpers ---
function getCssVar(name: string, fallback: string): string {
  try {
    if (typeof window === 'undefined') return fallback;
    const val = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return val || fallback;
  } catch { return fallback; }
}
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
// removed dead helper updateUserGlowPosition


