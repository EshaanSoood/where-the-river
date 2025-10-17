"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactGlobe from "react-globe.gl";
import * as THREE from "three";
import * as topojson from "topojson-client";
// import { geoCentroid } from "d3-geo";
import { fetchGlobeData } from "@/lib/globeData";

type ArcData = { startLat: number; startLng: number; endLat: number; endLng: number; key?: string };
type PointData = { lat: number; lng: number; size: number; color: string };
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
  const [hoveredCountry, setHoveredCountry] = useState<any | null>(null);

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
      const pts: PointData[] = nodes.map(n => ({ lat: n.lat, lng: n.lng, size: 0.15, color: "rgba(255,255,255,0.6)" }));
      setPointsData(pts);
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
    }).catch(() => {
      if (!cancelled) { setPointsData([]); setArcsData([]); }
    });
    return () => { cancelled = true; };
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
        } catch { projectPaths(); }
      }, 150) as unknown as number;
    };
    window.addEventListener("resize", onResize);
    computePaths();
    return () => {
      try { controls.removeEventListener("change", projectPaths); } catch {}
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
      className="absolute inset-0"
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
        pointsData={pointsData}
        pointAltitude={0.201}
        pointRadius="size"
        pointColor="color"
        pointsMerge={true}
        pointsTransitionDuration={0}
        polygonsData={polygonsData}
        polygonCapColor={(feat: any) => {
          const isHovered = hoveredCountry && feat.properties.name === hoveredCountry.properties.name;
          if (feat.properties.layer === "bottom") return "#c0a000";
          return isHovered ? "#fff59d" : "#ffd700";
        }}
        polygonSideColor={(feat: any) => (feat.properties.layer === "bottom" ? "transparent" : "#c0a000")}
        polygonStrokeColor={() => "transparent"}
        polygonAltitude={(feat: any) => {
          if (feat.properties.layer === "bottom") return 0.001;
          const isHovered = hoveredCountry && feat.properties.name === hoveredCountry.properties.name;
          return isHovered ? 0.06 : 0.04;
        }}
        polygonsTransitionDuration={300}
        onPolygonHover={handlePolygonHover}
      />
      {/* 2D overlay for organic rivers in screen space (paths are created once and updated) */}
      <svg ref={svgRef} className="absolute inset-0 pointer-events-none" aria-hidden="true" />
      <style jsx>{`
        @keyframes riverFlow { from { stroke-dashoffset: 0; } to { stroke-dashoffset: 120; } }
        @media (prefers-reduced-motion: reduce) { svg path { animation: none !important; } }
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


