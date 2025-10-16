"use client";

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as topojson from 'topojson-client';
import type { FeatureCollection } from '../types';
import { fetchGlobeData } from '@/lib/globeData';
import { getCountryNameFromCode } from "@/lib/countryMap";

const GlobeComponent: React.FC = () => {
  const mountRef = useRef<HTMLDivElement>(null);
  const overlaySvgRef = useRef<SVGSVGElement | null>(null);
  const debugRef = useRef<HTMLDivElement | null>(null);
  const nodeElementMapRef = useRef<Record<string, { g: SVGGElement | null; circle: SVGCircleElement | null; text: SVGTextElement | null }>>({});
  const lastTapRef = useRef<number>(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [tooltip, setTooltip] = useState<{
    content: string | null;
    x: number;
    y: number;
  }>({ content: null, x: 0, y: 0 });
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const [nodeRadius, setNodeRadius] = useState<number>(3.5);
  const nodesRef = useRef<{ id: string; name: string; countryCode: string; lat: number; lng: number }[]>([]);
  const linksRef = useRef<{ source: string; target: string }[]>([]);
  const countersRef = useRef<{ fetched: number; drawnNodes: number; drawnEdges: number; missingCentroid: number }>({ fetched: 0, drawnNodes: 0, drawnEdges: 0, missingCentroid: 0 });
  const [overlay, setOverlay] = useState<{
    nodes: { id: string; name: string; countryCode: string; lat: number; lng: number }[];
    links: { source: string; target: string }[];
  }>({ nodes: [], links: [] });

  useEffect(() => {
    if (!mountRef.current) return;
    const mount = mountRef.current;

    const clock = new THREE.Clock();

    // Scene setup
    const scene = new THREE.Scene();
    const sceneColor = 0xf7f6f2;
    scene.background = new THREE.Color(sceneColor);
    scene.fog = new THREE.Fog(sceneColor, 250, 450);


    // Camera setup (size based on container, not window)
    const getContainerSize = () => {
      const rect = mount.getBoundingClientRect();
      // Fallback if not yet laid out
      const width = Math.max(1, Math.floor(rect.width || mount.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 1)));
      const height = Math.max(1, Math.floor(rect.height || mount.clientHeight || (typeof window !== 'undefined' ? window.innerHeight : 1)));
      return { width, height };
    };

    const { width: initialWidth, height: initialHeight } = getContainerSize();
    const computeNodeRadius = () => {
      const { width } = getContainerSize();
      if (width <= 480) return 5.0;
      if (width <= 768) return 4.25;
      return 3.5;
    };
    setNodeRadius(computeNodeRadius());

    const camera = new THREE.PerspectiveCamera(45, initialWidth / initialHeight, 0.1, 1000);
    camera.position.z = 300;
    const initialDistance = camera.position.length();

    // Renderer setup (match parent container)
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(2, (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1));
    renderer.setSize(initialWidth, initialHeight);
    mount.appendChild(renderer.domElement);
    // Accessibility: treat globe as decorative to avoid trapping focus
    try {
      renderer.domElement.setAttribute('aria-hidden', 'true');
      renderer.domElement.setAttribute('role', 'presentation');
      renderer.domElement.setAttribute('tabindex', '-1');
    } catch {}
    try {
      (renderer.domElement.style as CSSStyleDeclaration).touchAction = 'none';
    } catch {}
    
    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.1);
    directionalLight.position.set(200, 100, 300);
    scene.add(directionalLight);

    // Orbit controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.5;
    controls.enableZoom = true;
    controls.minDistance = initialDistance * 0.8;
    controls.maxDistance = initialDistance * 1.2;
    try {
      // Touch: one finger rotate, two fingers dolly/pan (zoom)
      controls.touches.ONE = THREE.TOUCH.ROTATE;
      controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
    } catch {}

    // Cursor style
    mount.style.cursor = 'grab';
    const handleControlStart = () => {
        mount.style.cursor = 'grabbing';
        controls.autoRotate = false;
    };
    const handleControlEnd = () => {
        mount.style.cursor = 'grab';
    };
    controls.addEventListener('start', handleControlStart);
    controls.addEventListener('end', handleControlEnd);


    const globeRadius = 100;

    // Ocean sphere (simplified)
    const oceanGeometry = new THREE.IcosahedronGeometry(globeRadius - 0.5, 30);
    const oceanMaterial = new THREE.MeshStandardMaterial({
        color: 0x1e90ff,
        roughness: 0.9,
        metalness: 0.1,
        transparent: true,
        opacity: 0.4,
    });
    const oceanSphere = new THREE.Mesh(oceanGeometry, oceanMaterial);
    scene.add(oceanSphere);

    // Cloud Layers
    const textureLoader = new THREE.TextureLoader();
    const cloudTexture = textureLoader.load('https://s3-us-west-2.amazonaws.com/s.cdpn.io/141228/earthcloudmap.jpg');
    const cloudGeometry1 = new THREE.IcosahedronGeometry(globeRadius + 5, 12);
    const cloudMaterial1 = new THREE.MeshPhongMaterial({
        map: cloudTexture,
        alphaMap: cloudTexture,
        transparent: true,
        opacity: 0.05,
        depthWrite: false,
    });
    const clouds1 = new THREE.Mesh(cloudGeometry1, cloudMaterial1);
    scene.add(clouds1);

    const cloudGeometry2 = new THREE.IcosahedronGeometry(globeRadius + 5.5, 12);
    const cloudMaterial2 = new THREE.MeshPhongMaterial({
        map: cloudTexture,
        alphaMap: cloudTexture,
        transparent: true,
        opacity: 0.05,
        depthWrite: false,
    });
    const clouds2 = new THREE.Mesh(cloudGeometry2, cloudMaterial2);
    scene.add(clouds2);

    // Group to hold all country meshes for raycasting
    const countriesGroup = new THREE.Group();
    scene.add(countriesGroup);
    
    // No markers in simplified style

    // Convert lat/lon to 3D coordinates
    const latLonToVector3 = (lat: number, lon: number, radius: number) => {
      const phi = (90 - lat) * (Math.PI / 180);
      const theta = (lon + 180) * (Math.PI / 180);
      const x = -(radius * Math.sin(phi) * Math.cos(theta));
      const y = radius * Math.cos(phi);
      const z = radius * Math.sin(phi) * Math.sin(theta);
      return new THREE.Vector3(x, y, z);
    };
    
    const renderWorldFromGeoJson = (geoJson: FeatureCollection) => {
        const landMaterial = new THREE.MeshStandardMaterial({ color: 0xffc700, roughness: 0.8 });

        const createLandMesh = (polygon: number[][][], elevation: number) => {
            if (!polygon || polygon.length === 0) return null;

            const shape = new THREE.Shape();
            const outerRing = polygon[0];
            shape.moveTo(outerRing[0][0], outerRing[0][1]);
            for (let i = 1; i < outerRing.length; i++) {
                shape.lineTo(outerRing[i][0], outerRing[i][1]);
            }
            shape.closePath();

            for (let i = 1; i < polygon.length; i++) {
                const holePath = new THREE.Path();
                const holeRing = polygon[i];
                holePath.moveTo(holeRing[0][0], holeRing[0][1]);
                for (let j = 1; j < holeRing.length; j++) {
                    holePath.lineTo(holeRing[j][0], holeRing[j][1]);
                }
                holePath.closePath();
                shape.holes.push(holePath);
            }
            
            try {
                const geometry = new THREE.ExtrudeGeometry(shape, { depth: elevation, bevelEnabled: false });
                
                const positions = geometry.attributes.position;
                for (let i = 0; i < positions.count; i++) {
                    const lon = positions.getX(i);
                    const lat = positions.getY(i);
                    const elev = positions.getZ(i);
                    const newPos = latLonToVector3(lat, lon, globeRadius + elev);
                    positions.setXYZ(i, newPos.x, newPos.y, newPos.z);
                }
                geometry.computeVertexNormals();

                const mesh = new THREE.Mesh(geometry, landMaterial);
                mesh.castShadow = false;
                mesh.receiveShadow = false;
                return mesh;
            } catch (e) {
                console.warn("Could not generate geometry for a polygon:", e);
                return null;
            }
        };

        geoJson.features.forEach(feature => {
            if (!feature.geometry || !feature.properties?.name) return;
            const geom = feature.geometry;
            const countryName = feature.properties.name;

            const createAndAddMeshes = (polygon: number[][][]) => {
                const landMesh = createLandMesh(polygon, 2.0);
                if (landMesh) {
                    landMesh.userData = { countryName: countryName };
                    countriesGroup.add(landMesh);
                }
            };

            if (geom.type === 'Polygon') {
                createAndAddMeshes(geom.coordinates);
            } else if (geom.type === 'MultiPolygon') {
                geom.coordinates.forEach(polygon => createAndAddMeshes(polygon));
            }
        });
    };
    
    // Removed boat paths/markers for simplified visual style

    // Deterministic hash for edge seeding
    const hashEdge = (s: string) => {
      let h = 2166136261 >>> 0;
      for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      // Map to [-1, 1]
      return (h % 2000) / 1000 - 1;
    };

    const loadAndDrawGlobe = async () => {
        try {
            const res = await fetch('https://unpkg.com/world-atlas@2.0.2/countries-110m.json');
            if (!res.ok) throw new Error('Failed to fetch world data');
            const worldData = await res.json();
            
            const countriesGeoJson = topojson.feature(worldData, worldData.objects.countries) as unknown as FeatureCollection;
            renderWorldFromGeoJson(countriesGeoJson);
        } catch (error) {
            console.error("Error loading or processing world data:", error);
        }
    };

    loadAndDrawGlobe();

    const projectLatLngToScreen = (lat: number, lon: number) => {
      const vec = latLonToVector3(lat, lon, globeRadius + 2.0);
      const surfaceNormal = vec.clone().normalize();
      const toCameraVector = new THREE.Vector3().subVectors(camera.position, vec).normalize();
      const dot = surfaceNormal.dot(toCameraVector); // [-1,1]
      const facing = dot > 0.0;
      const facingStrength = Math.max(0, Math.min(1, dot));
      const { width, height } = getContainerSize();
      const projected = vec.clone().project(camera);
      const x = (projected.x * 0.5 + 0.5) * width;
      const y = (-projected.y * 0.5 + 0.5) * height;
      return { x, y, facing, facingStrength };
    };

    const updateOverlayPositions = () => {
      const svg = overlaySvgRef.current;
      if (!svg) return;
      const nodes = nodesRef.current;
      const links = linksRef.current;
      let drawnNodes = 0;
      let drawnEdges = 0;
      const missingCentroid = 0;

      // Edges
      const edgeLayer = svg.querySelector('#edges') as SVGGElement | null;
      if (edgeLayer) {
        while (edgeLayer.firstChild) edgeLayer.removeChild(edgeLayer.firstChild);
        links.forEach((l) => {
          const a = nodes.find((n) => n.id === l.source);
          const b = nodes.find((n) => n.id === l.target);
          if (!a || !b) return;
          const pa = projectLatLngToScreen(a.lat, a.lng);
          const pb = projectLatLngToScreen(b.lat, b.lng);
          if (!pa.facing || !pb.facing) return;

          const sx = pa.x; const sy = pa.y;
          const ex = pb.x; const ey = pb.y;
          const dx = ex - sx;
          const dy = ey - sy;
          const len = Math.max(1, Math.hypot(dx, dy));
          const mx = sx + dx * 0.5;
          const my = sy + dy * 0.5;
          // Perpendicular unit vector
          const px = -dy / len;
          const py = dx / len;
          // Deterministic offset (10–14% of length)
          const seed = hashEdge(`${l.source}→${l.target}`);
          const magnitude = len * (0.10 + 0.04 * ((seed + 1) / 2));
          const cx = mx + px * magnitude * seed;
          const cy = my + py * magnitude * seed;
          const d = `M ${sx} ${sy} Q ${cx} ${cy} ${ex} ${ey}`;

          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          path.setAttribute('d', d);
          path.setAttribute('class', 'river-edge');
          path.setAttribute('fill', 'none');
          path.setAttribute('stroke', 'var(--ink)');
          path.setAttribute('stroke-linecap', 'round');
          path.setAttribute('stroke-linejoin', 'round');
          path.setAttribute('vector-effect', 'non-scaling-stroke');
          // Width variation (slight) based on seed and length
          const width = 0.9 + 0.7 * ((seed + 1) / 2);
          path.setAttribute('stroke-width', String(width));
          // Gentle dash to suggest flow; drift handled via CSS animation
          path.setAttribute('stroke-dasharray', '6 10');
          // Opacity scaled by facing strength of endpoints
          const alpha = 0.28 * ((pa.facingStrength + pb.facingStrength) / 2);
          path.setAttribute('opacity', String(Math.max(0.06, Math.min(0.35, alpha))));
          edgeLayer.appendChild(path);
          drawnEdges++;
        });
      }

      // Nodes + labels
      nodes.forEach((n) => {
        const ent = nodeElementMapRef.current[n.id];
        if (!ent || !ent.circle || !ent.text || !ent.g) return;
        const p = projectLatLngToScreen(n.lat, n.lng);
        if (!p.facing) {
          ent.g.setAttribute('display', 'none');
          return;
        }
        ent.g.removeAttribute('display');
        ent.circle.setAttribute('cx', String(p.x));
        ent.circle.setAttribute('cy', String(p.y));
        ent.text.setAttribute('x', String(p.x));
        ent.text.setAttribute('y', String(p.y + 10));
        drawnNodes++;
      });

      countersRef.current = {
        fetched: nodes.length,
        drawnNodes,
        drawnEdges,
        missingCentroid,
      };

      if (debugRef.current) {
        const c = countersRef.current;
        debugRef.current.textContent = `profiles fetched: ${c.fetched}, nodes drawn: ${c.drawnNodes}, edges: ${c.drawnEdges}` + (c.missingCentroid ? `, missing centroid: ${c.missingCentroid}` : '');
      }
    };
    
    // No boat in simplified look

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onPointerInteract = (event: MouseEvent) => {
        const rect = mount.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(countriesGroup.children, true);

        const countryIntersect = intersects.find(i => i.object.userData.countryName);

        if (countryIntersect) {
            const intersectionPoint = countryIntersect.point;
            const surfaceNormal = intersectionPoint.clone().normalize();
            const toCameraVector = new THREE.Vector3().subVectors(camera.position, intersectionPoint).normalize();
            const dotProduct = surfaceNormal.dot(toCameraVector);

            if (dotProduct > 0.1) {
              const countryName = countryIntersect.object.userData.countryName;
              const { width, height } = getContainerSize();
              const offset = 12;
              let tipW = 120;
              let tipH = 28;
              if (tooltipRef.current) {
                const bb = tooltipRef.current.getBoundingClientRect();
                if (bb.width) tipW = Math.ceil(bb.width);
                if (bb.height) tipH = Math.ceil(bb.height);
              }
              let x = event.clientX - rect.left + offset;
              let y = event.clientY - rect.top + offset;
              x = Math.min(Math.max(0, x), Math.max(0, width - tipW - 1));
              y = Math.min(Math.max(0, y), Math.max(0, height - tipH - 1));
              setTooltip({
                content: countryName,
                x,
                y,
              });
              mount.style.cursor = 'pointer';
              return;
            }
        }

        setTooltip(t => ({ ...t, content: null }));
        if (mount.style.cursor !== 'grabbing') {
            mount.style.cursor = 'grab';
        }
    };
    
    mount.addEventListener('mousemove', onPointerInteract);
    mount.addEventListener('click', onPointerInteract);

    // Double-tap to fullscreen on mobile; double-click support for desktop
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      const now = Date.now();
      if (now - lastTapRef.current < 300) {
        setIsFullscreen(true);
      }
      lastTapRef.current = now;
    };
    const onDblClick = () => setIsFullscreen(true);
    mount.addEventListener('pointerdown', onPointerDown as unknown as EventListener, { passive: true } as AddEventListenerOptions);
    mount.addEventListener('dblclick', onDblClick as unknown as EventListener, { passive: true } as AddEventListenerOptions);

    const animate = () => {
      requestAnimationFrame(animate);
      const delta = clock.getDelta();
      clouds1.rotation.y += delta * 0.012;
      clouds2.rotation.y += delta * 0.008;
      clouds2.rotation.x += delta * 0.002;
      controls.update();
      renderer.render(scene, camera);
      if (nodesRef.current.length > 0) updateOverlayPositions();
    };
    animate();

    const handleResize = () => {
      const { width, height } = getContainerSize();
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      setNodeRadius(computeNodeRadius());
    };

    // Observe container resize to avoid window-based sizing
    let resizeObserver: ResizeObserver | null = null;
    let removeWindowListener = false;
    let win: (Window & typeof globalThis) | null = null;
    if (typeof window !== "undefined") {
      win = window as Window & typeof globalThis;
      const hasResizeObserver = typeof (win as unknown as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver !== 'undefined';
      if (hasResizeObserver) {
        const RO = (win as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver;
        resizeObserver = new RO(() => handleResize());
        resizeObserver.observe(mount);
      } else {
        win.addEventListener('resize', handleResize);
        removeWindowListener = true;
      }
    }

    return () => {
      if (resizeObserver) resizeObserver.disconnect();
      else if (removeWindowListener && win) win.removeEventListener('resize', handleResize);
      mount.removeEventListener('mousemove', onPointerInteract);
      mount.removeEventListener('click', onPointerInteract);
      mount.removeEventListener('pointerdown', onPointerDown as unknown as EventListener);
      mount.removeEventListener('dblclick', onDblClick as unknown as EventListener);
      controls.removeEventListener('start', handleControlStart);
      controls.removeEventListener('end', handleControlEnd);
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
      controls.dispose();
      renderer.dispose();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const isDebug = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === '1';
    fetchGlobeData('all')
      .then(({ nodes, links }) => {
        if (cancelled) return;
        const n = nodes && nodes.length ? nodes : [{ id: 'test', name: 'Test Node', countryCode: 'ZZ', lat: 0, lng: 0 }];
        nodesRef.current = n;
        linksRef.current = links || [];
        setOverlay({ nodes: n, links: links || [] });
        if (isDebug && debugRef.current) {
          const c = countersRef.current;
          debugRef.current.textContent = `profiles fetched: ${n.length}, nodes drawn: ${c.drawnNodes}, edges: ${c.drawnEdges}`;
        }
      })
      .catch(() => {
        if (cancelled) return;
        const n = [{ id: 'test', name: 'Test Node', countryCode: 'ZZ', lat: 0, lng: 0 }];
        nodesRef.current = n;
        linksRef.current = [];
        setOverlay({ nodes: n, links: [] });
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <>
      {/* Normal placement: fills parent container */}
      {!isFullscreen && (
        <div className="relative" style={{ width: '100%', height: '100%' }}>
          <div ref={mountRef} style={{ position: 'absolute', inset: 0 }} />
          <svg ref={overlaySvgRef} aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
            <g id="edges" />
            <g id="nodes">
              {overlay.nodes.map((n) => (
                <g key={n.id} ref={(el) => {
                  if (!nodeElementMapRef.current[n.id]) nodeElementMapRef.current[n.id] = { g: null, circle: null, text: null };
                  if (nodeElementMapRef.current[n.id]) nodeElementMapRef.current[n.id].g = el;
                }}>
                  <circle ref={(el) => {
                    const slot = nodeElementMapRef.current[n.id];
                    if (slot) slot.circle = el;
                  }} r={nodeRadius} fill="var(--teal)" stroke="#fff" strokeWidth={1} style={{ pointerEvents: 'auto' }} tabIndex={0} aria-label={`${n.name}, from ${n.countryCode}`}
                  onMouseEnter={() => {
                    try {
                      const isDebug = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === '1';
                      if (isDebug) {
                        // Temporary verification log; remove after validation
                        // Expect: { code: "IN", name: "India" }
                        // eslint-disable-next-line no-console
                        console.log({ code: n.countryCode, name: getCountryNameFromCode(n.countryCode) });
                      }
                    } catch {}
                  }} />
                  <text ref={(el) => {
                    const slot = nodeElementMapRef.current[n.id];
                    if (slot) slot.text = el;
                  }} textAnchor="middle" fontSize={10} style={{ paintOrder: 'stroke', stroke: 'rgba(255,255,255,0.9)', strokeWidth: 3, fill: 'var(--ink)', pointerEvents: 'none' }}>{n.name}</text>
                </g>
              ))}
            </g>
          </svg>
          <div ref={debugRef} style={{ position: 'absolute', top: 6, left: 6, fontSize: 11, background: 'rgba(255,255,255,0.8)', padding: '2px 6px', borderRadius: 4, color: 'var(--ink)', display: (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === '1') ? 'block' : 'none', pointerEvents: 'none' }} />
          {tooltip.content && (
            <div
              ref={tooltipRef}
              className="absolute bg-white/80 backdrop-blur-sm px-2 py-1 rounded-md shadow-lg pointer-events-none"
              style={{ top: `${tooltip.y}px`, left: `${tooltip.x}px`, zIndex: 30 }}
            >
              <p className="font-mono text-sm text-gray-800">{tooltip.content}</p>
            </div>
          )}
        </div>
      )}
      {/* Fullscreen overlay on mobile double-tap (or double-click) */}
      {isFullscreen && (
        <div className="fixed inset-0 z-[60] bg-white">
          <button
            className="absolute top-3 right-3 z-[70] px-3 py-2 rounded-md bg-white/90 shadow border border-purple-200 text-purple-900"
            aria-label="Close fullscreen globe"
            onClick={() => setIsFullscreen(false)}
          >
            Close
          </button>
          <div className="relative w-full h-full">
            <div ref={mountRef} className="absolute inset-0" />
            {tooltip.content && (
              <div
                ref={tooltipRef}
                className="absolute bg-white/80 backdrop-blur-sm px-2 py-1 rounded-md shadow-lg pointer-events-none"
                style={{ top: `${tooltip.y}px`, left: `${tooltip.x}px`, zIndex: 70 }}
              >
                <p className="font-mono text-sm text-gray-800">{tooltip.content}</p>
              </div>
            )}
          </div>
        </div>
      )}
      <style jsx>{`
        .river-edge { stroke-dashoffset: 0; animation: riverDrift 30s linear infinite; }
        @keyframes riverDrift { from { stroke-dashoffset: 0; } to { stroke-dashoffset: 200; } }
        @media (prefers-reduced-motion: reduce) { .river-edge { animation: none !important; } }
      `}</style>
    </>
  );
};

export default GlobeComponent;

