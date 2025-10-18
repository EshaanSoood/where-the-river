"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  const [renderArcs, setRenderArcs] = useState<ArcData[]>([]);
  const [nodesData, setNodesData] = useState<NodeData[]>([]);
  const [renderNodes, setRenderNodes] = useState<PointData[]>([]);
  // Logged-in user + connections (from DB)
  const myIdRef = useRef<string | null>(null);
  const myFirstNameRef = useRef<string>("");
  const myConnectionsRef = useRef<Set<string>>(new Set());
  const reservedPosRef = useRef<Map<string, { lat: number; lng: number }>>(new Map());
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

  // Combine persistent points with the temporary start point for rendering
  const displayPoints = useMemo<PointData[]>(() => {
    const pts: PointData[] = renderNodes.length ? renderNodes : nodesData.map(n => ({ lat: n.lat, lng: n.lng, size: n.size, color: n.color }));
    if (startNode) pts.push({ lat: startNode.lat, lng: startNode.lng, size: Math.max(0.26, (startNode.size || 0.20) + 0.06), color: 'rgba(255, 255, 0, 0.9)' });
    return pts;
  }, [renderNodes, nodesData, startNode]);


  // Create more translucent globe material
  const globeMaterial = useMemo(() => {
    return new THREE.MeshPhongMaterial({
      color: '#a8c5cd', // Light blue for ocean
      opacity: 0.6, // 40% transparent for a more glass-like appearance
      transparent: true,
    });
  }, []);

  const paperTexture = useMemo(() => createPaperTexture(), []);

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
  const jitterLatLng = (lat: number, lng: number, magnitudeDeg = 2.0): [number, number] => {
    const r1 = (Math.random() - 0.5) * magnitudeDeg;
    const r2 = (Math.random() - 0.5) * magnitudeDeg;
    const jLat = Math.max(-85, Math.min(85, lat + r1));
    const jLng = ((lng + r2 + 540) % 360) - 180;
    return [jLat, jLng];
  };
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
          const [lat, lng] = jitterLatLng(base[0], base[1], 2.0);
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

  // Recompute clustering and reroute arcs to cluster hubs without breaking chains
  useEffect(() => {
    try {
      const globe = globeEl.current; if (!globe) return;
      const cam = globe.camera();
      const dist = cam.position.length();
      const ratio = Math.max(0.0001, baselineDistanceRef.current / dist);
      const buckets = [1.0,1.2,1.4,1.6,1.8,2.0,2.2,2.4];
      const pick = buckets.reduce((acc, b) => (Math.abs(b - ratio) < Math.abs(acc - ratio) ? b : acc), buckets[0]);
      const byCountry = new Map<string, NodeData[]>();
      nodesData.forEach(n => {
        const key = (n.countryCode || '__unknown__').toUpperCase();
        if (!byCountry.has(key)) byCountry.set(key, []);
        byCountry.get(key)!.push(n);
      });
      const nextPoints: PointData[] = [];
      const clusterPos = new Map<string, { lat: number; lng: number }>();
      const minSpacingPx = 12;
      const reserved = myConnectionsRef.current;
      const myId = myIdRef.current;
      reservedPosRef.current.clear();
      byCountry.forEach((arr, cc) => {
        const centroid = (() => {
          const base = resolveLatLngForCode(cc);
          if (base) return { lat: base[0], lng: base[1] };
          return (arr[0] ? { lat: arr[0].lat, lng: arr[0].lng } : null);
        })();
        if (!centroid) return;
        const c0 = projectLatLng(centroid.lat, centroid.lng);
        const c1 = projectLatLng(centroid.lat, Math.min(179.999, centroid.lng + 1));
        let r = 10;
        if (c0 && c1) {
          const dx = Math.hypot(c1.x - c0.x, c1.y - c0.y);
          r = Math.max(10, dx * 0.45 * pick);
        }
        const pixelBudget = 2 * Math.PI * r; // circumference approximation
        const cap = Math.max(4, Math.floor(pixelBudget / minSpacingPx));
        const priority = arr.filter(n => n.id === myId || reserved.has(n.id));
        const others = arr.filter(n => !(n.id === myId || reserved.has(n.id)));
        // Always show priority nodes, jittered uniquely; if a cluster exists here, push them farther out
        const clusterHere = (others.length + priority.length) > cap;
        const ampDeg = clusterHere ? 0.6 : 0.2;
        priority.forEach((n, i) => {
          const angle = (i / Math.max(1, priority.length)) * Math.PI * 2;
          const dLat = ampDeg * Math.sin(angle);
          const dLng = ampDeg * Math.cos(angle) / Math.max(0.5, Math.cos(centroid.lat * Math.PI / 180));
          const isMe = n.id === myId;
          const color = isMe ? '#2AA7B5' : '#135E66';
          const size = isMe ? 0.26 : Math.max(0.22, n.size);
          nextPoints.push({ id: n.id, lat: centroid.lat + dLat, lng: centroid.lng + dLng, size, color, kind: 'node' });
          reservedPosRef.current.set(n.id, { lat: centroid.lat + dLat, lng: centroid.lng + dLng });
        });
        // Remaining budget for others
        if (clusterHere) {
          const clusterSizePx = 0.3 * pixelBudget;
          const size = Math.min(0.6, 0.20 + clusterSizePx / 400);
          nextPoints.push({ lat: centroid.lat, lng: centroid.lng, size, color: 'rgba(255,255,255,0.95)', kind: 'cluster', label: `${others.length} people listening.` });
          clusterPos.set(cc, { lat: centroid.lat, lng: centroid.lng });
        } else {
          others.forEach((n, i) => {
            const angle = (i / Math.max(1, others.length)) * Math.PI * 2 + Math.PI / 4;
            const dLat = ampDeg * Math.sin(angle);
            const dLng = ampDeg * Math.cos(angle) / Math.max(0.5, Math.cos(centroid.lat * Math.PI / 180));
            nextPoints.push({ id: n.id, lat: centroid.lat + dLat, lng: centroid.lng + dLng, size: n.size, color: n.color, kind: 'node' });
          });
        }
      });
      setRenderNodes(nextPoints);
      // Reroute arcs: if endpoint country clustered, snap to cluster hub
      const idToCc = new Map<string, string>();
      nodesData.forEach(n => { if (n.id && n.countryCode) idToCc.set(n.id, (n.countryCode || '').toUpperCase()); });
      const routed = arcsData.map(a => {
        const sReserved = reservedPosRef.current.get(a.startId);
        const eReserved = reservedPosRef.current.get(a.endId);
        const sCc = idToCc.get(a.startId) || '';
        const eCc = idToCc.get(a.endId) || '';
        const sPos = sReserved || clusterPos.get(sCc) || { lat: a.startLat, lng: a.startLng };
        const ePos = eReserved || clusterPos.get(eCc) || { lat: a.endLat, lng: a.endLng };
        return { ...a, startLat: sPos.lat, startLng: sPos.lng, endLat: ePos.lat, endLng: ePos.lng };
      });
      setRenderArcs(routed);
    } catch {}
  }, [nodesData, arcsData]);

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
    };

    controls.addEventListener('change', handleZoom);

    // Configure controls
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.25;

    // Enable and configure zoom for LOD
    controls.enableZoom = true;

    // Fit globe at zoom = 1 (no clipping) and center — matches GlobeRG
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
    controls.maxDistance = fitD;                 // max zoom-out locked to baseline
    controls.minDistance = Math.max(fitD / 3, 80); // ~3× max zoom-in bound
    try { controls.addEventListener('start', () => { hasInteractedRef.current = true; }); } catch {}

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

    // Initial zoom check
    handleZoom();

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
        const dir = camera.position.clone().normalize();
        const newPos = dir.multiplyScalar(newFit * ratio);
        camera.position.copy(newPos);
        camera.updateProjectionMatrix();
        handleZoom();
      } catch {}
    };
    const onResize = () => {
      if (resizeTimer) window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => { refitCamera(); try { renderer?.setPixelRatio?.(Math.min(1.75, (window.devicePixelRatio || 1))); } catch {} }, 150) as unknown as number;
    };
    try { window.addEventListener('resize', onResize); } catch {}
  };
  
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

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    setTooltipPosition({ x: event.clientX, y: event.clientY });
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
    <div style={containerStyle} onMouseMove={handleMouseMove} role="region" aria-label={ariaLabel} aria-describedby={describedById} tabIndex={tabIndex as number | undefined}>
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
        // Arcs (node→node, routed via clusters when applicable)
        arcsData={renderArcs.length ? renderArcs : arcsData}
        arcColor={() => 'rgba(102, 194, 255, 0.8)'}
        arcStroke={2}
        arcAltitude={0.2}
        arcDashLength={0.4}
        arcDashGap={0.15}
        arcDashAnimateTime={2500}
        arcCircularResolution={64}
        // Points: nodes or cluster hubs
        pointsData={displayPoints}
        pointAltitude={0.201} // Set just above the arc altitude
        pointRadius="size"
        pointColor={(d: any) => d?.color || 'rgba(255,255,255,0.95)'}
        pointsMerge={true}
        pointsTransitionDuration={0}
        // Countries styled as continents
        polygonsData={polygonsData}
        polygonCapColor={(feat: any) => {
          const isHovered = hoveredCountry && feat.properties.name === hoveredCountry.properties.name;
          if (feat.properties.layer === 'bottom') return '#7C4A33';
          return isHovered ? '#B56B45' : '#DCA87E';
        }}
        polygonSideColor={(feat: any) => (feat.properties.layer === 'bottom' ? 'transparent' : '#7C4A33')}
        polygonStrokeColor={() => 'transparent'} // Hide borders
        polygonAltitude={(feat: any) => {
          if (feat.properties.layer === 'bottom') {
            return 0.001; // Constant low altitude for the base to prevent z-fighting
          }
          const isHovered = hoveredCountry && feat.properties.name === hoveredCountry.properties.name;
          return isHovered ? 0.06 : 0.04; // Altitude for the top surface
        }}
        polygonsTransitionDuration={300}
        // Interaction
        onGlobeClick={handleGlobeClick}
        onPolygonClick={handlePolygonClick}
        onPolygonHover={handlePolygonHover}
      />
      {/* User glow and labels rendered via DOM overlay */}
      {renderNodes.map((p, i) => {
        if (!p.id) return null;
        const isMe = myIdRef.current && p.id === myIdRef.current;
        const isFriend = myConnectionsRef.current.has(p.id);
        if (!(isMe || isFriend)) return null;
        const px = projectLatLng(p.lat, p.lng);
        if (!px) return null;
        return (
          <div key={`ux-${i}`} style={{ position: 'absolute', left: px.x, top: px.y, transform: 'translate(-50%, -50%)', pointerEvents: 'none', zIndex: 60 }} aria-hidden="true">
            {isMe && (
              <div style={{ width: 32, height: 32, borderRadius: '50%', boxShadow: '0 0 18px 8px rgba(42,167,181,0.35)' }} />
            )}
            <div className="font-seasons" style={{ position: 'absolute', left: '50%', top: 18, transform: 'translate(-50%, 0)', color: 'var(--ink, #e6e6e6)', fontSize: 12, fontWeight: 600, textShadow: '0 1px 2px rgba(0,0,0,0.25)' }}>
              {isMe ? (myFirstNameRef.current || '') : ((p as any).name ? String((p as any).name).split(/\s+/)[0]?.[0]?.toUpperCase() : '')}
            </div>
          </div>
        );
      })}
      {/* Cluster labels under points: project to screen and position absolutely */}
      {renderNodes
        .filter(p => p.kind === 'cluster' && p.label)
        .map((p, i) => {
          const px = projectLatLng(p.lat, p.lng);
          if (!px) return null;
          return (
            <div key={i} style={{ position: 'absolute', left: px.x, top: px.y, transform: 'translate(-50%, 8px)', pointerEvents: 'none' }} aria-hidden="true">
              <span style={{ color: '#fff', fontFamily: 'sans-serif', fontSize: 12, textShadow: '0 1px 2px rgba(0,0,0,0.4)' }}>
                {p.label}
              </span>
            </div>
          );
        })}
    </div>
  );
};

export default Globe;

