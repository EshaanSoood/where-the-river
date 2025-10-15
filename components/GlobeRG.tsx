"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactGlobe from "react-globe.gl";
import * as THREE from "three";
import * as topojson from "topojson-client";
// import { geoCentroid } from "d3-geo";
import { fetchGlobeData } from "@/lib/globeData";

type ArcData = { startLat: number; startLng: number; endLat: number; endLng: number };
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

export default function GlobeRG() {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const globeEl = useRef<any>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const boatsRef = useRef<Boat[]>([]);
  const countriesLODRef = useRef<{ low: CountriesData; high: CountriesData }>({ low: { features: [] }, high: { features: [] } });

  const [countriesLOD, setCountriesLOD] = useState<{ low: CountriesData; high: CountriesData }>({ low: { features: [] }, high: { features: [] } });
  const [currentLOD, setCurrentLOD] = useState<"low" | "high">("low");
  const [arcsData, setArcsData] = useState<ArcData[]>([]);
  const [pointsData, setPointsData] = useState<PointData[]>([]);
  const [hoveredCountry, setHoveredCountry] = useState<any | null>(null);

  const [tooltip, setTooltip] = useState<{ content: string | null; x: number; y: number }>({ content: null, x: 0, y: 0 });
  const tooltipRef = useRef<HTMLDivElement | null>(null);

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
        if (a && b) arcs.push({ startLat: a.lat, startLng: a.lng, endLat: b.lat, endLng: b.lng });
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
      const startVec = new THREE.Vector3(sc.x, sc.y, sc.z).normalize().multiplyScalar(GLOBE_RADIUS * (1 + BOAT_PATH_ALTITUDE));
      const endVec = new THREE.Vector3(ec.x, ec.y, ec.z).normalize().multiplyScalar(GLOBE_RADIUS * (1 + BOAT_PATH_ALTITUDE));
      const midPoint = new THREE.Vector3().addVectors(startVec, endVec).multiplyScalar(0.5);
      const midAltitude = GLOBE_RADIUS * (1 + ARC_ALTITUDE);
      midPoint.normalize().multiplyScalar(midAltitude);
      const curve = new THREE.CatmullRomCurve3([startVec, midPoint, endVec]);
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
    controls.minDistance = 200;
    controls.maxDistance = 250;
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
  };

  // Rebuild boats when arcs change and globe is ready
  useEffect(() => { ensureBoatsForArcs(); }, [arcsData]);

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
      style={{ transform: `translateY(var(--globe-offset-y)) scale(var(--globe-scale))`, transformOrigin: "center center" }}
    >
      <ReactGlobe
        ref={globeEl}
        onGlobeReady={onGlobeReady}
        backgroundColor="rgba(0,0,0,0)"
        globeMaterial={globeMaterial}
        atmosphereColor="#66c2ff"
        atmosphereAltitude={0.25}
        arcsData={arcsData}
        arcColor={() => "rgba(102, 194, 255, 0.8)"}
        arcStroke={2}
        arcAltitude={0.2}
        arcDashLength={0.4}
        arcDashGap={0.15}
        arcDashAnimateTime={2500}
        arcCircularResolution={64}
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
      {tooltip.content && (
        <div ref={tooltipRef} className="absolute bg-white/80 backdrop-blur-sm px-2 py-1 rounded-md shadow-lg pointer-events-none" style={{ top: `${tooltip.y}px`, left: `${tooltip.x}px`, zIndex: 30 }}>
          <p className="font-mono text-sm text-gray-800">{tooltip.content}</p>
        </div>
      )}
    </div>
  );
}


