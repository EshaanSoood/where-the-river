"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
// Note: when used in Next.js, import via dynamic(() => import(...), { ssr: false })
import ReactGlobe from 'react-globe.gl';
import * as THREE from 'three';
import * as topojson from 'topojson-client';
import { geoCentroid } from 'd3-geo';

interface ArcData {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  startId: string;
  endId: string;
}

// Node = concrete lat/lng point; arcs connect node→node (not country→country)
interface NodeData {
  id: string;
  lat: number;
  lng: number;
  size: number;
  color: string;
  countryCode?: string;
  name?: string | null;
}

interface PointData {
    lat: number;
    lng: number;
    size: number;
    color: string;
    kind?: 'node' | 'cluster';
    label?: string;
    id?: string;
}

interface CountriesData {
    features: any[];
}

interface Boat {
    id: number;
    mesh: THREE.Mesh;
    curve: THREE.CatmullRomCurve3;
    startTime: number;
    duration: number;
}

const createPaperTexture = (): THREE.CanvasTexture | null => {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context) return null;

  // Off-white background
  context.fillStyle = '#f8f8f4';
  context.fillRect(0, 0, canvas.width, canvas.height);

  // Add subtle noise for a paper-like texture
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
      // Add a random value to each color channel
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


type GlobeProps = { describedById?: string; ariaLabel?: string; tabIndex?: number };
const Globe: React.FC<GlobeProps> = ({ describedById, ariaLabel, tabIndex }) => {
  const globeEl = useRef<any>(null);
  // Viewport clamping state (names mirror web/components/GlobeRG.tsx for seamless porting)
  const baselineDistanceRef = useRef<number>(0);
  const hasInteractedRef = useRef<boolean>(false);
  const [countriesLOD, setCountriesLOD] = useState<{ low: CountriesData, high: CountriesData }>({
    low: { features: [] },
    high: { features: [] }
  });
  const [currentLOD, setCurrentLOD] = useState<'low' | 'high'>('low');
  const [arcsData, setArcsData] = useState<ArcData[]>([]);
  const [nodesData, setNodesData] = useState<NodeData[]>([]);
  // Logged-in user + connections (from DB)
  const myIdRef = useRef<string | null>(null);
  const myFirstNameRef = useRef<string>("");
  const myConnectionsRef = useRef<Set<string>>(new Set());
  const reservedPosRef = useRef<Map<string, { lat: number; lng: number }>>(new Map());
  const [zoomScale, setZoomScale] = useState<number>(1);
  const [overlayNodes, setOverlayNodes] = useState<NodeData[]>([]);
  const overlayRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const overlayUpdatePendingRef = useRef<boolean>(false);
  const [hoveredCountry, setHoveredCountry] = useState<any | null>(null);
  const [tooltipContent, setTooltipContent] = useState('');
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const [isTooltipVisible, setIsTooltipVisible] = useState(false);
  const [startNode, setStartNode] = useState<NodeData | null>(null);
  const [srSummary, setSrSummary] = useState<string>("");

  // Ref to hold the latest LOD data for the event listener
  const countriesLODRef = useRef(countriesLOD);
  useEffect(() => {
    countriesLODRef.current = countriesLOD;
  }, [countriesLOD]);

  const sceneRef = useRef<THREE.Scene | null>(null);
  const lowPowerRef = useRef<boolean>(false);
  const boatsRef = useRef<Boat[]>([]);
  const countryCentroidsRef = useRef<Map<string, { lat: number; lng: number }>>(new Map());
  // Precomputed name->centroid map; use as fallback when ISO-2 missing in static table
  const containerRef = useRef<HTMLDivElement | null>(null);
  const refitCameraRef = useRef<() => void>(() => {});

  // Load Country Polygons with LOD
  useEffect(() => {
    // Auto low-power heuristic (no user toggle)
    const computeLowPower = () => {
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
        return prefersReduced || saveData || slowNet || (cores > 0 && cores <= 4) || (mem > 0 && mem <= 4) || (highDpr && cores > 0 && cores <= 4);
      } catch { return false; }
    };
    lowPowerRef.current = computeLowPower();
    // Fetch low-res data first for fast initial load
    fetch('//unpkg.com/world-atlas@2/countries-110m.json')
      .then(res => res.json())
      .then((countriesTopo) => {
        const lowResFeatures = topojson.feature(countriesTopo, countriesTopo.objects.countries);
        setCountriesLOD(prev => ({ ...prev, low: lowResFeatures as any }));
      })
      .catch(() => setCountriesLOD(prev => ({ ...prev, low: { features: [] } })));

    // Fetch high-res data in the background for zoom-in
    fetch('//unpkg.com/world-atlas@2/countries-50m.json')
      .then(res => res.json())
      .then((countriesTopo) => {
        const highResFeatures = topojson.feature(countriesTopo, countriesTopo.objects.countries);
        setCountriesLOD(prev => ({ ...prev, high: highResFeatures as any }));
      })
      .catch(() => setCountriesLOD(prev => ({ ...prev, high: { features: [] } })));
  }, []);

  // Create multi-layer polygon data for a solid fill effect
  const polygonsData = useMemo(() => {
    const activeCountries = countriesLOD[currentLOD];
    if (!activeCountries || !activeCountries.features.length) return [];
    
    const topLayer = activeCountries.features.map(f => ({ ...f, properties: { ...f.properties, layer: 'top' } }));
    const bottomLayer = activeCountries.features.map(f => ({ ...f, properties: { ...f.properties, layer: 'bottom' } }));
    
    return [...topLayer, ...bottomLayer];
  }, [countriesLOD, currentLOD]);

  // Build centroids table from low LOD once available
  useEffect(() => {
    try {
      const low = countriesLOD.low;
      if (!low || !low.features || !low.features.length) return;
      const map = new Map<string, { lat: number; lng: number }>();
      for (const f of low.features) {
        const name = f?.properties?.name as string | undefined;
        if (!name) continue;
        const [lng, lat] = geoCentroid(f);
        map.set(name, { lat, lng });
      }
      countryCentroidsRef.current = map;
    } catch {}
  }, [countriesLOD.low]);

  // ISO-2 → English country name resolver (for fallback)
  const getCountryNameFromIso2 = (code: string): string | null => {
    try {
      const DN = (Intl as any).DisplayNames;
      if (!DN) return null;
      const r = new DN(['en'], { type: 'region' }) as { of: (c: string) => string };
      const name = r.of(code);
      return typeof name === 'string' ? name : null;
    } catch { return null; }
  };

  // Resolve lat/lng for a given ISO-2, using static table first, then TopoJSON centroid by name, else (0,0)
  const resolveLatLngForCode = (cc: string): [number, number] => {
    const t = countryCodeToLatLng[cc];
    if (t) return t;
    const name = getCountryNameFromIso2(cc);
    if (name) {
      const exact = countryCentroidsRef.current.get(name);
      if (exact) return [exact.lat, exact.lng];
      // Loose match (handles variations like "United States" vs "United States of America")
      const upper = name.toUpperCase();
      for (const [k, v] of countryCentroidsRef.current.entries()) {
        const ku = k.toUpperCase();
        if (ku.includes(upper) || upper.includes(ku)) return [v.lat, v.lng];
      }
    }
    return [0, 0];
  };

  // Points for rendering (no clustering): deterministic positions computed at load
  const displayPoints = useMemo<PointData[]>(() => {
    const pts: PointData[] = nodesData.map(n => ({ id: n.id, lat: n.lat, lng: n.lng, size: n.size, color: n.color }));
    if (startNode) pts.push({ lat: startNode.lat, lng: startNode.lng, size: Math.max(0.26, (startNode.size || 0.20) + 0.06), color: 'rgba(255, 255, 0, 0.9)' });
    return pts;
  }, [nodesData, startNode]);


  // Create more translucent globe material
  const globeMaterial = useMemo(() => {
    return new THREE.MeshPhongMaterial({
      color: '#a8c5cd', // Light blue for ocean
      opacity: 0.6, // 40% transparent for a more glass-like appearance
        transparent: true,
    });
  }, []);

  const paperTexture = useMemo(() => createPaperTexture(), []);

  // Deterministic jitter helpers
  const hashString = (s: string): number => {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  };
  const mulberry32 = (seed: number) => {
    return () => {
      let t = (seed += 0x6D2B79F5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  const seededJitterAround = (lat: number, lng: number, id: string): [number, number] => {
    const seed = hashString(id);
    const rnd = mulberry32(seed);
    const angle = rnd() * Math.PI * 2;
    const r = 0.18 + rnd() * 0.12; // 0.18°..0.30°
    const dLat = r * Math.sin(angle);
    const dLng = r * Math.cos(angle) / Math.max(0.5, Math.cos(lat * Math.PI / 180));
    const jLat = Math.max(-85, Math.min(85, lat + dLat));
    const jLng = ((lng + dLng + 540) % 360) - 180;
    return [jLat, jLng];
  };

  const createPaperBoatGeometry = () => {
    const geometry = new THREE.BufferGeometry();
    const vertices = new Float32Array([
      // z-axis is forward
      0, 0.25, 1,    // 0: front tip of sail
      0, -0.25, 1,   // 1: front tip of hull
      -0.5, -0.25, -1, // 2: left rear of hull
      0.5, -0.25, -1,  // 3: right rear of hull
      0, 0.75, -0.5,   // 4: top rear of sail
    ]);
    const indices = [
      1, 3, 2, // bottom
      0, 1, 2, // left hull side
      0, 2, 4, // left sail side
      0, 3, 1, // right hull side
      0, 4, 3, // right sail side
      2, 3, 4, // back sail
    ];
    geometry.setIndex(indices);
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.computeVertexNormals();
    return geometry;
  };

  // --- DB mapping: auto-generate nodes/links from API ---
  type GlobeNode = { id: string; name: string; countryCode: string; createdAt: string };
  type GlobeLink = { source: string; target: string };
  const countryCodeToLatLng: Record<string, [number, number]> = {
    US: [39.7837304, -100.445882], CA: [61.0666922, -107.991707], GB: [54.7023545, -3.2765753], IN: [22.3511148, 78.6677428],
    DE: [51.1638175, 10.4478313], FR: [46.603354, 1.8883335], ES: [39.3260685, -4.8379791], IT: [42.6384261, 12.674297],
    BR: [-10.3333333, -53.2], AR: [-34.9964963, -64.9672817], AU: [-24.7761086, 134.755], JP: [36.5748441, 139.2394179],
    CN: [35.000074, 104.999927], SG: [1.357107, 103.8194992], ZA: [-28.8166236, 24.991639], KE: [-0.1768696, 37.9083264],
    NG: [9.6000359, 7.9999721], MX: [23.6585116, -102.0077097], RU: [64.6863136, 97.7453061], TR: [39.0616, 35.1623],
  };
  // Deprecated random jitter (avoid non-determinism). Use seededJitterAround instead.
  const fetchGlobeData = async (filter: 'all' | '30d' | '7d' = 'all'): Promise<{ nodes: GlobeNode[]; links: GlobeLink[] }> => {
    const guessedBase = (typeof window !== 'undefined' ? window.location.origin : '') || 'https://riverflowseshaan.vercel.app';
    const base = guessedBase.replace(/\/$/, '');
    const url = `${base}/api/globe?filter=${encodeURIComponent(filter)}`;
    const resp = await fetch(url, { headers: { 'Content-Type': 'application/json' } });
    if (!resp.ok) throw new Error(`globe api failed: ${resp.status}`);
    const json = await resp.json();
    return { nodes: json?.nodes || [], links: json?.links || [] };
  };
  const fetchMeSafe = async (): Promise<{ id: string | null; name: string | null } | null> => {
    try {
      const guessedBase = (typeof window !== 'undefined' ? window.location.origin : '') || '';
      if (!guessedBase) return null;
      const base = guessedBase.replace(/\/$/, '');
      const email = (window as any)?.RIVER_EMAIL || null;
      if (!email) return null;
      const resp = await fetch(`${base}/api/me`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
      if (!resp.ok) return null;
      const j = await resp.json();
      const ref = j?.me?.referral_code || j?.me?.ref_code_8 || null;
      const name = j?.me?.name || null;
      return { id: ref || null, name };
    } catch { return null; }
  };
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [{ nodes, links }, me] = await Promise.all([fetchGlobeData('all'), fetchMeSafe()]);
        if (cancelled) return;
        myIdRef.current = me?.id || null;
        try { myFirstNameRef.current = ((me?.name || '').trim().split(/\s+/)[0] || ''); } catch { myFirstNameRef.current = ''; }
        const conn = new Set<string>();
        if (myIdRef.current) {
          links.forEach(l => { if (l.source === myIdRef.current) conn.add(l.target); if (l.target === myIdRef.current) conn.add(l.source); });
        }
        myConnectionsRef.current = conn;
        const nodeMap = new Map<string, NodeData>();
        nodes.forEach(n => {
          const cc = (n.countryCode || '').toUpperCase();
          const base = resolveLatLngForCode(cc);
          const [lat, lng] = seededJitterAround(base[0], base[1], n.id);
          nodeMap.set(n.id, { id: n.id, lat, lng, size: 0.20, color: 'rgba(255,255,255,0.95)', countryCode: cc, name: n.name || null });
        });
        setNodesData(Array.from(nodeMap.values()));
        const arcs: ArcData[] = [];
        links.forEach(l => {
          const a = nodeMap.get(l.source);
          const b = nodeMap.get(l.target);
          if (!a || !b) return;
          arcs.push({ startLat: a.lat, startLng: a.lng, endLat: b.lat, endLng: b.lng, startId: a.id, endId: b.id });
        });
        setArcsData(arcs);
      } catch {
        if (!cancelled) { setNodesData([]); setArcsData([]); }
      }
    })();
    return () => { cancelled = true; };
  }, []);
  const paperBoatGeometry = useMemo(() => createPaperBoatGeometry(), []);

  // Helper: create or retrieve a node for a given polygon (country)
  const getOrCreateNodeForPolygon = (polygon: any): NodeData => {
    const name: string = polygon?.properties?.name || `node-${nodesData.length + 1}`;
    const geoId = `geo:${name}`;
    const existing = nodesData.find(n => n.id === geoId);
    if (existing) return existing;
    const [lng, lat] = geoCentroid(polygon);
    const node: NodeData = {
      id: geoId,
      lat,
      lng,
      size: 0.20,
      color: 'rgba(255,255,255,0.95)'
    };
    setNodesData(prev => [...prev, node]);
    return node;
  };

  // Handler for clicking on a country (now node→node arcs)
  const handlePolygonClick = (polygon: any) => {
    const node = getOrCreateNodeForPolygon(polygon);

    if (!startNode) {
      // First click: choose start node
      setStartNode(node);
    } else {
      // Second click: connect start node to this node, then clear selection
      const newArc = { startLat: startNode.lat, startLng: startNode.lng, endLat: node.lat, endLng: node.lng, startId: startNode.id, endId: node.id };
      setArcsData(prevArcs => [...prevArcs, newArc]);

      // Create and animate a boat
      const globe = globeEl.current;
      const scene = sceneRef.current;
      if (globe && scene && !lowPowerRef.current) {
        const ARC_ALTITUDE = 0.2; // Peak altitude for the arc
        const BOAT_PATH_ALTITUDE = 0.07; // Altitude over landmass, should be > polygon max altitude (0.06)
        const GLOBE_RADIUS = 100;

        const startCoords = globe.getCoords(startNode.lat, startNode.lng);
        const endCoords = globe.getCoords(node.lat, node.lng);

        const startVec = new THREE.Vector3(startCoords.x, startCoords.y, startCoords.z);
        const endVec = new THREE.Vector3(endCoords.x, endCoords.y, endCoords.z);
        
        // Elevate start and end points to avoid clipping through land
        startVec.normalize().multiplyScalar(GLOBE_RADIUS * (1 + BOAT_PATH_ALTITUDE));
        endVec.normalize().multiplyScalar(GLOBE_RADIUS * (1 + BOAT_PATH_ALTITUDE));

        const midPoint = new THREE.Vector3().addVectors(startVec, endVec).multiplyScalar(0.5);
        const midAltitude = GLOBE_RADIUS * (1 + ARC_ALTITUDE);
        midPoint.normalize().multiplyScalar(midAltitude);

        const curve = new THREE.CatmullRomCurve3([startVec, midPoint, endVec]);
        
        const boatMaterial = new THREE.MeshPhongMaterial({
          map: paperTexture,
          color: 0xffffff,
          shininess: 5,
          specular: 0x111111,
        });
        const boatMesh = new THREE.Mesh(paperBoatGeometry, boatMaterial);
        boatMesh.scale.set(6, 6, 6);
        
        const boatId = Date.now() + Math.random();
        // Cap total animated boats to 1: replace existing if present
        if (boatsRef.current.length >= 1) {
          try {
            const old = boatsRef.current.shift();
            if (old && sceneRef.current) {
              sceneRef.current.remove(old.mesh);
            }
          } catch {}
        }
        boatsRef.current.push({
            id: boatId,
            mesh: boatMesh,
            curve: curve,
            startTime: performance.now(),
            duration: 15000, // 15 seconds travel time
        });
        
        scene.add(boatMesh);
      }
      
      setStartNode(null); // Reset for the next arc
    }
  };

  // Helper: project lat/lng to screen space
  const projectLatLng = (lat: number, lng: number): { x: number; y: number } | null => {
    try {
      const globe = globeEl.current; if (!globe) return null;
      const cam = globe.camera();
      const c = globe.getCoords(lat, lng); if (!c) return null;
      const v = new THREE.Vector3(c.x, c.y, c.z);
      v.project(cam);
      const rect = globe.renderer()?.domElement?.getBoundingClientRect?.() || { width: window.innerWidth, height: window.innerHeight } as any;
      const x = (v.x * 0.5 + 0.5) * rect.width;
      const y = (-v.y * 0.5 + 0.5) * rect.height;
      return { x, y };
    } catch { return null; }
  };

  // Project only if the point is on the camera-facing side of the globe
  const projectLatLngIfFront = (lat: number, lng: number): { x: number; y: number } | null => {
    try {
      const globe = globeEl.current; if (!globe) return null;
      const cam = globe.camera();
      const c = globe.getCoords(lat, lng); if (!c) return null;
      const world = new THREE.Vector3(c.x, c.y, c.z);
      const dot = world.clone().normalize().dot(cam.position.clone().normalize());
      if (dot <= 0) return null;
      const v = world.project(cam);
      const rect = globe.renderer()?.domElement?.getBoundingClientRect?.() || { width: window.innerWidth, height: window.innerHeight } as any;
      const x = (v.x * 0.5 + 0.5) * rect.width;
      const y = (-v.y * 0.5 + 0.5) * rect.height;
      return { x, y };
    } catch { return null; }
  };

  // No clustering: we keep deterministic node positions and original arc endpoints

  // Handler for clicking on the globe (ocean)
  const handleGlobeClick = () => {
    setStartNode(null);
  };

  const onGlobeReady = () => {
    if (!globeEl.current) return;
    
    sceneRef.current = globeEl.current.scene();
    const controls = globeEl.current.controls();
    const camera = globeEl.current.camera();
    const renderer = globeEl.current.renderer?.();

    // LOD switching based on zoom
    const ZOOM_LOD_THRESHOLD = 220;

    const handleZoom = () => {
      const distance = camera.position.length();
      // Use ref to get latest state in event listener closure
      if (distance < ZOOM_LOD_THRESHOLD && countriesLODRef.current.high.features.length > 0) {
        setCurrentLOD('high');
      } else {
        setCurrentLOD('low');
      }
      // Update zoom scale for node sizing (no re-layout)
      try {
        const ratio = Math.max(0.0001, baselineDistanceRef.current / distance);
        const raw = Math.min(2.0, Math.max(0.6, 0.85 + 0.55 * ratio));
        // Quantize to 0.1 steps to reduce re-renders
        const quant = Math.round(raw * 10) / 10;
        setZoomScale(prev => (Math.abs((prev ?? 0) - quant) >= 0.05 ? quant : prev));
      } catch {}
      try { scheduleOverlayUpdate(); } catch {}
    };

    controls.addEventListener('change', handleZoom);

    // Configure controls
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.25;

    // Enable and configure zoom for LOD
    controls.enableZoom = true;

    // Fit globe at zoom = 1 (no clipping) and center — consider both vertical and horizontal FOV
    const getFitDistance = () => {
      try {
        const vFov = (camera.fov || 75) * Math.PI / 180; // vertical FOV in radians
        const canvas = renderer?.domElement as HTMLCanvasElement | undefined;
        const rect = canvas?.getBoundingClientRect?.();
        const aspect = rect && rect.height > 0 ? (rect.width / rect.height) : (camera.aspect || 1);
        // Account for maximum rendered altitude (points ~0.201, arcs ~0.2, polygons ~0.06)
        const R = 100 * (1 + 0.22);
        const margin = 1.15; // extra padding to avoid top/side cropping
        const dV = (R * margin) / Math.tan(vFov / 2);
        const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
        const dH = (R * margin) / Math.tan(hFov / 2);
        const d = Math.max(dV, dH);
        return Math.max(d, (100 * 1.3));
      } catch { return camera.position.length(); }
    };
    // Robust camera/frustum defaults
    camera.near = 0.1;
    camera.far = 5000;
    camera.updateProjectionMatrix();

    const fitD = getFitDistance();
    controls.target.set(0, 0, 0);
    camera.position.set(0, 0, fitD);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    baselineDistanceRef.current = fitD;
    controls.maxDistance = fitD;                 // max zoom-out locked to baseline
    controls.minDistance = Math.max(fitD / 3, 80); // ~3× max zoom-in bound
    try { controls.addEventListener('start', () => { hasInteractedRef.current = true; }); } catch {}
    controls.screenSpacePanning = false;

    // Cap DPR for perf; keep crispness on HiDPI
    try { renderer?.setPixelRatio?.(Math.min(1.75, (window.devicePixelRatio || 1))); } catch {}

    // Add ambient light to the scene
    const scene = globeEl.current.scene();
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    // Add starfield
    const starGeometry = new THREE.BufferGeometry();
    const starVertices = [] as number[];
    const starRadius = 1500; // Large radius for the star sphere

    for (let i = 0; i < 10000; i++) {
        const u = Math.random();
        const v = Math.random();
        
        const theta = 2 * Math.PI * u; // Longitude
        const phi = Math.acos(2 * v - 1); // Latitude

        const x = starRadius * Math.sin(phi) * Math.cos(theta);
        const y = starRadius * Math.sin(phi) * Math.sin(theta);
        const z = starRadius * Math.cos(phi);

        starVertices.push(x, y, z);
    }
    starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starVertices, 3));
    const starMaterial = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 0.7,
        transparent: true,
        opacity: 0.8
    });
    if (!lowPowerRef.current) {
      const stars = new THREE.Points(starGeometry, starMaterial);
      scene.add(stars);
    }

    // Initial zoom check and one-shot recenter after first render
    handleZoom();
    try {
      requestAnimationFrame(() => {
        if (!globeEl.current) return;
        if (!hasInteractedRef.current) {
          controls.target.set(0, 0, 0);
          camera.position.set(0, 0, getFitDistance());
          camera.lookAt(0, 0, 0);
          camera.updateProjectionMatrix();
        }
      });
    } catch {}

    // Responsive refit: preserve current zoom ratio on container/FOV changes
    let resizeTimer: number | null = null;
    const refitCamera = () => {
      try {
        if (!globeEl.current) return;
        const newFit = getFitDistance();
        const prevFit = baselineDistanceRef.current || newFit;
        const dist = camera.position.length();
        const ratio = Math.max(0.0001, dist / prevFit);
        baselineDistanceRef.current = newFit;
        controls.maxDistance = newFit;
        controls.minDistance = Math.max(newFit / 3, 80);
        if (!hasInteractedRef.current) {
          // Hard recenter when user hasn't interacted yet
          controls.target.set(0, 0, 0);
          camera.position.set(0, 0, newFit * ratio);
          camera.lookAt(0, 0, 0);
        } else {
          const dir = camera.position.clone().normalize();
          const newPos = dir.multiplyScalar(newFit * ratio);
          camera.position.copy(newPos);
        }
        camera.updateProjectionMatrix();
        handleZoom();
      } catch {}
    };
    refitCameraRef.current = refitCamera;
    const onResize = () => {
      if (resizeTimer) window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => { refitCamera(); try { renderer?.setPixelRatio?.(Math.min(1.75, (window.devicePixelRatio || 1))); } catch {} }, 150) as unknown as number;
    };
    try { window.addEventListener('resize', onResize); } catch {}
    try { controls.addEventListener('change', () => scheduleOverlayUpdate()); } catch {}
  };

  // Observe container/renderer size changes to keep fit accurate beyond window resizes
  useEffect(() => {
    let ro: ResizeObserver | null = null;
    try {
      const attach = () => {
        const renderer = globeEl.current?.renderer?.();
        const targets: Element[] = [];
        if (containerRef.current) targets.push(containerRef.current);
        if (renderer?.domElement) targets.push(renderer.domElement);
        if (targets.length === 0) return;
        ro = new ResizeObserver(() => { try { refitCameraRef.current(); } catch {} });
        targets.forEach(t => ro!.observe(t));
      };
      // Defer attach to allow onGlobeReady to run
      const id = window.setTimeout(attach, 0);
      return () => { window.clearTimeout(id); try { ro?.disconnect(); } catch {} };
    } catch {
      return () => {};
    }
  }, []);
  
  // Animation loop for boats (skip on low-power)
  useEffect(() => {
    if (lowPowerRef.current) return () => {};
    let animationFrameId: number;
    const animateBoats = () => {
      const now = performance.now();

      boatsRef.current.forEach(boat => {
        const elapsedTime = now - boat.startTime;
        // Use modulo to create a continuous loop
        const progress = (elapsedTime / boat.duration) % 1.0;

        const newPos = boat.curve.getPointAt(progress);
        boat.mesh.position.copy(newPos);

        // Orientation
        const tangent = boat.curve.getTangentAt(progress);
        const lookAtPos = newPos.clone().add(tangent);
        boat.mesh.up.copy(newPos).normalize();
        boat.mesh.lookAt(lookAtPos);
      });

      animationFrameId = requestAnimationFrame(animateBoats);
    };

    animateBoats();

    return () => {
      cancelAnimationFrame(animationFrameId);
      if (sceneRef.current) {
        boatsRef.current.forEach(boat => sceneRef.current!.remove(boat.mesh));
      }
      boatsRef.current = [];
    };
  }, []);

  const handlePolygonHover = (feature: any | null) => {
    setHoveredCountry(feature);

    if (feature) {
      setTooltipContent(feature.properties.name);
      setIsTooltipVisible(true);
    } else {
      setIsTooltipVisible(false);
    }
  };

  // Throttle tooltip updates to ~15fps
  const tooltipRefPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const rafPendingRef = useRef<boolean>(false);
  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    tooltipRefPos.current = { x: event.clientX, y: event.clientY };
    if (rafPendingRef.current) return;
    rafPendingRef.current = true;
    requestAnimationFrame(() => {
      rafPendingRef.current = false;
      setTooltipPosition(tooltipRefPos.current);
    });
  };

  // Compute the small overlay set (self + up to 5 friends) whenever nodes change
  useEffect(() => {
    try {
      const max = 6;
      const result: NodeData[] = [];
      const byId = new Map<string, NodeData>();
      nodesData.forEach(n => byId.set(n.id, n));
      const meId = myIdRef.current;
      if (meId && byId.has(meId)) result.push(byId.get(meId)!);
      for (const id of Array.from(myConnectionsRef.current.values())) {
        if (result.length >= max) break;
        const n = byId.get(id);
        if (n) result.push(n);
      }
      setOverlayNodes(result.slice(0, max));
      // schedule position update after DOM paints
      requestAnimationFrame(() => scheduleOverlayUpdate());
    } catch {}
  }, [nodesData]);

  // Imperatively update overlay positions on RAF, tied to controls/resize
  const scheduleOverlayUpdate = () => {
    if (overlayUpdatePendingRef.current) return;
    overlayUpdatePendingRef.current = true;
    requestAnimationFrame(() => {
      overlayUpdatePendingRef.current = false;
      try {
        const globe = globeEl.current; if (!globe) return;
        overlayNodes.forEach(n => {
          const el = overlayRefs.current.get(n.id);
          if (!el) return;
          const px = projectLatLngIfFront(n.lat, n.lng);
          if (!px) { el.style.opacity = '0'; return; }
          el.style.left = `${px.x}px`;
          el.style.top = `${px.y}px`;
          el.style.opacity = '1';
        });
      } catch {}
    });
  };

  // Container with explicit size and dark background for space theme
  const containerStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    background: '#000010',
    position: 'relative',
    overflow: 'hidden'
  };

  const tooltipStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${tooltipPosition.x + 15}px`,
    top: `${tooltipPosition.y + 15}px`,
    backgroundColor: 'rgba(40, 40, 40, 0.85)',
    color: 'white',
    padding: '5px 10px',
    borderRadius: '5px',
    fontFamily: "'Roboto Mono', monospace",
    fontSize: '1rem',
    pointerEvents: 'none',
    zIndex: 10,
    whiteSpace: 'nowrap',
    transition: 'opacity 0.2s ease-in-out',
    opacity: isTooltipVisible ? 1 : 0,
  };

  // Screen-reader summary: people, countries, connections
  useEffect(() => {
    const update = () => {
      try {
        const users = nodesData.length;
        const countries = (() => { const s = new Set<string>(); nodesData.forEach(n => { if (n.countryCode) s.add((n.countryCode || '').toUpperCase()); }); return s.size; })();
        const connections = arcsData.length;
        setSrSummary(`Dream River globe: ${users} people across ${countries} countries with ${connections} connections.`);
      } catch {}
    };
    update();
    const onFocus = () => update();
    try { window.addEventListener('focus', onFocus); } catch {}
    return () => { try { window.removeEventListener('focus', onFocus); } catch {} };
  }, [nodesData, arcsData]);

  return (
    <div ref={containerRef} style={containerStyle} onMouseMove={handleMouseMove} role="region" aria-label={ariaLabel} aria-describedby={describedById} tabIndex={tabIndex as number | undefined}>
      <div aria-live="polite" role="status" style={{ position: 'absolute', left: -9999, top: 'auto', width: 1, height: 1, overflow: 'hidden' as unknown as any }}>
        {srSummary}
            </div>
      <div style={tooltipStyle}>
        {tooltipContent}
        </div>
      <ReactGlobe
        ref={globeEl}
        onGlobeReady={onGlobeReady}
        backgroundColor="#000010"
        globeMaterial={globeMaterial}
        // Atmosphere
        atmosphereColor="#66c2ff"
        atmosphereAltitude={0.25}
        // Arcs: no motion (static), but face-aware + priority color alpha
        arcsData={arcsData}
        arcColor={useCallback((d: any) => {
          try {
            const globe = globeEl.current; if (!globe) return 'rgba(102, 194, 255, 0.8)';
            const midLat = (d.startLat + d.endLat) / 2;
            const midLng = (d.startLng + d.endLng) / 2;
            const c = globe.getCoords(midLat, midLng); if (!c) return 'rgba(102, 194, 255, 0.8)';
            const cam = globe.camera();
            const world = new THREE.Vector3(c.x, c.y, c.z);
            const dot = world.clone().normalize().dot(cam.position.clone().normalize());
            const isPri = !!(d.startId && (d.startId === myIdRef.current || myConnectionsRef.current.has(d.startId))) || !!(d.endId && (d.endId === myIdRef.current || myConnectionsRef.current.has(d.endId)));
            const base = '102, 194, 255';
            const alpha = dot >= 0 ? (isPri ? 0.95 : 0.8) : (isPri ? 0.35 : 0.12);
            return `rgba(${base}, ${alpha})`;
          } catch { return 'rgba(102, 194, 255, 0.8)'; }
        }, [])}
        arcStroke={2}
        arcAltitude={0.2}
        arcDashLength={1}
        arcDashGap={0}
        arcDashAnimateTime={0}
        arcCircularResolution={24}
        // Points: nodes or cluster hubs
        pointsData={displayPoints}
        pointAltitude={0.201} // Set just above the arc altitude
        pointRadius={useCallback((d: any) => (d?.size || 0.20) * zoomScale, [zoomScale])}
        pointColor={useCallback((d: any) => d?.color || 'rgba(255,255,255,0.95)', [])}
        pointsMerge={true}
        pointsTransitionDuration={0}
        // Countries styled as continents
        polygonsData={polygonsData}
        polygonCapColor={useCallback((feat: any) => {
          const name = hoveredCountry?.properties?.name as string | undefined;
          const isHovered = !!name && feat.properties.name === name;
          if (feat.properties.layer === 'bottom') return '#7C4A33';
          return isHovered ? '#B56B45' : '#DCA87E';
        }, [hoveredCountry])}
        polygonSideColor={useCallback((feat: any) => (feat.properties.layer === 'bottom' ? 'transparent' : '#7C4A33'), [])}
        polygonStrokeColor={() => 'transparent'} // Hide borders
        polygonAltitude={useCallback((feat: any) => {
          if (feat.properties.layer === 'bottom') {
            return 0.001;
          }
          const name = hoveredCountry?.properties?.name as string | undefined;
          const isHovered = !!name && feat.properties.name === name;
          return isHovered ? 0.06 : 0.04;
        }, [hoveredCountry])}
        polygonsTransitionDuration={300}
        // Interaction
        onGlobeClick={handleGlobeClick}
        onPolygonClick={handlePolygonClick}
        onPolygonHover={handlePolygonHover}
      />
      {/* User glow and labels rendered via DOM overlay (capped to 6) */}
      {overlayNodes.map((p, i) => {
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
            {isMe && (
              <div style={{ width: 32, height: 32, borderRadius: '50%', boxShadow: '0 0 18px 8px rgba(42,167,181,0.35)' }} />
            )}
            <div className="font-seasons" style={{ position: 'absolute', left: '50%', top: 18, transform: 'translate(-50%, 0)', color: 'var(--ink, #e6e6e6)', fontSize: 12, fontWeight: 600, textShadow: '0 1px 2px rgba(0,0,0,0.25)' }}>
              {isMe ? (myFirstNameRef.current || '') : (p.name ? String(p.name).split(/\s+/)[0]?.[0]?.toUpperCase() : '')}
            </div>
          </div>
        );
      })}
      {/* No cluster labels (clustering removed) */}
        </div>
  );
};

export default Globe;

