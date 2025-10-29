"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
// Note: when used in Next.js, import via dynamic(() => import(...), { ssr: false })
import ReactGlobe from 'react-globe.gl';
import * as THREE from 'three';
import * as topojson from 'topojson-client';
import { geoCentroid, geoBounds } from 'd3-geo';
// GLB support (instantiate only in onGlobeReady)
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
// GLTFLoader and SkeletonUtils are dynamically imported in onGlobeReady to reduce cold-start cost

interface CountriesData {
    features: any[];
}

interface NodeData {
  id: string;
  lat: number;
  lng: number;
  size: number;
  color: string;
  countryCode?: string;
  name?: string | null;
}

interface ArcData {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  startId: string;
  endId: string;
  primary?: boolean;
}

type GlobeProps = { describedById?: string; ariaLabel?: string; tabIndex?: number };
const Globe: React.FC<GlobeProps> = ({ describedById, ariaLabel, tabIndex }) => {
  const globeEl = useRef<any>(null);
  const baselineDistanceRef = useRef<number>(0);
  const hasInteractedRef = useRef<boolean>(false);
  const [countriesLOD, setCountriesLOD] = useState<{ low: CountriesData, high: CountriesData }>({
    low: { features: [] },
    high: { features: [] }
  });
  const [currentLOD, setCurrentLOD] = useState<'low' | 'high'>('low');
  const [zoomScale, setZoomScale] = useState<number>(1);
  const [hoveredCountry, setHoveredCountry] = useState<any | null>(null);
  const [tooltipContent, setTooltipContent] = useState('');
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const [isTooltipVisible, setIsTooltipVisible] = useState(false);
  const [srSummary, setSrSummary] = useState<string>("");
  const [nodesData, setNodesData] = useState<NodeData[]>([]);
  const [arcsData, setArcsData] = useState<ArcData[]>([]);
  const [overlayNodes, setOverlayNodes] = useState<NodeData[]>([]);

  const countriesLODRef = useRef(countriesLOD);
  useEffect(() => { countriesLODRef.current = countriesLOD; }, [countriesLOD]);

  const sceneRef = useRef<THREE.Scene | null>(null);
  const lowPowerRef = useRef<boolean>(false);
  const overlayRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const myIdRef = useRef<string | null>(null);
  const myFirstNameRef = useRef<string>("");
  const myConnectionsRef = useRef<Set<string>>(new Set());
  const myChainRef = useRef<Set<string>>(new Set());
  const rotateIntervalRef = useRef<number | null>(null);
  const isLoggedInRef = useRef<boolean>(false);
  const countryCentroidsRef = useRef<Map<string, { lat: number; lng: number }>>(new Map());
  const countryBBoxDiagRef = useRef<Map<string, number>>(new Map());
  const containerRef = useRef<HTMLDivElement | null>(null);
  const refitCameraRef = useRef<() => void>(() => {});
  type AutoState = 'autorotate_burst' | 'autorotate_idle' | 'idle' | 'focused_on_user';
  const autoStateRef = useRef<AutoState>('idle');
  const burstTimerRef = useRef<number | null>(null);
  const idleTimerRef = useRef<number | null>(null);
  const controlsRef = useRef<any>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const [isGlobeReady, setIsGlobeReady] = useState(false);
  const [fps, setFps] = useState<number>(0);
  const dprRef = useRef<number>(1);
  const lowFpsAccumMsRef = useRef<number>(0);
  const highFpsAccumMsRef = useRef<number>(0);
  const lastFpsEvalRef = useRef<number>(performance.now());
  const isHiddenRef = useRef<boolean>(false);
  const safeProfileRef = useRef<boolean>(false);
  const lowFpsKillAccumMsRef = useRef<number>(0);
  const devHudEnabledRef = useRef<boolean>(false);
  const hudElRef = useRef<HTMLDivElement | null>(null);
  const frameTimesRef = useRef<number[]>([]);
  const heapBaseRef = useRef<number | null>(null);
  const lastHeapLogRef = useRef<number>(performance.now());
  // GLB template refs
  const boatTemplateRef = useRef<THREE.Object3D | null>(null);
  const boatTemplateMaterialRef = useRef<THREE.Material | null>(null);
  const glbLoadedRef = useRef<boolean>(false);
  const boatsRef = useRef<{ id: number; mesh: THREE.Mesh; curve: THREE.CatmullRomCurve3; startTime: number; duration: number; isPlaceholder?: boolean }[]>([]);
  const boatArcKeysRef = useRef<Set<string>>(new Set());
  const pendingSpawnsRef = useRef<{ curve: THREE.CatmullRomCurve3; arcKey: string }[]>([]);
  const cloneFnRef = useRef<null | ((obj: THREE.Object3D) => THREE.Object3D)>(null);
  const fpsRef = useRef<number>(0);
  useEffect(() => { fpsRef.current = fps; }, [fps]);

  // FPS Counter + Dev HUD metrics
  useEffect(() => {
    let frameId: number = 0;
    let lastTime = performance.now();
    let frameCount = 0;
    // enable HUD via ?hud=1 or ?debug=1
    try {
      const qs = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
      devHudEnabledRef.current = !!(qs && (qs.get('hud') === '1' || qs.get('debug') === '1'));
    } catch {}
    const trackFps = (time: number) => {
      frameCount++;
      frameTimesRef.current.push(time - lastTime);
      if (frameTimesRef.current.length > 600) frameTimesRef.current.splice(0, frameTimesRef.current.length - 600);
      if (time - lastTime >= 1000) { setFps(frameCount); frameCount = 0; lastTime = time; }
      // Dev HUD sampling (once per ~500ms)
      if (devHudEnabledRef.current && hudElRef.current && rendererRef.current) {
        const now = performance.now();
        if (now - lastHeapLogRef.current >= 500) {
          lastHeapLogRef.current = now;
          try {
            // 1% low FPS
            const times = frameTimesRef.current.slice();
            times.sort((a, b) => a - b);
            const idx = Math.max(0, Math.floor(times.length * 0.99) - 1);
            const p99Ms = times[idx] || 0;
            const onePercentLow = p99Ms > 0 ? Math.round(1000 / p99Ms) : 0;
            const info = (rendererRef.current as any)?.info;
            const draws = info?.render?.calls ?? 0;
            const geoms = info?.memory?.geometries ?? 0;
            const textures = info?.memory?.textures ?? 0;
            let heapLine = '';
            const mem: any = (performance as any).memory;
            if (mem && typeof mem.usedJSHeapSize === 'number') {
              if (heapBaseRef.current == null) heapBaseRef.current = mem.usedJSHeapSize;
              const delta = mem.usedJSHeapSize - (heapBaseRef.current || 0);
              heapLine = ` heapΔ ${(delta/1024/1024).toFixed(1)}MB`;
            }
            hudElRef.current.textContent = `${fps} fps | 1% ${onePercentLow} | draws ${draws} | geo ${geoms} | tex ${textures}${heapLine}`;
          } catch {}
        }
      }
      frameId = requestAnimationFrame(trackFps);
    };
    frameId = requestAnimationFrame(trackFps);
    return () => { cancelAnimationFrame(frameId); };
  }, []);

  // Adaptive DPR based on FPS
  useEffect(() => {
    const now = performance.now();
    const dt = Math.max(0, now - (lastFpsEvalRef.current || now));
    lastFpsEvalRef.current = now;
    try {
      const renderer = rendererRef.current;
      if (!renderer) return;
      // Accumulate low/high fps durations
      if (fps > 0 && fps < 40) {
        lowFpsAccumMsRef.current += dt;
        highFpsAccumMsRef.current = Math.max(0, highFpsAccumMsRef.current - dt);
      } else if (fps >= 59) {
        highFpsAccumMsRef.current += dt;
        lowFpsAccumMsRef.current = Math.max(0, lowFpsAccumMsRef.current - dt);
      } else {
        // neutral
        lowFpsAccumMsRef.current = Math.max(0, lowFpsAccumMsRef.current - dt * 0.5);
        highFpsAccumMsRef.current = Math.max(0, highFpsAccumMsRef.current - dt * 0.5);
      }
      // Safe profile kill-switch: fps < 24 for 5s
      if (fps > 0 && fps < 24) {
        lowFpsKillAccumMsRef.current += dt;
      } else {
        lowFpsKillAccumMsRef.current = Math.max(0, lowFpsKillAccumMsRef.current - dt * 0.5);
      }
      if (!safeProfileRef.current && lowFpsKillAccumMsRef.current >= 5000) {
        safeProfileRef.current = true;
        try { renderer.setPixelRatio?.(1.0); dprRef.current = 1.0; } catch {}
        stopRotateInterval();
      }
      // Drop DPR if sustained low fps
      if (lowFpsAccumMsRef.current >= 3000) {
        const target = 1.0;
        if (Math.abs((dprRef.current || 1) - target) > 0.05) {
          dprRef.current = target;
          try { renderer.setPixelRatio?.(target); } catch {}
        }
        lowFpsAccumMsRef.current = 0;
      }
      // Raise DPR carefully if sustained high fps
      if (highFpsAccumMsRef.current >= 10000) {
        const maxDevice = Math.min((typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1), 1.5);
        const target = Math.min(1.5, Math.max(1.0, maxDevice));
        if (target > (dprRef.current || 1) + 0.05) {
          dprRef.current = target;
          try { renderer.setPixelRatio?.(target); } catch {}
        }
        highFpsAccumMsRef.current = 0;
      }
    } catch {}
  }, [fps]);

  // Load Country Polygons with LOD
  useEffect(() => {
    // Low-power heuristic
    try {
      const prefersReduced = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const nav: any = typeof navigator !== 'undefined' ? navigator : {};
      const conn: any = nav.connection || nav.mozConnection || nav.webkitConnection || null;
      const saveData = !!(conn && conn.saveData);
      const eff = (conn && String(conn.effectiveType || '').toLowerCase()) || '';
      const slowNet = eff.includes('2g') || eff.includes('slow');
      const cores = (nav.hardwareConcurrency as number) || 0;
      const mem = (nav.deviceMemory as number) || 0;
      const highDpr = (typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1) > 2.5;
      lowPowerRef.current = prefersReduced || saveData || slowNet || (cores > 0 && cores <= 4) || (mem > 0 && mem <= 4) || (highDpr && cores > 0 && cores <= 4);
    } catch { lowPowerRef.current = false; }
    fetch('//unpkg.com/world-atlas@2/countries-110m.json')
      .then(res => res.json())
      .then((countriesTopo) => { const lowResFeatures = topojson.feature(countriesTopo, countriesTopo.objects.countries); setCountriesLOD(prev => ({ ...prev, low: lowResFeatures as any })); });
    fetch('//unpkg.com/world-atlas@2/countries-50m.json')
      .then(res => res.json())
      .then((countriesTopo) => { const highResFeatures = topojson.feature(countriesTopo, countriesTopo.objects.countries); setCountriesLOD(prev => ({ ...prev, high: highResFeatures as any })); });
  }, []);

  const polygonsData = useMemo(() => {
    const activeCountries = countriesLOD[currentLOD];
    if (!activeCountries?.features?.length) return [];
    const topLayer = activeCountries.features.map(f => ({ ...f, properties: { ...f.properties, layer: 'top' } }));
    const bottomLayer = activeCountries.features.map(f => ({ ...f, properties: { ...f.properties, layer: 'bottom' } }));
    return [...topLayer, ...bottomLayer];
  }, [countriesLOD, currentLOD]);

  useEffect(() => {
    try {
      const low = countriesLOD.low; if (!low?.features?.length) return;
      const map = new Map<string, { lat: number; lng: number }>();
      const bbox = new Map<string, number>();
      for (const f of low.features) {
        const name = f?.properties?.name as string | undefined; if (!name) continue;
        const [lng, lat] = geoCentroid(f); map.set(name, { lat, lng });
        try { const b = geoBounds(f as any); const [[minLng, minLat], [maxLng, maxLat]] = b; const dLat = Math.abs(maxLat - minLat); const dLng = Math.abs(maxLng - minLng); const diagDeg = Math.hypot(dLat, dLng); bbox.set(name, diagDeg); } catch {}
      }
      countryCentroidsRef.current = map; countryBBoxDiagRef.current = bbox;
    } catch {}
  }, [countriesLOD.low]);

  // --- Data Pipeline (preserve API logging and preferences) ---
  const countryCodeToLatLng: Record<string, [number, number]> = {
    US: [39.7837304, -100.445882], CA: [61.0666922, -107.991707], GB: [54.7023545, -3.2765753], IN: [22.3511148, 78.6677428],
    DE: [51.1638175, 10.4478313], FR: [46.603354, 1.8883335], ES: [39.3260685, -4.8379791], IT: [42.6384261, 12.674297],
    BR: [-10.3333333, -53.2], AR: [-34.9964963, -64.9672817], AU: [-24.7761086, 134.755], JP: [36.5748441, 139.2394179],
    CN: [35.000074, 104.999927], SG: [1.357107, 103.8194992], ZA: [-28.8166236, 24.991639], KE: [-0.1768696, 37.9083264],
    NG: [9.6000359, 7.9999721], MX: [23.6585116, -102.0077097], RU: [64.6863136, 97.7453061], TR: [39.0616, 35.1623],
  };
  const hashString = (s: string): number => { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const mulberry32 = (seed: number) => () => { let t = (seed += 0x6D2B79F5); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const getCountryNameFromIso2 = (code: string): string | null => { try { const DN = (Intl as any).DisplayNames; if (!DN) return null; const r = new DN(['en'], { type: 'region' }) as { of: (c: string) => string }; const name = r.of(code); return typeof name === 'string' ? name : null; } catch { return null; } };
  const resolveLatLngForCode = (cc: string): [number, number] => { const t = countryCodeToLatLng[cc]; if (t) return t; const name = getCountryNameFromIso2(cc); if (name) { const exact = countryCentroidsRef.current.get(name); if (exact) return [exact.lat, exact.lng]; const upper = name.toUpperCase(); for (const [k, v] of countryCentroidsRef.current.entries()) { const ku = k.toUpperCase(); if (ku.includes(upper) || upper.includes(ku)) return [v.lat, v.lng]; } } return [0, 0]; };
  const getCountrySpreadDeg = (name: string | null | undefined, fallbackLat: number): number | undefined => { try { if (!name) return undefined; let diag = countryBBoxDiagRef.current.get(name); if (typeof diag !== 'number') { const target = name.toUpperCase(); for (const [k, v] of countryBBoxDiagRef.current.entries()) { const ku = k.toUpperCase(); if (ku.includes(target) || target.includes(ku)) { diag = v as number; break; } } } if (typeof diag !== 'number' || !(diag > 0)) return undefined; const latRad = (fallbackLat || 0) * Math.PI / 180; const latScale = Math.max(0.5, Math.cos(latRad)); const effDiag = Math.hypot(diag * latScale, diag); const multiplier = effDiag > 35 ? 0.20 : (effDiag > 20 ? 0.175 : 0.15); const base = Math.max(0.12, Math.min(4.0, effDiag * multiplier)); return base; } catch { return undefined; } };
  const seededJitterAround = (lat: number, lng: number, id: string, spreadDeg?: number, overrideAngleRad?: number, radiusScale?: number): [number, number] => { const seed = hashString(id); const rnd = mulberry32(seed); const angle = typeof overrideAngleRad === 'number' ? overrideAngleRad : (rnd() * Math.PI * 2); const base = typeof spreadDeg === 'number' ? Math.max(0.08, Math.min(4.5, spreadDeg)) : 0.24; const rUnscaled = (0.6 * base) + rnd() * (0.4 * base); const r = (radiusScale && radiusScale > 0 ? rUnscaled * radiusScale : rUnscaled); const dLat = r * Math.sin(angle); const dLng = r * Math.cos(angle) / Math.max(0.5, Math.cos(lat * Math.PI / 180)); const jLat = Math.max(-85, Math.min(85, lat + dLat)); const jLng = ((lng + dLng + 540) % 360) - 180; return [jLat, jLng]; };

  type GlobeNode = { id: string; name: string; countryCode: string; createdAt: string };
  type GlobeLink = { source: string; target: string };
  const fetchGlobeData = async (filter: 'all' | '30d' | '7d' = 'all'): Promise<{ nodes: GlobeNode[]; links: GlobeLink[] }> => {
    const guessedBase = (typeof window !== 'undefined' ? window.location.origin : '') || 'https://riverflowseshaan.vercel.app';
    const base = guessedBase.replace(/\/$/, '');
    const resp = await fetch(`${base}/api/globe?filter=${encodeURIComponent(filter)}`, { headers: { 'Content-Type': 'application/json' } });
    if (!resp.ok) throw new Error(`globe api failed: ${resp.status}`);
    const json = await resp.json();
    return { nodes: json?.nodes || [], links: json?.links || [] };
  };
  const fetchMeSafe = async (): Promise<{ id: string | null; name: string | null } | null> => {
    try { const guessedBase = (typeof window !== 'undefined' ? window.location.origin : '') || ''; if (!guessedBase) return null; const base = guessedBase.replace(/\/$/, ''); const email = (window as any)?.RIVER_EMAIL || null; if (!email) return null; const resp = await fetch(`${base}/api/me`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) }); if (!resp.ok) return null; const j = await resp.json(); const ref = j?.me?.referral_code || j?.me?.ref_code_8 || null; const name = j?.me?.name || null; return { id: ref || null, name }; } catch { return null; }
  };

  // Helper: Build adjacency graph and compute depths from user
  const buildChainMetadata = (userId: string | null, links: Array<{ source: string; target: string }>) => {
    const adj = new Map<string, Set<string>>();
    links.forEach(l => {
      if (!adj.has(l.source)) adj.set(l.source, new Set());
      if (!adj.has(l.target)) adj.set(l.target, new Set());
      adj.get(l.source)!.add(l.target);
      adj.get(l.target)!.add(l.source);
    });

    const depths = new Map<string, number>();
    const parents = new Map<string, string>();
    if (userId) {
      const q: Array<{ id: string; depth: number }> = [{ id: userId, depth: 0 }];
      while (q.length) {
        const { id, depth } = q.shift()!;
        if (depths.has(id)) continue;
        depths.set(id, depth);
        const neighbors = adj.get(id);
        if (neighbors) {
          neighbors.forEach(n => {
            if (!depths.has(n)) {
              parents.set(n, id);
              q.push({ id: n, depth: depth + 1 });
            }
          });
        }
      }
    }
    return { adj, depths, parents };
  };

  // Helper: Find maximum depth reachable from a node via parents
  const findChainDepth = (nodeId: string, parents: Map<string, string>, visited?: Set<string>): number => {
    if (!visited) visited = new Set();
    if (visited.has(nodeId)) return 0;
    visited.add(nodeId);
    const children: string[] = [];
    for (const [child, parent] of parents.entries()) {
      if (parent === nodeId) children.push(child);
    }
    if (children.length === 0) return 1;
    return 1 + Math.max(...children.map(c => findChainDepth(c, parents, visited)));
  };

  // Helper: Build waypoint list for boat traversal (longest chains first)
  const buildBoatWaypoints = (userId: string | null, nodeMap: Map<string, NodeData>, depths: Map<string, number>, parents: Map<string, string>, adj: Map<string, Set<string>>): THREE.Vector3[] => {
    if (!userId || !nodeMap.has(userId)) return [];
    
    const waypoints: THREE.Vector3[] = [];
    const userNode = nodeMap.get(userId)!;
    const userPos = globeEl.current?.getCoords(userNode.lat, userNode.lng);
    if (!userPos) return [];
    const userVec = new THREE.Vector3(userPos.x, userPos.y, userPos.z);
    waypoints.push(userVec);

    // Get direct neighbors (depth 1)
    const neighbors = (Array.from(adj.get(userId) || new Set()) as string[]).filter(n => depths.get(n) === 1);
    
    // Sort by max chain depth (longest first)
    neighbors.sort((a, b) => findChainDepth(b, parents) - findChainDepth(a, parents));

    // Traverse each neighbor chain to endpoint and back
    neighbors.forEach(neighborId => {
      const visited = new Set<string>();
      let current = neighborId;
      const chain: string[] = [current];
      visited.add(current);
      
      // Follow chain to endpoint
      while (true) {
        const children: string[] = [];
        for (const [child, parent] of parents.entries()) {
          if (parent === current && !visited.has(child)) children.push(child);
        }
        if (children.length === 0) break;
        current = children[0];
        chain.push(current);
        visited.add(current);
      }

      // Add all chain nodes as waypoints
      chain.forEach(nodeId => {
        const node = nodeMap.get(nodeId);
        if (node) {
          const c = globeEl.current?.getCoords(node.lat, node.lng);
          if (c) waypoints.push(new THREE.Vector3(c.x, c.y, c.z));
        }
      });

      // Return to user
      waypoints.push(userVec);
    });

    return waypoints;
  };

  // Data load + layout
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [{ nodes, links }, me] = await Promise.all([fetchGlobeData('all'), fetchMeSafe()]);
        if (cancelled) return;
        myIdRef.current = me?.id || null;
        isLoggedInRef.current = !!myIdRef.current;
        try { myFirstNameRef.current = ((me?.name || '').trim().split(/\s+/)[0] || ''); } catch { myFirstNameRef.current = ''; }
        const conn = new Set<string>();
        if (myIdRef.current) { links.forEach(l => { if (l.source === myIdRef.current) conn.add(l.target); if (l.target === myIdRef.current) conn.add(l.source); }); }
        myConnectionsRef.current = conn;

        // Build chain (ancestors+descendants) via BFS over undirected links
        const chain = new Set<string>(); const adj = new Map<string, Set<string>>();
        links.forEach(l => { if (!adj.has(l.source)) adj.set(l.source, new Set()); if (!adj.has(l.target)) adj.set(l.target, new Set()); adj.get(l.source)!.add(l.target); adj.get(l.target)!.add(l.source); });
        const startId = myIdRef.current; if (startId) { const q: string[] = [startId]; chain.add(startId); while (q.length) { const cur = q.shift()!; const neigh = adj.get(cur); if (!neigh) continue; neigh.forEach(n => { if (!chain.has(n)) { chain.add(n); q.push(n); } }); } }
        myChainRef.current = chain;

        const nodeMap = new Map<string, NodeData>();
        nodes.forEach(n => {
          const cc = (n.countryCode || '').toUpperCase();
          const base = resolveLatLngForCode(cc);
          const name = getCountryNameFromIso2(cc);
          const spread = getCountrySpreadDeg(name, base[0]);
          const [lat, lng] = seededJitterAround(base[0], base[1], n.id, spread);
          nodeMap.set(n.id, { id: n.id, lat, lng, size: 0.20, color: 'rgba(255,255,255,0.95)', countryCode: cc, name: n.name || null });
        });

        // Moat around user
        const N = 8; const sectorSize = (2 * Math.PI) / N; let userSector: number | null = null; let userAngle: number | null = null; let userCountry: string | null = null;
        if (myIdRef.current && nodeMap.has(myIdRef.current)) { const meNode = nodeMap.get(myIdRef.current)!; userCountry = meNode.countryCode || null; const seed = hashString(myIdRef.current); const rnd = mulberry32(seed); const baseAngle = rnd() * Math.PI * 2; userSector = Math.floor(baseAngle / sectorSize) % N; userAngle = (userSector * sectorSize) + (sectorSize / 2); }
        if (userSector !== null && userAngle !== null && userCountry) {
          const bubbleDeg = 0.35; const bubbleRad = bubbleDeg * Math.PI / 180; const entries = Array.from(nodeMap.values());
          for (const val of entries) {
            const cc = (val.countryCode || '').toUpperCase(); const base = resolveLatLngForCode(cc); const name = getCountryNameFromIso2(cc); const spread = getCountrySpreadDeg(name, base[0]); const seed = hashString(val.id); const rnd = mulberry32(seed); const baseAngle = rnd() * Math.PI * 2; let angle = baseAngle; if (cc === userCountry) { let sector = Math.floor(baseAngle / sectorSize) % N; if (sector === userSector) sector = (sector + 1) % N; angle = (sector * sectorSize) + (sectorSize / 2); const diff = Math.atan2(Math.sin(angle - userAngle), Math.cos(angle - userAngle)); if (Math.abs(diff) < bubbleRad) { const leftBoundary = userSector * sectorSize; const rightBoundary = ((userSector + 1) % N) * sectorSize; const distLeft = Math.abs(Math.atan2(Math.sin(angle - leftBoundary), Math.cos(angle - leftBoundary))); const distRight = Math.abs(Math.atan2(Math.sin(angle - rightBoundary), Math.cos(angle - rightBoundary))); angle = distLeft <= distRight ? leftBoundary : rightBoundary; } } const radiusScale = (myIdRef.current && val.id === myIdRef.current) ? 1.6 : undefined; const [lat, lng] = seededJitterAround(base[0], base[1], val.id, spread, angle, radiusScale); val.lat = lat; val.lng = lng; }
        }

        const darkTeal = '#135E66'; const aqua = 'rgba(42,167,181,0.95)'; const nearWhite = 'rgba(255,255,255,0.95)';
        nodeMap.forEach((val, key) => { if (myIdRef.current && key === myIdRef.current) { val.color = darkTeal; val.size = 0.35; } else if (myConnectionsRef.current.has(key)) { val.color = aqua; val.size = 0.28; } else { val.color = nearWhite; val.size = 0.20; } });
        setNodesData(Array.from(nodeMap.values()));
        const arcs: ArcData[] = []; links.forEach(l => { const a = nodeMap.get(l.source); const b = nodeMap.get(l.target); if (!a || !b) return; const isPrimary = myChainRef.current.has(a.id) && myChainRef.current.has(b.id); arcs.push({ startLat: a.lat, startLng: a.lng, endLat: b.lat, endLng: b.lng, startId: a.id, endId: b.id, primary: isPrimary }); });
        arcs.sort((x, y) => Number(Boolean(x.primary)) - Number(Boolean(y.primary)));
        setArcsData(arcs);

        const boatKey = 'user-chain-traversal';
        if (!boatArcKeysRef.current.has(boatKey)) {
          boatArcKeysRef.current.add(boatKey);
          if (myIdRef.current && isLoggedInRef.current) {
            const { adj, depths, parents } = buildChainMetadata(myIdRef.current, links);
            const waypoints = buildBoatWaypoints(myIdRef.current, nodeMap, depths, parents, adj);
            if (waypoints.length > 1) {
              try {
                const curve = new THREE.CatmullRomCurve3(waypoints);
                curve.closed = false;
                const scene = sceneRef.current;
                if (scene && boatTemplateRef.current && !safeProfileRef.current && glbLoadedRef.current) {
                  spawnBoatFromCurve(curve, boatKey);
                } else if (scene && !safeProfileRef.current) {
                  spawnProceduralBoatFromCurve(curve, boatKey);
                  if (boatTemplateRef.current && !safeProfileRef.current) {
                    pendingSpawnsRef.current.push({ curve, arcKey: boatKey });
                  }
                }
              } catch {}
            }
          } else {
            const pri = arcs.find(a => a.primary) || arcs[0];
            const sec = arcs.find(a => !a.primary);
            if (pri) {
              spawnBoatAlongArc(pri.startLat, pri.startLng, pri.endLat, pri.endLng, boatKey);
            }
            if (sec) {
              const key2 = `${sec.startId}->${sec.endId}`;
              if (!boatArcKeysRef.current.has(key2)) {
                boatArcKeysRef.current.add(key2);
                spawnBoatAlongArc(sec.startLat, sec.startLng, sec.endLat, sec.endLng, key2);
              }
            }
          }
        }

        // Overlays list
        const max = 6; const result: NodeData[] = []; const byId = new Map<string, NodeData>(); Array.from(nodeMap.values()).forEach(n => byId.set(n.id, n));
        const meId = myIdRef.current; if (meId && byId.has(meId)) result.push(byId.get(meId)!);
        for (const id of Array.from(myConnectionsRef.current.values())) { if (result.length >= max) break; const n = byId.get(id); if (n) result.push(n); }
        setOverlayNodes(result.slice(0, max));
      } catch { if (!cancelled) { setNodesData([]); setArcsData([]); } }
    })();
    return () => { cancelled = true; };
  }, []);

  const globeMaterial = useMemo(() => new THREE.MeshPhongMaterial({ color: '#a8c5cd', opacity: 0.6, transparent: true }), []);
  useEffect(() => { try { (globeMaterial as any).toneMapped = false; } catch {} }, [globeMaterial]);

  const rendererConfig = useMemo(() => {
    try {
      const nav: any = typeof navigator !== 'undefined' ? navigator : {};
      const ua = String(nav.userAgent || '').toLowerCase();
      const isMobile = /iphone|ipad|android/.test(ua);
      const qs = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
      const forceHigh = !!(qs && qs.get('hp') === '1');
      const powerPreference = (lowPowerRef.current || isMobile) && !forceHigh ? 'low-power' : 'high-performance';
      return { powerPreference, alpha: true, antialias: true, precision: lowPowerRef.current ? 'mediump' : 'highp' } as any;
    } catch {
      return { powerPreference: 'low-power', alpha: true, antialias: true } as any;
    }
  }, []);

  // Controls/Camera/Renderer and GLB preload
  const onGlobeReady = () => {
    if (!globeEl.current) return;
    sceneRef.current = globeEl.current.scene();
    controlsRef.current = globeEl.current.controls();
    cameraRef.current = globeEl.current.camera();
    rendererRef.current = globeEl.current.renderer?.() as any;
    const controls = controlsRef.current; const camera = cameraRef.current; const renderer = rendererRef.current;
    if (!controls || !camera) return;
    controls.autoRotate = false; controls.autoRotateSpeed = 0.25; controls.enableZoom = true;
    const getFitDistance = () => { try { const vFov = (camera.fov || 75) * Math.PI / 180; const aspect = camera.aspect || 1; const R = 100 * (1 + 0.22); const margin = 1.15; const dV = (R * margin) / Math.tan(vFov / 2); const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect); const dH = (R * margin) / Math.tan(hFov / 2); return Math.max(dV, dH, 100 * 1.3); } catch { return camera.position.length(); } };
    camera.near = 0.1; camera.far = 5000; camera.updateProjectionMatrix();
    const fitD = getFitDistance(); controls.target.set(0, 0, 0); camera.position.set(0, 0, fitD); camera.lookAt(0, 0, 0); camera.updateProjectionMatrix(); baselineDistanceRef.current = fitD; controls.maxDistance = fitD; controls.minDistance = Math.max(fitD / 3, 80); controls.screenSpacePanning = false;
    try {
      const initial = Math.min(1.25, (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1));
      dprRef.current = initial;
      renderer?.setPixelRatio?.(initial);
    } catch {}
    const scene = sceneRef.current; if (scene) scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    refitCameraRef.current = () => { try { if (!globeEl.current) return; const newFit = getFitDistance(); const prevFit = baselineDistanceRef.current || newFit; const dist = camera.position.length(); const ratio = Math.max(0.0001, dist / prevFit); baselineDistanceRef.current = newFit; controls.maxDistance = newFit; controls.minDistance = Math.max(newFit / 3, 80); const dir = camera.position.clone().normalize(); camera.position.copy(dir.multiplyScalar(newFit * ratio)); camera.updateProjectionMatrix(); } catch {} };
    setIsGlobeReady(true);
    // One-time log of chosen caps
    try {
      const nav: any = typeof navigator !== 'undefined' ? navigator : {};
      // eslint-disable-next-line no-console
      console.log('[GlobeNew] caps', {
        dpr: dprRef.current,
        rendererPower: (renderer as any)?.getContext?.()?.getContextAttributes?.()?.powerPreference || '(unknown)',
        deviceMemory: nav.deviceMemory,
        lowPower: lowPowerRef.current
      });
    } catch {}
    // Preload GLB boat once (SSR-safe)
    try {
      if (!glbLoadedRef.current) {
        // Dynamic import to reduce cold-start
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        import('three/examples/jsm/utils/SkeletonUtils.js').then((m: any) => { try { cloneFnRef.current = m?.clone || null; } catch {} }).catch(() => {});
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        import('three/examples/jsm/loaders/GLTFLoader.js').then((mod: any) => {
          const GLTFLoaderClass = mod?.GLTFLoader;
          if (!GLTFLoaderClass) return;
          const loader = new GLTFLoaderClass();
        const base = (typeof window !== 'undefined' ? window.location.origin : '') || '';
        const BOAT_ASSET_VERSION = (process.env.NEXT_PUBLIC_BOAT_ASSET_VERSION || '1');
        const url = base ? new URL(`/paper_boat.glb?v=${encodeURIComponent(BOAT_ASSET_VERSION)}`, base).toString() : `/paper_boat.glb?v=${encodeURIComponent(BOAT_ASSET_VERSION)}`;
        loader.load(
          url,
          (gltf: any) => {
            try {
              const root = gltf?.scene as THREE.Object3D | undefined;
              if (!root) return;
              boatTemplateRef.current = root;
              let cached: THREE.Material | null = null;
              root.traverse((child: any) => { if (child.isMesh && child.material && !cached) cached = child.material as THREE.Material; });
              boatTemplateMaterialRef.current = cached;
              glbLoadedRef.current = true;
              // Spawn any pending boats now that the model is ready
              try {
                  if (!safeProfileRef.current && fpsRef.current >= 28) {
                    pendingSpawnsRef.current.splice(0).forEach(({ curve, arcKey }) => {
                      spawnBoatFromCurve(curve, arcKey);
                    });
                  }
              } catch {}
            } catch {}
            },
            undefined,
            () => { /* ignore error */ }
          );
        }).catch(() => {});
      }
    } catch {}
  };

  const stopRotateInterval = useCallback(() => { if (rotateIntervalRef.current) { window.clearInterval(rotateIntervalRef.current); rotateIntervalRef.current = null; } if (controlsRef.current) controlsRef.current.autoRotate = false; }, []);
  const startBurstRotate = useCallback(() => { stopRotateInterval(); const controls = controlsRef.current; if (!controls) return; autoStateRef.current = 'autorotate_burst'; const step = 0.01; rotateIntervalRef.current = window.setInterval(() => { try { controls.rotateLeft(step); controls.update(); } catch {} }, 33) as any; if (burstTimerRef.current) clearTimeout(burstTimerRef.current); burstTimerRef.current = window.setTimeout(() => { stopRotateInterval(); autoStateRef.current = 'idle'; }, 10000) as any; }, [stopRotateInterval]);
  const startIdleRotate = useCallback(() => { stopRotateInterval(); const controls = controlsRef.current; if (!controls) return; autoStateRef.current = 'autorotate_idle'; const step = 0.006; rotateIntervalRef.current = window.setInterval(() => { try { controls.rotateLeft(step); controls.update(); } catch {} }, 66) as any; }, [stopRotateInterval]);
  const startIdleTimer = useCallback(() => { if (idleTimerRef.current) { window.clearTimeout(idleTimerRef.current); idleTimerRef.current = null; } idleTimerRef.current = window.setTimeout(() => { startIdleRotate(); }, 120000) as any; }, [startIdleRotate]);
  useEffect(() => { if (isGlobeReady) startBurstRotate(); }, [isGlobeReady, startBurstRotate]);
  useEffect(() => {
    if (!isGlobeReady) return;
    const controls = controlsRef.current; const camera = cameraRef.current; const renderer = rendererRef.current; if (!controls || !camera || !renderer) return;
    const ZOOM_LOD_THRESHOLD = 220;
    const handleZoom = () => { const distance = camera.position.length(); setCurrentLOD(distance < ZOOM_LOD_THRESHOLD && countriesLODRef.current.high.features.length > 0 ? 'high' : 'low'); const ratio = Math.max(0.0001, baselineDistanceRef.current / distance); const raw = Math.min(2.0, Math.max(0.6, 0.85 + 0.55 * ratio)); const quant = Math.round(raw * 10) / 10; setZoomScale(prev => (Math.abs((prev ?? 0) - quant) >= 0.05 ? quant : prev)); };
    controls.addEventListener('change', handleZoom); const onInteractionStart = () => { hasInteractedRef.current = true; }; controls.addEventListener('start', onInteractionStart);
    if (!hasInteractedRef.current) { requestAnimationFrame(() => { if (!globeEl.current || hasInteractedRef.current) return; controls.target.set(0, 0, 0); camera.position.set(0, 0, baselineDistanceRef.current); camera.lookAt(0, 0, 0); camera.updateProjectionMatrix(); }); }
    let resizeTimer: number | null = null; const onResize = () => { if (resizeTimer) window.clearTimeout(resizeTimer); resizeTimer = window.setTimeout(() => { refitCameraRef.current(); try { renderer.setPixelRatio?.(Math.min(1.75, window.devicePixelRatio || 1)); } catch {} }, 150) as any; }; window.addEventListener('resize', onResize);
    const onActivity = () => { stopRotateInterval(); autoStateRef.current = 'idle'; startIdleTimer(); };
    const onVisibilityChange = () => { isHiddenRef.current = !!document.hidden; if (document.hidden) { stopRotateInterval(); } else if (autoStateRef.current === 'autorotate_idle') { startIdleRotate(); } };
    const activityEvents: (keyof DocumentEventMap)[] = ['pointerdown', 'wheel', 'keydown', 'touchstart']; activityEvents.forEach(ev => window.addEventListener(ev, onActivity, { passive: true })); document.addEventListener('visibilitychange', onVisibilityChange);
    handleZoom();
    return () => { controls.removeEventListener('change', handleZoom); controls.removeEventListener('start', onInteractionStart); window.removeEventListener('resize', onResize); activityEvents.forEach(ev => window.removeEventListener(ev, onActivity)); document.removeEventListener('visibilitychange', onVisibilityChange); stopRotateInterval(); if (burstTimerRef.current) window.clearTimeout(burstTimerRef.current); if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current); if (resizeTimer) window.clearTimeout(resizeTimer); };
  }, [isGlobeReady, startIdleTimer, startIdleRotate, stopRotateInterval]);

  // Observe container/renderer size changes to keep fit accurate
  useEffect(() => { let ro: ResizeObserver | null = null; const attach = () => { const targets = [containerRef.current, rendererRef.current?.domElement].filter(Boolean); if (targets.length > 0) { ro = new ResizeObserver(() => { refitCameraRef.current?.(); }); targets.forEach(t => ro!.observe(t!)); } }; const id = window.setTimeout(attach, 100); return () => { window.clearTimeout(id); ro?.disconnect(); }; }, []);

  const handlePolygonHover = (feature: any | null) => { setHoveredCountry(feature); if (feature) { setTooltipContent(feature.properties.name); setIsTooltipVisible(true); } else { setIsTooltipVisible(false); } };
  const tooltipRefPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const rafPendingRef = useRef<boolean>(false);
  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => { tooltipRefPos.current = { x: event.nativeEvent.offsetX, y: event.nativeEvent.offsetY }; if (rafPendingRef.current) return; rafPendingRef.current = true; requestAnimationFrame(() => { rafPendingRef.current = false; setTooltipPosition(tooltipRefPos.current); }); };

  const containerStyle: React.CSSProperties = { 
    width: '100%', 
    height: '100%', 
    position: 'relative', 
    overflow: 'hidden', 
    backgroundColor: 'transparent',
    aspectRatio: '1 / 1',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundImage: `
      radial-gradient(1.5px 1.5px at 20% 30%, white, transparent),
      radial-gradient(1px 1px at 80% 10%, white, transparent),
      radial-gradient(1.5px 1.5px at 50% 80%, white, transparent),
      radial-gradient(2px 2px at 75% 60%, white, transparent),
      radial-gradient(2.5px 2.5px at 10% 90%, white, transparent)
    `.replace(/\s+/g, ' ')
  };

  const tooltipStyle: React.CSSProperties = { position: 'absolute', left: `${tooltipPosition.x + 15}px`, top: `${tooltipPosition.y + 15}px`, backgroundColor: 'rgba(40, 40, 40, 0.85)', color: 'white', padding: '5px 10px', borderRadius: '5px', fontFamily: "'Roboto Mono', monospace", fontSize: '1rem', pointerEvents: 'none', zIndex: 10, whiteSpace: 'nowrap', transition: 'opacity 0.2s ease-in-out', opacity: isTooltipVisible ? 1 : 0 };

  useEffect(() => { const update = () => { try { const users = nodesData.length; const countries = (() => { const s = new Set<string>(); nodesData.forEach(n => { if (n.countryCode) s.add((n.countryCode || '').toUpperCase()); }); return s.size; })(); const connections = arcsData.length; setSrSummary(`Dream River globe: ${users} people across ${countries} countries with ${connections} connections.`); } catch { setSrSummary('An interactive 3D globe showing countries of the world.'); } }; update(); window.addEventListener('focus', update); return () => window.removeEventListener('focus', update); }, [nodesData, arcsData]);

  // Project helpers for overlays
  const projectLatLngIfFront = (lat: number, lng: number): { x: number; y: number } | null => { try { const globe = globeEl.current; if (!globe) return null; const cam = globe.camera(); const c = globe.getCoords(lat, lng); if (!c) return null; const world = new THREE.Vector3(c.x, c.y, c.z); const dot = world.clone().normalize().dot(cam.position.clone().normalize()); if (dot <= 0) return null; const v = world.project(cam); const rect = globe.renderer()?.domElement?.getBoundingClientRect?.() || { width: window.innerWidth, height: window.innerHeight } as any; const x = (v.x * 0.5 + 0.5) * rect.width; const y = (-v.y * 0.5 + 0.5) * rect.height; return { x, y }; } catch { return null; } };
  const overlayUpdatePendingRef = useRef<boolean>(false);
  const scheduleOverlayUpdate = () => { if (overlayUpdatePendingRef.current) return; overlayUpdatePendingRef.current = true; requestAnimationFrame(() => { overlayUpdatePendingRef.current = false; try { const globe = globeEl.current; if (!globe) return; overlayNodes.forEach(n => { const el = overlayRefs.current.get(n.id); if (!el) return; const px = projectLatLngIfFront(n.lat, n.lng); if (!px) { el.style.opacity = '0'; return; } el.style.left = `${px.x}px`; el.style.top = `${px.y}px`; el.style.opacity = '1'; }); } catch {} }); };

  // --- Boat animation loop (single-boat) with fixed-step simulation (allocation-free) ---
  useEffect(() => {
    let rafId: number;
    const TICK_MS_HIDDEN = 1000; // 1Hz when hidden (user-requested)
    let lastTick = performance.now();
    const pos = new THREE.Vector3();
    const tan = new THREE.Vector3();
    const animate = () => {
      const now = performance.now();
      const tickMs = isHiddenRef.current ? TICK_MS_HIDDEN : (safeProfileRef.current ? 50 : 33);
      if (now - lastTick >= tickMs) {
        lastTick = now;
        boatsRef.current.forEach(boat => {
          const elapsed = now - boat.startTime;
          const t = (elapsed / boat.duration) % 1.0;
          boat.curve.getPointAt(t, pos);
          try {
            const globe = globeEl.current; const cam = globe?.camera();
            if (cam) {
              const visible = pos.clone().normalize().dot(cam.position.clone().normalize()) > 0;
              (boat.mesh as any).visible = visible;
              if (!visible) return;
            }
          } catch {}
          boat.mesh.position.copy(pos);
          // Offset boat slightly away from globe center (radially outward) to keep it above arcs/land
          boat.mesh.position.multiplyScalar(1.02);
          boat.curve.getTangentAt(t, tan);
          boat.mesh.up.copy(pos).normalize();
          boat.mesh.lookAt(pos.clone().add(tan));
        });
      }
      rafId = requestAnimationFrame(animate);
    };
    animate();
    return () => {
      cancelAnimationFrame(rafId);
      try {
        const scene = sceneRef.current;
        if (scene) boatsRef.current.forEach(b => scene.remove(b.mesh));
        boatsRef.current.forEach(b => {
          (b.mesh as any).traverse?.((child: any) => {
            if (child.isMesh) {
              child.geometry?.dispose?.();
              if (child.material?.dispose) child.material.dispose();
            }
          });
        });
      } catch {}
      boatsRef.current = [];
    };
  }, []);

  const proceduralBoatMaterialRef = useRef<THREE.Material | null>(null);
  const createProceduralBoat = () => {
    const geom = new THREE.ConeGeometry(2.5, 6, 3);
    if (!proceduralBoatMaterialRef.current) proceduralBoatMaterialRef.current = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const mesh = new THREE.Mesh(geom, proceduralBoatMaterialRef.current);
    mesh.castShadow = false; (mesh as any).receiveShadow = false;
    return mesh as THREE.Mesh;
  };

  const spawnBoatAlongArc = (startLat: number, startLng: number, endLat: number, endLng: number, arcKey?: string) => {
    try {
      const globe = globeEl.current; const scene = sceneRef.current || (globe ? globe.scene() : null); if (!globe || !scene) return;
      const ARC_ALTITUDE = 0.2; const BOAT_PATH_ALTITUDE = 0.07; const GLOBE_RADIUS = 100;
      const sC = globe.getCoords(startLat, startLng); const eC = globe.getCoords(endLat, endLng); if (!sC || !eC) return;
      const s = new THREE.Vector3(sC.x, sC.y, sC.z).normalize().multiplyScalar(GLOBE_RADIUS * (1 + BOAT_PATH_ALTITUDE));
      const e = new THREE.Vector3(eC.x, eC.y, eC.z).normalize().multiplyScalar(GLOBE_RADIUS * (1 + BOAT_PATH_ALTITUDE));
      const mid = new THREE.Vector3().addVectors(s, e).multiplyScalar(0.5).normalize().multiplyScalar(GLOBE_RADIUS * (1 + ARC_ALTITUDE));
      const curve = new THREE.CatmullRomCurve3([s, mid, e]);
      const key = arcKey || `${startLat},${startLng}->${endLat},${endLng}`;
      if (!boatTemplateRef.current || safeProfileRef.current) {
        // Spawn procedural fallback immediately and record for later upgrade
        spawnProceduralBoatFromCurve(curve, key);
        if (boatTemplateRef.current && !safeProfileRef.current) return;
        pendingSpawnsRef.current.push({ curve, arcKey: key });
        return;
      }
      spawnBoatFromCurve(curve, key);
    } catch {}
  };

  const spawnBoatFromCurve = (curve: THREE.CatmullRomCurve3, arcKey: string) => {
    const scene = sceneRef.current; const globe = globeEl.current; if (!scene || !globe) return;
    try {
      const src = boatTemplateRef.current!;
      const cloned = (cloneFnRef.current ? cloneFnRef.current(src) : src.clone(true)) as THREE.Object3D;
      cloned.traverse((child: any) => { if (child.isMesh) { if (boatTemplateMaterialRef.current) child.material = boatTemplateMaterialRef.current; child.castShadow = false; child.receiveShadow = false; } });
      cloned.scale.set(6, 6, 6);
      // Initial placement & orientation at t=0 for immediate visibility
      const pos0 = curve.getPointAt(0);
      cloned.position.copy(pos0);
      // Offset boat slightly away from globe center (radially outward) to keep it above arcs/land
      cloned.position.multiplyScalar(1.02);
      const tan0 = curve.getTangentAt(0);
      cloned.up.copy(pos0).normalize();
      cloned.lookAt(pos0.clone().add(tan0));
      // Rotate boat 90° on Z-axis so it sails forward instead of sideways
      cloned.rotateOnWorldAxis(new THREE.Vector3(0, 0, 1), Math.PI / 2);
      // Cap to two boats: remove oldest if exceeding
      if (boatsRef.current.length >= 2) { try { const old = boatsRef.current.shift(); if (old && scene) scene.remove(old.mesh); } catch {} }
      boatsRef.current.push({ id: Date.now() + Math.random(), mesh: cloned as unknown as THREE.Mesh, curve, startTime: performance.now(), duration: 15000, isPlaceholder: false });
      scene.add(cloned);
    } catch {}
  };

  const spawnProceduralBoatFromCurve = (curve: THREE.CatmullRomCurve3, arcKey: string) => {
    const scene = sceneRef.current; if (!scene) return;
    try {
      const mesh = createProceduralBoat();
      const pos0 = curve.getPointAt(0);
      const tan0 = curve.getTangentAt(0);
      mesh.position.copy(pos0);
      // Offset boat slightly away from globe center (radially outward) to keep it above arcs/land
      mesh.position.multiplyScalar(1.02);
      (mesh as any).up.copy(pos0).normalize();
      (mesh as any).lookAt(pos0.clone().add(tan0));
      // Rotate boat 90° on Z-axis so it sails forward instead of sideways
      mesh.rotateOnWorldAxis(new THREE.Vector3(0, 0, 1), Math.PI / 2);
      if (boatsRef.current.length >= 2) { try { const old = boatsRef.current.shift(); if (old && scene) scene.remove(old.mesh); } catch {} }
      boatsRef.current.push({ id: Date.now() + Math.random(), mesh, curve, startTime: performance.now(), duration: 15000, isPlaceholder: true });
      scene.add(mesh);
    } catch {}
  };

  const arcResolution = useMemo(() => {
    // Dynamic segments by approximate screen scale; clamp for bounds
    const rect = rendererRef.current?.domElement?.getBoundingClientRect?.();
    const width = rect?.width || (typeof window !== 'undefined' ? window.innerWidth : 1200);
    const pxScale = Math.min(1.6, Math.max(0.7, (dprRef.current || 1) * (width / 1200)));
    let seg = Math.round(16 + 8 * Math.min(1, zoomScale * pxScale));
    if (lowPowerRef.current || safeProfileRef.current) seg -= 4;
    seg = Math.max(12, Math.min(24, seg));
    return seg;
  }, [zoomScale]);

  return (
    <div ref={containerRef} style={containerStyle} onMouseMove={handleMouseMove} role="region" aria-label={ariaLabel} aria-describedby={describedById} tabIndex={tabIndex as number | undefined}>
      {devHudEnabledRef.current && (
        <div ref={hudElRef} style={{ position: 'absolute', top: '28px', left: '10px', color: 'white', backgroundColor: 'rgba(0,0,0,0.5)', padding: '5px 8px', borderRadius: '3px', fontFamily: "'Roboto Mono', monospace", fontSize: '12px', zIndex: 100 }} />
      )}
      <div aria-live="polite" role="status" style={{ position: 'absolute', left: -9999, top: 'auto', width: 1, height: 1, overflow: 'hidden' }}>
        {srSummary}
      </div>
      <div style={tooltipStyle}>
        {tooltipContent}
      </div>
      <ReactGlobe
        ref={globeEl}
        onGlobeReady={onGlobeReady}
        rendererConfig={rendererConfig}
        backgroundColor="#000010"
        globeMaterial={globeMaterial}
        atmosphereColor="#66c2ff"
        atmosphereAltitude={0.25}
        arcsData={arcsData}
        arcColor={useCallback((d: any) => { try { const globe = globeEl.current; if (!globe) return 'rgba(102, 194, 255, 0.8)'; const midLat = (d.startLat + d.endLat) / 2; const midLng = (d.startLng + d.endLng) / 2; const c = globe.getCoords(midLat, midLng); if (!c) return 'rgba(102, 194, 255, 0.8)'; const cam = globe.camera(); const world = new THREE.Vector3(c.x, c.y, c.z); const dot = world.clone().normalize().dot(cam.position.clone().normalize()); const isPri = !!d.primary; const isUserArc = myIdRef.current && (d.startId === myIdRef.current || d.endId === myIdRef.current); const basePrimary = isUserArc ? '200, 255, 255' : '140, 220, 255'; const baseSecondary = '102, 194, 255'; const alpha = dot >= 0 ? (isPri ? (isUserArc ? 0.99 : 0.98) : 0.64) : (isPri ? 0.42 : 0.10); const base = isPri ? basePrimary : baseSecondary; return `rgba(${base}, ${alpha})`; } catch { return 'rgba(102, 194, 255, 0.8)'; } }, [])}
        arcStroke={useCallback((d: any) => { const isUserArc = myIdRef.current && (d.startId === myIdRef.current || d.endId === myIdRef.current); return isUserArc ? 3.2 : (d?.primary ? 2.2 : 2); }, [])}
        arcAltitude={0.5}
        arcDashLength={1}
        arcDashGap={0}
        arcDashAnimateTime={0}
        arcCircularResolution={arcResolution}
        pointsData={useMemo(() => nodesData.map(n => ({ lat: n.lat, lng: n.lng, size: n.size, color: n.color })), [nodesData])}
        pointAltitude={0.201}
        pointRadius={useCallback((d: any) => (d?.size || 0.20) * zoomScale, [zoomScale])}
        pointColor={useCallback((d: any) => d?.color || 'rgba(255,255,255,0.95)', [])}
        pointsMerge={true}
        pointsTransitionDuration={0}
        polygonsData={polygonsData}
        polygonCapColor={useCallback((feat: any) => { const isHovered = feat.properties.name === hoveredCountry?.properties?.name; if (feat.properties.layer === 'bottom') return '#7C4A33'; return isHovered ? '#B56B45' : '#DCA87E'; }, [hoveredCountry])}
        polygonSideColor={useCallback((feat: any) => (feat.properties.layer === 'bottom' ? 'transparent' : '#7C4A33'), [])}
        polygonStrokeColor={() => 'transparent'}
        polygonAltitude={useCallback((feat: any) => { const isHovered = feat.properties.name === hoveredCountry?.properties.name; if (feat.properties.layer === 'bottom') return 0.001; return isHovered ? 0.06 : 0.04; }, [hoveredCountry])}
        polygonsTransitionDuration={300}
        onPolygonHover={handlePolygonHover}
      />
      {/* Overlays: initials for me + friends (max 6) */}
      {overlayNodes.map((p) => {
        if (!p.id) return null;
        const isMe = myIdRef.current && p.id === myIdRef.current;
        const isFriend = myConnectionsRef.current.has(p.id);
        if (!(isMe || isFriend)) return null;
        return (
          <div
            key={`ux-${p.id}`}
            ref={(el) => { if (el) overlayRefs.current.set(p.id, el); else overlayRefs.current.delete(p.id); }}
            style={{ position: 'absolute', left: 0, top: 0, transform: 'translate(-50%, -50%)', pointerEvents: 'none', zIndex: 60, opacity: 0 }}
            aria-hidden="true"
          >
            <div className="font-seasons" style={{ position: 'absolute', left: '50%', top: 18, transform: 'translate(-50%, 0)', color: 'var(--ink, #e6e6e6)', fontSize: 12, fontWeight: 600, textShadow: '0 1px 2px rgba(0,0,0,0.25)' }}>
              {isMe ? (myFirstNameRef.current || '') : (p.name ? String(p.name).split(/\s+/)[0] || '' : '')}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default Globe;


