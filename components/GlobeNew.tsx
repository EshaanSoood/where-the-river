"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
// Note: when used in Next.js, import via dynamic(() => import(...), { ssr: false })
import ReactGlobe from 'react-globe.gl';
import * as THREE from 'three';
import * as topojson from 'topojson-client';
import { geoCentroid, geoBounds } from 'd3-geo';
import type { PublicGlobeSnapshot } from '@/types/globe';

let supabaseClientPromise: Promise<any> | null = null;

async function loadSupabaseClient() {
  if (!supabaseClientPromise) {
    supabaseClientPromise = import('@/lib/supabaseClient').then((mod) => mod.getSupabase());
  }
  return supabaseClientPromise;
}

type BoatType = 'guest' | 'user';

const MAX_BOATS = 3;
const MAX_GUEST_BOATS = 2;

const rawArcKey = (arc: ArcData) => `${arc.startId}->${arc.endId}`;
const boatRegistryKey = (key: string, type: BoatType) => `${type}|${key}`;
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
  boatColor?: string | null;
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

type GlobeProps = {
  describedById?: string;
  ariaLabel?: string;
  tabIndex?: number;
  initialSnapshot?: PublicGlobeSnapshot;
  userEmail?: string | null;
};
const Globe: React.FC<GlobeProps> = ({ describedById, ariaLabel, tabIndex, initialSnapshot, userEmail }) => {
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
  const [srConnections, setSrConnections] = useState<Array<{ depth: number; label: string }>>([]);
  const [srCountries, setSrCountries] = useState<Array<{ country: string; count: number }>>([]);
  const [nodesData, setNodesData] = useState<NodeData[]>([]);
  const [arcsData, setArcsData] = useState<ArcData[]>([]);
  const [overlayNodes, setOverlayNodes] = useState<NodeData[]>([]);

  const DARK_TEAL = '#6D2B79';
  const AQUA = '#6E0E0A';
  const NEAR_WHITE = 'rgba(255,255,255,0.95)';

  const resetNodeStyles = (nodeMap: Map<string, NodeData>) => {
    nodeMap.forEach((node) => {
      node.color = NEAR_WHITE;
      node.size = 0.20;
    });
  };

  const rebuildSrCountries = (nodeMap: Map<string, NodeData>) => {
    const counts = new Map<string, number>();
    nodeMap.forEach((node) => {
      const friendly = resolveFriendlyCountryName({ properties: { iso_a2: node.countryCode, name: node.countryCode } });
      const key = friendly || node.countryCode || 'Unknown country';
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return Array.from(counts.entries())
      .sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1];
        return a[0].localeCompare(b[0]);
      })
      .map(([country, count]) => ({ country, count }));
  };

  const buildAdjacencyFromLinks = (links: GlobeLink[]) => {
    const map = new Map<string, Set<string>>();
    links.forEach(({ source, target }) => {
      if (!map.has(source)) map.set(source, new Set());
      if (!map.has(target)) map.set(target, new Set());
      map.get(source)!.add(target);
      map.get(target)!.add(source);
    });
    return map;
  };

  const computeChainSet = (id: string) => {
    const adjacency = adjacencyRef.current;
    const visited = new Set<string>();
    if (!adjacency.has(id)) {
      visited.add(id);
      return visited;
    }
    const queue: string[] = [id];
    while (queue.length) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      const neighbors = adjacency.get(current);
      if (!neighbors) continue;
      neighbors.forEach((next) => {
        if (!visited.has(next)) queue.push(next);
      });
    }
    return visited;
  };

  const rebuildArcsForChain = (chain: Set<string>) => {
    const nodeMap = nodeMapCacheRef.current;
    if (!nodeMap) return [] as ArcData[];
    const arcs: ArcData[] = [];
    linksRef.current.forEach(({ source, target }) => {
      const a = nodeMap.get(source);
      const b = nodeMap.get(target);
      if (!a || !b) return;
      const isPrimary = chain.has(source) && chain.has(target);
      arcs.push({
        startLat: a.lat,
        startLng: a.lng,
        endLat: b.lat,
        endLng: b.lng,
        startId: source,
        endId: target,
        primary: isPrimary,
      });
    });
    arcs.sort((x, y) => Number(Boolean(x.primary)) - Number(Boolean(y.primary)));
    return arcs;
  };

  const rebuildOverlayForIdentity = (identityId: string, connections: Set<string>, nodeMap: Map<string, NodeData>) => {
    const list: NodeData[] = [];
    const self = nodeMap.get(identityId);
    if (self) list.push(self);
    Array.from(connections).sort().forEach((friendId) => {
      const node = nodeMap.get(friendId);
      if (node) list.push(node);
    });
    return list;
  };

  const rebuildSrConnectionsForIdentity = (identityId: string, nodeMap: Map<string, NodeData>) => {
    if (!nodeMap.has(identityId)) return [] as Array<{ depth: number; label: string }>;
    const entries: Array<{ depth: number; label: string }> = [];
    const parentLookup = parentLookupRef.current;
    const childLookup = childLookupRef.current;

    const friendlyLabel = (node: NodeData | undefined, depth: number) => {
      const friendlyCountry = resolveFriendlyCountryName({ properties: { iso_a2: node?.countryCode, name: node?.countryCode } });
      const name = node?.name || (depth === 0 ? 'You' : 'Friend');
      return `${depth}. ${name} — ${friendlyCountry || 'Unknown country'}`;
    };

    const ancestors: string[] = [];
    let cursor = identityId;
    const visited = new Set<string>([identityId]);
    while (parentLookup.has(cursor)) {
      const parent = parentLookup.get(cursor)!;
      ancestors.push(parent);
      visited.add(parent);
      cursor = parent;
    }
    ancestors.reverse();
    const totalAncestors = ancestors.length;
    ancestors.forEach((nodeId, idx) => {
      const node = nodeMap.get(nodeId);
      const depth = totalAncestors - idx;
      entries.push({ depth, label: friendlyLabel(node, depth) });
    });

    const meNode = nodeMap.get(identityId);
    entries.push({ depth: 0, label: friendlyLabel(meNode, 0) });

    const queue: Array<{ id: string; depth: number }> = [];
    const initialChildren = childLookup.get(identityId);
    if (initialChildren) {
      Array.from(initialChildren).sort().forEach((child) => {
        queue.push({ id: child, depth: 1 });
      });
    }
    while (queue.length) {
      const { id, depth } = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);
      const node = nodeMap.get(id);
      entries.push({ depth, label: friendlyLabel(node, depth) });
      const children = childLookup.get(id);
      if (children) {
        Array.from(children).sort().forEach((child) => {
          queue.push({ id: child, depth: depth + 1 });
        });
      }
    }

    return entries;
  };

  const spawnBoatsForIdentity = (identityId: string, nodeMap: Map<string, NodeData>, arcs: ArcData[]) => {
    if (!linksRef.current.length) return;
    clearBoatsByType('user');
    const { adj, depths, parents } = buildChainMetadata(identityId, linksRef.current);
    const waypoints = buildBoatWaypoints(identityId, nodeMap, depths, parents, adj);
    const traversalKey = 'user-chain-traversal';
    if (isBoatRegistered(traversalKey, 'user')) {
      // already have traversal boat registered
    } else {
      registerBoatKey(traversalKey, 'user');
    }
    if (!safeProfileRef.current && waypoints.length > 1) {
      try {
        const curve = new THREE.CatmullRomCurve3(waypoints);
        curve.closed = false;
        const scene = sceneRef.current;
        if (scene && boatTemplateRef.current && glbLoadedRef.current) {
          spawnBoatFromCurve(curve, traversalKey, 'user');
        } else if (scene) {
          pendingSpawnsRef.current.push({ curve, arcKey: traversalKey, type: 'user' });
        }
      } catch {}
    } else if (waypoints.length > 1) {
      pendingSpawnsRef.current.push({ curve: new THREE.CatmullRomCurve3(waypoints), arcKey: traversalKey, type: 'user' });
    }

    drainPendingSpawns();

    const myArcs = arcs.filter((arc) => arc.startId === identityId || arc.endId === identityId);
    myArcs.slice(0, 2).forEach((arc, index) => {
      const key = `my-arc-${arc.startId}->${arc.endId}-${index}`;
      if (!isBoatRegistered(key, 'user')) {
        spawnBoatAlongArc(arc.startLat, arc.startLng, arc.endLat, arc.endLng, 'user', key);
      }
    });
  };

  const focusCameraOnUser = useCallback(() => {
    try {
      const id = myIdRef.current; if (!id) return;
      const nodeMap = nodeMapCacheRef.current;
      const node = nodeMap?.get(id); if (!node) return;
      const globe = globeEl.current; if (!globe) return;
      const cam = cameraRef.current; if (!cam) return;
      const controls = controlsRef.current; if (!controls) return;
      const coords = globe.getCoords(node.lat, node.lng); if (!coords) return;
      const target = new THREE.Vector3(coords.x, coords.y, coords.z);
      controls.target.copy(target);
      const distance = cam.position.length();
      const dir = target.clone().normalize().multiplyScalar(distance || (baselineDistanceRef.current || 150));
      cam.position.copy(dir);
      cam.lookAt(target);
      cam.updateProjectionMatrix();
      controls.update();
      lastFocusedUserRef.current = id;
    } catch {}
  }, []);

  const applyGuestView = useCallback(() => {
    const nodeMap = nodeMapCacheRef.current;
    if (!nodeMap || nodeMap.size === 0) return;
    resetNodeStyles(nodeMap);
    const arcs = rebuildArcsForChain(new Set());
    arcsCacheRef.current = arcs;
    setArcsData(arcs);
    setNodesData(Array.from(nodeMap.values()));
    overlayNodesCacheRef.current = [];
    setOverlayNodes([]);
    setSrConnections([]);
    setSrCountries(rebuildSrCountries(nodeMap));
  }, []);

  const enableIdentity = useCallback((identityId: string, options?: { firstName?: string | null; boatColor?: string | null }) => {
    const nodeMap = nodeMapCacheRef.current;
    const rawColor = options?.boatColor ? String(options.boatColor).trim() : '';
    const normalizedColor = rawColor || null;
    if (!nodeMap || nodeMap.size === 0) {
      pendingIdentityRef.current = identityId;
      pendingIdentityColorRef.current = normalizedColor;
      identityIdRef.current = identityId;
      if (normalizedColor) myBoatColorRef.current = normalizedColor;
      return;
    }
    pendingIdentityRef.current = null;
    pendingIdentityColorRef.current = null;
    identityIdRef.current = identityId;
    identityReadyRef.current = true;
    myIdRef.current = identityId;
    isLoggedInRef.current = true;

    if (normalizedColor) {
      myBoatColorRef.current = normalizedColor;
    }

    const incomingFirstName = options?.firstName;
    if (incomingFirstName && incomingFirstName.trim()) {
      myFirstNameRef.current = incomingFirstName.trim().split(/\s+/)[0] || '';
    } else {
      const selfNode = nodeMap.get(identityId);
      if (selfNode?.name) {
        myFirstNameRef.current = selfNode.name.trim().split(/\s+/)[0] || '';
      }
    }

    const adjacency = adjacencyRef.current;
    const neighbors = adjacency.get(identityId);
    const connections = new Set<string>();
    if (neighbors) neighbors.forEach((n) => connections.add(n));
    myConnectionsRef.current = connections;

    const chain = computeChainSet(identityId);
    myChainRef.current = chain;

    resetNodeStyles(nodeMap);
    const preferredColor = (myBoatColorRef.current && myBoatColorRef.current.trim()) || null;
    nodeMap.forEach((node) => {
      if (node.id === identityId) {
        node.color = preferredColor || DARK_TEAL;
        node.boatColor = preferredColor || DARK_TEAL;
        node.size = 0.35;
      } else if (connections.has(node.id)) {
        node.color = AQUA;
        node.size = 0.28;
      } else {
        node.color = NEAR_WHITE;
        node.size = 0.20;
      }
    });

    const arcs = rebuildArcsForChain(chain);
    arcsCacheRef.current = arcs;
    setArcsData(arcs);

    setNodesData(Array.from(nodeMap.values()));

    const overlayList = rebuildOverlayForIdentity(identityId, connections, nodeMap);
    overlayNodesCacheRef.current = overlayList;
    setOverlayNodes(overlayList);

    setSrConnections(rebuildSrConnectionsForIdentity(identityId, nodeMap));
    setSrCountries(rebuildSrCountries(nodeMap));

    spawnBoatsForIdentity(identityId, nodeMap, arcs);
    requestAnimationFrame(() => focusCameraOnUser());
    ensureGuestBoatsRef.current();
    scheduleOverlayUpdate();
  }, [focusCameraOnUser]);

  const disableIdentity = useCallback(() => {
    identityReadyRef.current = false;
    identityIdRef.current = null;
    pendingIdentityRef.current = null;
    pendingIdentityColorRef.current = null;
    myIdRef.current = null;
    myFirstNameRef.current = '';
    myBoatColorRef.current = null;
    myConnectionsRef.current = new Set();
    myChainRef.current = new Set();
    isLoggedInRef.current = false;
    lastFocusedUserRef.current = null;
    clearBoatsRef.current();
    applyGuestView();
    ensureGuestBoatsRef.current();
  }, [applyGuestView]);

  const countriesLODRef = useRef(countriesLOD);
  useEffect(() => { countriesLODRef.current = countriesLOD; }, [countriesLOD]);

  const sceneRef = useRef<THREE.Scene | null>(null);
  const lowPowerRef = useRef<boolean>(false);
  const overlayRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const myIdRef = useRef<string | null>(null);
  const myFirstNameRef = useRef<string>("");
  const myBoatColorRef = useRef<string | null>(null);
  const myConnectionsRef = useRef<Set<string>>(new Set());
  const myChainRef = useRef<Set<string>>(new Set());
  const guestArcCursorRef = useRef<number>(0);
  const ensureGuestBoatsRef = useRef<() => void>(() => {});
  const clearBoatsRef = useRef<() => void>(() => {});
  const linksRef = useRef<GlobeLink[]>([]);
  const adjacencyRef = useRef<Map<string, Set<string>>>(new Map());
  const parentLookupRef = useRef<Map<string, string>>(new Map());
  const childLookupRef = useRef<Map<string, Set<string>>>(new Map());
  const identityIdRef = useRef<string | null>(null);
  const identityReadyRef = useRef<boolean>(false);
  const pendingIdentityRef = useRef<string | null>(null);
  const pendingIdentityColorRef = useRef<string | null>(null);
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
  const boatsRef = useRef<{ id: number; mesh: THREE.Mesh; curve: THREE.CatmullRomCurve3; startTime: number; duration: number; type: BoatType; arcKey: string; isPlaceholder?: boolean }[]>([]);
  const boatArcKeysRef = useRef<Set<string>>(new Set());
  const pendingSpawnsRef = useRef<{ curve: THREE.CatmullRomCurve3; arcKey: string; type: BoatType }[]>([]);
  const drainingPendingRef = useRef<boolean>(false);
  const appliedInitialSnapshotRef = useRef<boolean>(false);

  const isBoatRegistered = useCallback((key: string, type: BoatType) => boatArcKeysRef.current.has(boatRegistryKey(key, type)), []);
  const registerBoatKey = useCallback((key: string, type: BoatType) => { boatArcKeysRef.current.add(boatRegistryKey(key, type)); }, []);
  const unregisterBoatKey = useCallback((key: string, type: BoatType) => { boatArcKeysRef.current.delete(boatRegistryKey(key, type)); }, []);

  const drainPendingSpawns = () => {
    if (drainingPendingRef.current) return;
    if (!pendingSpawnsRef.current.length) return;
    drainingPendingRef.current = true;
    try {
      const queue = pendingSpawnsRef.current.splice(0);
      queue.forEach(({ curve, arcKey, type }) => {
        try {
          if (!safeProfileRef.current && glbLoadedRef.current && boatTemplateRef.current) {
            spawnBoatFromCurve(curve, arcKey, type);
          } else {
            spawnProceduralBoatFromCurve(curve, arcKey, type);
          }
        } catch (err) {
          unregisterBoatKey(arcKey, type);
          console.error('[GlobeNew] pending boat spawn failed', err);
        }
      });
    } finally {
      drainingPendingRef.current = false;
    }
  };

  // Data versioning & caching (deterministic, spawn-once pattern)
  const nodeMapCacheRef = useRef<Map<string, NodeData>>(new Map());
  const overlayNodesCacheRef = useRef<NodeData[]>([]);
  const arcsCacheRef = useRef<ArcData[]>([]);
  const lastFocusedUserRef = useRef<string | null>(null);
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
  const resolveFriendlyCountryName = (feature: any | null | undefined): string => {
    if (!feature) return '';
    const props = feature.properties || {};
    const iso = typeof props.iso_a2 === 'string' ? props.iso_a2.trim() : '';
    const fallback = typeof props.name === 'string' ? props.name : (iso || '');
    if (iso && iso.length === 2) {
      const friendly = getCountryNameFromIso2(iso.toUpperCase());
      if (friendly && friendly.toUpperCase() !== iso.toUpperCase()) return friendly;
    }
    return fallback;
  };
  const resolveLatLngForCode = (cc: string): [number, number] => { const t = countryCodeToLatLng[cc]; if (t) return t; const name = getCountryNameFromIso2(cc); if (name) { const exact = countryCentroidsRef.current.get(name); if (exact) return [exact.lat, exact.lng]; const upper = name.toUpperCase(); for (const [k, v] of countryCentroidsRef.current.entries()) { const ku = k.toUpperCase(); if (ku.includes(upper) || upper.includes(ku)) return [v.lat, v.lng]; } } return [0, 0]; };
  const getCountrySpreadDeg = (name: string | null | undefined, fallbackLat: number): number | undefined => { try { if (!name) return undefined; let diag = countryBBoxDiagRef.current.get(name); if (typeof diag !== 'number') { const target = name.toUpperCase(); for (const [k, v] of countryBBoxDiagRef.current.entries()) { const ku = k.toUpperCase(); if (ku.includes(target) || target.includes(ku)) { diag = v as number; break; } } } if (typeof diag !== 'number' || !(diag > 0)) return undefined; const latRad = (fallbackLat || 0) * Math.PI / 180; const latScale = Math.max(0.5, Math.cos(latRad)); const effDiag = Math.hypot(diag * latScale, diag); const multiplier = effDiag > 35 ? 0.20 : (effDiag > 20 ? 0.175 : 0.15); const base = Math.max(0.12, Math.min(4.0, effDiag * multiplier)); return base; } catch { return undefined; } };
  const seededJitterAround = (lat: number, lng: number, id: string, spreadDeg?: number, overrideAngleRad?: number, radiusScale?: number): [number, number] => { const seed = hashString(id); const rnd = mulberry32(seed); const angle = typeof overrideAngleRad === 'number' ? overrideAngleRad : (rnd() * Math.PI * 2); const base = typeof spreadDeg === 'number' ? Math.max(0.08, Math.min(4.5, spreadDeg)) : 0.24; const rUnscaled = (0.6 * base) + rnd() * (0.4 * base); const r = (radiusScale && radiusScale > 0 ? rUnscaled * radiusScale : rUnscaled); const dLat = r * Math.sin(angle); const dLng = r * Math.cos(angle) / Math.max(0.5, Math.cos(lat * Math.PI / 180)); const jLat = Math.max(-85, Math.min(85, lat + dLat)); const jLng = ((lng + dLng + 540) % 360) - 180; return [jLat, jLng]; };

  // Compute stable data version from API payload + auth state
  type GlobeNode = { id: string; name: string; countryCode: string; createdAt: string; boats?: number };
  type GlobeLink = { source: string; target: string };
  const fetchGlobeData = async (filter: 'all' | '30d' | '7d' = 'all'): Promise<{ nodes: GlobeNode[]; links: GlobeLink[] }> => {
    const guessedBase = (typeof window !== 'undefined' ? window.location.origin : '') || 'https://riverflowseshaan.vercel.app';
    const base = guessedBase.replace(/\/$/, '');
    const resp = await fetch(`${base}/api/globe?filter=${encodeURIComponent(filter)}`, { headers: { 'Content-Type': 'application/json' } });
    if (!resp.ok) throw new Error(`globe api failed: ${resp.status}`);
    const json = await resp.json();
    return { nodes: json?.nodes || [], links: json?.links || [] };
  };
  const fetchMeSafe = async (shouldFetchIdentity: boolean): Promise<{ id: string; name: string | null; boatColor: string | null } | null> => {
    if (!shouldFetchIdentity) return null;
    try {
      const guessedBase = (typeof window !== 'undefined' ? window.location.origin : '') || '';
      if (!guessedBase) return null;
      const base = guessedBase.replace(/\/$/, '');
      const supabase = await loadSupabaseClient();
      const { data: sess } = await supabase.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) return null;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      };
      const resp = await fetch(`${base}/api/me`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({}),
      });
      if (!resp.ok) return null;
      const j = await resp.json();
      const userId = j?.me?.id || null;
      const name = j?.me?.name || null;
      const boatColorRaw = j?.me?.boat_color;
      const boatColor = typeof boatColorRaw === 'string' && boatColorRaw.trim() ? boatColorRaw.trim() : null;
      if (!userId) return null;
      return { id: userId as string, name, boatColor };
    } catch {
      return null;
    }
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

  const removeBoat = useCallback((boat: { mesh: THREE.Mesh; arcKey: string; type: BoatType } | undefined) => {
    if (!boat) return;
    try {
      const scene = sceneRef.current;
      if (scene) scene.remove(boat.mesh);
      unregisterBoatKey(boat.arcKey, boat.type);
      (boat.mesh as any).traverse?.((child: any) => {
        if (child.isMesh) {
          child.geometry?.dispose?.();
          if (child.material?.dispose) child.material.dispose();
        }
      });
    } catch {}
  }, [unregisterBoatKey]);

  const clearBoatsByType = useCallback((type: BoatType) => {
    const remaining: typeof boatsRef.current = [];
    boatsRef.current.forEach((boat) => {
      if (boat.type === type) {
        removeBoat(boat);
      } else {
        remaining.push(boat);
      }
    });
    boatsRef.current = remaining;
  }, [removeBoat]);

  const clearBoats = useCallback(() => {
    try {
      boatsRef.current.forEach(boat => removeBoat(boat));
      boatsRef.current = [];
    } catch {}
    pendingSpawnsRef.current = [];
    boatArcKeysRef.current.clear();
  }, [removeBoat]);
  clearBoatsRef.current = clearBoats;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onReady = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      const id = typeof detail.id === 'string' ? detail.id : undefined;
      const name = typeof detail.name === 'string' ? detail.name : undefined;
      const boatColor = typeof detail.boatColor === 'string' ? detail.boatColor : undefined;
      if (id) {
        enableIdentity(id, { firstName: name ?? null, boatColor: boatColor ?? null });
      }
    };
    const onLogout = () => {
      disableIdentity();
    };
    try { window.addEventListener('profile:revalidate', onReady as EventListener); } catch {}
    try { window.addEventListener('profile:logout', onLogout as EventListener); } catch {}
    return () => {
      try { window.removeEventListener('profile:revalidate', onReady as EventListener); } catch {}
      try { window.removeEventListener('profile:logout', onLogout as EventListener); } catch {}
    };
  }, [enableIdentity, disableIdentity]);

  const globeMaterial = useMemo(() => new THREE.MeshPhongMaterial({ color: '#1D7C87', opacity: 0.6, transparent: true }), []);
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
                drainPendingSpawns();
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
    const id = myIdRef.current;
    if (!id) return;
    if (lastFocusedUserRef.current === id) return;
    focusCameraOnUser();
  }, [isGlobeReady, focusCameraOnUser]);
  useEffect(() => {
    if (!isGlobeReady) return;
    const controls = controlsRef.current; const camera = cameraRef.current; const renderer = rendererRef.current; if (!controls || !camera || !renderer) return;
    const ZOOM_LOD_THRESHOLD = 220;
    const handleZoom = () => { const distance = camera.position.length(); setCurrentLOD(distance < ZOOM_LOD_THRESHOLD && countriesLODRef.current.high.features.length > 0 ? 'high' : 'low'); const ratio = Math.max(0.0001, baselineDistanceRef.current / distance); const raw = Math.min(2.0, Math.max(0.6, 0.85 + 0.55 * ratio)); const quant = Math.round(raw * 10) / 10; setZoomScale(prev => (Math.abs((prev ?? 0) - quant) >= 0.05 ? quant : prev)); scheduleOverlayUpdate(); };
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

  const handlePolygonHover = (feature: any | null) => {
    setHoveredCountry(feature);
    if (feature) {
      setTooltipContent(resolveFriendlyCountryName(feature));
      setIsTooltipVisible(true);
    } else {
      setIsTooltipVisible(false);
    }
  };
  const tooltipRefPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const rafPendingRef = useRef<boolean>(false);
  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    tooltipRefPos.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    if (rafPendingRef.current) return;
    rafPendingRef.current = true;
    requestAnimationFrame(() => {
      rafPendingRef.current = false;
      setTooltipPosition(tooltipRefPos.current);
    });
  };

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
  const scheduleOverlayUpdate = () => {
    if (overlayUpdatePendingRef.current) return;
    overlayUpdatePendingRef.current = true;
    requestAnimationFrame(() => {
      overlayUpdatePendingRef.current = false;
      try {
        const globe = globeEl.current;
        if (!globe) return;
        overlayNodes.forEach(n => {
          const el = overlayRefs.current.get(n.id);
          if (!el) return;
          const px = projectLatLngIfFront(n.lat, n.lng);
          if (!px) {
            el.style.opacity = '0';
            return;
          }
          el.style.left = `${px.x}px`;
          el.style.top = `${px.y}px`;
          el.style.opacity = '1';
        });
      } catch {}
    });
  };

  // --- Boat animation loop (single-boat) with fixed-step simulation (allocation-free) ---
  useEffect(() => {
    let rafId: number;
    const TICK_MS_HIDDEN = 1000; // 1Hz when hidden (user-requested)
    let lastTick = performance.now();
    const pos = new THREE.Vector3();
    const tan = new THREE.Vector3();
    const animate = () => {
      const now = performance.now();
      drainPendingSpawns();
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
          boat.mesh.position.multiplyScalar(1.10);
          boat.curve.getTangentAt(t, tan);
          boat.mesh.up.copy(pos).normalize();
          boat.mesh.lookAt(pos.clone().add(tan));
        });
        // Keep overlay labels pinned to nodes every frame
        scheduleOverlayUpdate();
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

  const spawnBoatAlongArc = (startLat: number, startLng: number, endLat: number, endLng: number, type: BoatType, arcKey?: string) => {
    let key = '';
    try {
      const globe = globeEl.current; const scene = sceneRef.current || (globe ? globe.scene() : null); if (!globe || !scene) return;
      const ARC_ALTITUDE = 0.2; const BOAT_PATH_ALTITUDE = 0.07; const GLOBE_RADIUS = 100;
      const sC = globe.getCoords(startLat, startLng); const eC = globe.getCoords(endLat, endLng); if (!sC || !eC) return;
      const s = new THREE.Vector3(sC.x, sC.y, sC.z).normalize().multiplyScalar(GLOBE_RADIUS * (1 + BOAT_PATH_ALTITUDE));
      const e = new THREE.Vector3(eC.x, eC.y, eC.z).normalize().multiplyScalar(GLOBE_RADIUS * (1 + BOAT_PATH_ALTITUDE));
      const mid = new THREE.Vector3().addVectors(s, e).multiplyScalar(0.5).normalize().multiplyScalar(GLOBE_RADIUS * (1 + ARC_ALTITUDE));
      const curve = new THREE.CatmullRomCurve3([s, mid, e]);
      key = arcKey || `${startLat},${startLng}->${endLat},${endLng}`;
      if (isBoatRegistered(key, type)) return;
      registerBoatKey(key, type);
      if (!boatTemplateRef.current || safeProfileRef.current || !glbLoadedRef.current) {
        pendingSpawnsRef.current.push({ curve, arcKey: key, type });
        drainPendingSpawns();
        return;
      }
      spawnBoatFromCurve(curve, key, type);
    } catch (err) {
      if (key) unregisterBoatKey(key, type);
      console.error('[GlobeNew] spawnBoatAlongArc failed', err);
    }
  };

  const spawnBoatFromCurve = (curve: THREE.CatmullRomCurve3, arcKey: string, type: BoatType) => {
    const scene = sceneRef.current; const globe = globeEl.current; if (!scene || !globe) return;
    try {
      const src = boatTemplateRef.current!;
      const cloned = (cloneFnRef.current ? cloneFnRef.current(src) : src.clone(true)) as THREE.Object3D;
      cloned.traverse((child: any) => {
        if (child.isMesh) {
          if (boatTemplateMaterialRef.current) child.material = boatTemplateMaterialRef.current;
          child.castShadow = false;
          child.receiveShadow = false;
        }
      });
      cloned.scale.set(6, 6, 6);
      // Initial placement & orientation at t=0 for immediate visibility
      const pos0 = curve.getPointAt(0);
      cloned.position.copy(pos0);
      // Offset boat above arcs (arcs are at 1.07x, boats at 1.10x to ensure z-ordering)
      cloned.position.multiplyScalar(1.10);
      const tan0 = curve.getTangentAt(0);
      cloned.up.copy(pos0).normalize();
      cloned.lookAt(pos0.clone().add(tan0));
      const upAxis = pos0.clone().normalize();
      cloned.rotateOnWorldAxis(upAxis, Math.PI / 2);
      // Rotate boat 90° on X-axis so it sails forward instead of sideways
      cloned.rotateOnWorldAxis(new THREE.Vector3(0, 0, 0), Math.PI / 2);
      // Draw above arcs: high render order + disable depth test on materials
      (cloned as any).traverse?.((child: any) => {
        if (child.isMesh) {
          child.renderOrder = 9999;
          if (child.material) {
            child.material.depthTest = true;
            child.material.depthWrite = true;
          }
        }
      });
      // capacity checks
      if (boatsRef.current.length >= MAX_BOATS) {
        const guestIndex = boatsRef.current.findIndex(b => b.type === 'guest');
        const removeIndex = guestIndex !== -1 ? guestIndex : 0;
        const [removed] = boatsRef.current.splice(removeIndex, 1);
        removeBoat(removed);
      }
      registerBoatKey(arcKey, type);
      boatsRef.current.push({ id: Date.now() + Math.random(), mesh: cloned as unknown as THREE.Mesh, curve, arcKey, startTime: performance.now(), duration: 15000, type, isPlaceholder: false });
      scene.add(cloned);
    } catch {}
  };

  const spawnProceduralBoatFromCurve = (curve: THREE.CatmullRomCurve3, arcKey: string, type: BoatType) => {
    const scene = sceneRef.current; if (!scene) return;
    try {
      const mesh = createProceduralBoat();
      const pos0 = curve.getPointAt(0);
      const tan0 = curve.getTangentAt(0);
      mesh.position.copy(pos0);
      // Offset boat slightly away from globe center (radially outward) to keep it above arcs/land
      mesh.position.multiplyScalar(1.10);
      (mesh as any).up.copy(pos0).normalize();
      (mesh as any).lookAt(pos0.clone().add(tan0));
      const upAxis = pos0.clone().normalize();
      mesh.rotateOnWorldAxis(upAxis, Math.PI / 2);
      // Rotate boat 90° on X-axis so it sails forward instead of sideways
      mesh.rotateOnWorldAxis(new THREE.Vector3(0, 0, 0), Math.PI / 2);
      // Draw above arcs: high render order + disable depth test
      mesh.renderOrder = 9999;
      if (mesh.material) {
        (mesh.material as any).depthTest = true;
        (mesh.material as any).depthWrite = true;
      }
      if (boatsRef.current.length >= MAX_BOATS) {
        const guestIndex = boatsRef.current.findIndex(b => b.type === 'guest');
        const removeIndex = guestIndex !== -1 ? guestIndex : 0;
        const [removed] = boatsRef.current.splice(removeIndex, 1);
        removeBoat(removed);
      }
      registerBoatKey(arcKey, type);
      boatsRef.current.push({ id: Date.now() + Math.random(), mesh, curve, arcKey, startTime: performance.now(), duration: 15000, type, isPlaceholder: true });
      scene.add(mesh);
    } catch {}
  };

  const ensureGuestBoats = useCallback(() => {
    if (boatsRef.current.filter(b => b.type === 'guest').length >= MAX_GUEST_BOATS) return;
    const arcs = arcsCacheRef.current;
    if (!arcs || arcs.length === 0) return;

    const sorted = [...arcs].sort((a, b) => rawArcKey(a).localeCompare(rawArcKey(b)));
    if (!sorted.length) return;

    const total = sorted.length;
    let cursor = guestArcCursorRef.current % total;
    if (cursor < 0) cursor += total;

    let attempts = 0;
    let spawned = boatsRef.current.filter(b => b.type === 'guest').length;

    while (spawned < MAX_GUEST_BOATS && attempts < total) {
      const arc = sorted[(cursor + attempts) % total];
      attempts += 1;
      if (!arc) continue;
      if (!arc.startId || !arc.endId) continue;
      if (arc.startId === arc.endId) continue;
      const key = rawArcKey(arc);
      if (isBoatRegistered(key, 'guest')) continue;
      spawnBoatAlongArc(arc.startLat, arc.startLng, arc.endLat, arc.endLng, 'guest', key);
      spawned += 1;
    }

    guestArcCursorRef.current = (cursor + attempts) % total;
  }, [isBoatRegistered, spawnBoatAlongArc]);
  ensureGuestBoatsRef.current = ensureGuestBoats;

  const hydrateGraph = useCallback((payload: { nodes: GlobeNode[]; links: GlobeLink[] }, identity?: { id: string | null; name: string | null; boatColor?: string | null }) => {
    try {
      const { nodes, links } = payload;

      linksRef.current = links;
      adjacencyRef.current = buildAdjacencyFromLinks(links);

      const parentLookup = new Map<string, string>();
      const childLookup = new Map<string, Set<string>>();
      links.forEach(({ source, target }) => {
        parentLookup.set(target, source);
        if (!childLookup.has(source)) childLookup.set(source, new Set());
        childLookup.get(source)!.add(target);
      });
      parentLookupRef.current = parentLookup;
      childLookupRef.current = childLookup;

      const nodeMap = new Map<string, NodeData>();
      nodes.forEach((n) => {
        const cc = (n.countryCode || '').toUpperCase();
        const base = resolveLatLngForCode(cc);
        const name = getCountryNameFromIso2(cc);
        const spread = getCountrySpreadDeg(name, base[0]);
        const [lat, lng] = seededJitterAround(base[0], base[1], n.id, spread);
        nodeMap.set(n.id, { id: n.id, lat, lng, size: 0.20, color: NEAR_WHITE, countryCode: cc, name: n.name || null, boatColor: null });
      });
      nodeMapCacheRef.current = nodeMap;

      identityReadyRef.current = false;
      identityIdRef.current = null;
      myIdRef.current = null;
      isLoggedInRef.current = false;
      myFirstNameRef.current = '';
      myBoatColorRef.current = null;
      myConnectionsRef.current = new Set();
      myChainRef.current = new Set();

      clearBoatsByType('guest');
      applyGuestView();

      const candidateId = identity?.id || null;
      if (candidateId) {
        enableIdentity(candidateId, { firstName: identity?.name || null, boatColor: identity?.boatColor || null });
      } else if (pendingIdentityRef.current) {
        enableIdentity(pendingIdentityRef.current, { boatColor: pendingIdentityColorRef.current });
      } else {
        identityReadyRef.current = false;
        identityIdRef.current = null;
      }

      ensureGuestBoats();
    } catch (err) {
      console.error('[GlobeNew] hydrateGraph failed', err);
    }
  }, [applyGuestView, clearBoatsByType, enableIdentity, ensureGuestBoats, getCountryNameFromIso2, getCountrySpreadDeg, resolveLatLngForCode, seededJitterAround]);

  useEffect(() => {
    if (!initialSnapshot || appliedInitialSnapshotRef.current) return;
    hydrateGraph({ nodes: initialSnapshot.nodes, links: initialSnapshot.links });
    appliedInitialSnapshotRef.current = true;
  }, [hydrateGraph, initialSnapshot]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const shouldFetchIdentity = Boolean(userEmail);
        const [{ nodes, links }, me] = await Promise.all([
          fetchGlobeData('all'),
          fetchMeSafe(shouldFetchIdentity),
        ]);
        if (cancelled) return;
        hydrateGraph({ nodes, links }, me ?? undefined);
      } catch (err) {
        if (!cancelled) {
          console.error('[GlobeNew] data fetch failed', err);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrateGraph, userEmail]);

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
      <div aria-label="Dream River accessible navigation" style={{ position: 'absolute', left: -9999, top: 'auto', width: 1, height: 1, overflow: 'hidden' }}>
        <div role="group" aria-label="Your connections">
          <ul role="list">
            {srConnections.length === 0 ? (
              <li role="listitem">No connections available yet.</li>
            ) : (
              srConnections.map(entry => (
                <li role="listitem" key={`sr-conn-${entry.depth}-${entry.label}`}>
                  {entry.label}
                </li>
              ))
            )}
          </ul>
        </div>
        <div role="group" aria-label="Countries">
          <ul role="list">
            {srCountries.length === 0 ? (
              <li role="listitem">No countries detected yet.</li>
            ) : (
              srCountries.map(({ country, count }) => (
                <li role="listitem" key={`sr-country-${country}`}>
                  {country} — {count} {count === 1 ? 'person sailing' : 'people sailing'}
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
      <div style={tooltipStyle}>
        {tooltipContent}
      </div>
      <ReactGlobe
        ref={globeEl}
        onGlobeReady={onGlobeReady}
        rendererConfig={rendererConfig}
        backgroundColor="rgba(0,0,0,0)"
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
        pointsData={useMemo(() => nodesData.map(n => ({ lat: n.lat, lng: n.lng, size: n.size, color: n.color, id: n.id })), [nodesData])}
        pointAltitude={(d: any) => {
          const id = d?.id as string | undefined;
          if (id && myIdRef.current && id === myIdRef.current) return 0.205;
          if (id && myConnectionsRef.current.has(id)) return 0.203;
          return 0.201;
        }}
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
            style={{ position: 'absolute', left: 0, top: 0, transform: 'translate(-50%, -50%)', pointerEvents: 'none', zIndex: 200, opacity: 0 }}
            aria-hidden="true"
          >
            <div
              className="font-seasons"
              style={{ position: 'absolute', left: '50%', top: '100%', transform: 'translate(-50%, 6px)', color: 'var(--ink, #e6e6e6)', fontSize: 12, fontWeight: 600, textShadow: '0 1px 2px rgba(0,0,0,0.25)' }}
            >
              {isMe ? (myFirstNameRef.current || '') : (p.name ? String(p.name).split(/\s+/)[0] || '' : '')}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default Globe;


