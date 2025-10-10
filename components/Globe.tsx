"use client";

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as topojson from 'topojson-client';
import type { Feature, FeatureCollection } from '../types';

const GlobeComponent: React.FC = () => {
  const mountRef = useRef<HTMLDivElement>(null);
  const pathsRef = useRef<THREE.CatmullRomCurve3[]>([]);
  const pathLengthsRef = useRef<number[]>([]);
  const boatStateRef = useRef({ pathIndex: 0, distanceTraveled: 0 });
  const lastTapRef = useRef<number>(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [tooltip, setTooltip] = useState<{
    content: string | null;
    x: number;
    y: number;
  }>({ content: null, x: 0, y: 0 });

  useEffect(() => {
    if (!mountRef.current) return;
    const mount = mountRef.current;

    const clock = new THREE.Clock();

    // Scene setup
    const scene = new THREE.Scene();
    const sceneColor = 0xf7f6f2;
    scene.background = new THREE.Color(sceneColor);
    scene.fog = new THREE.Fog(sceneColor, 250, 450);


    // Camera setup
    const camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.position.z = 300;

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    mount.appendChild(renderer.domElement);
    
    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.1);
    directionalLight.position.set(200, 100, 300);
    scene.add(directionalLight);

    // Orbit controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 150;
    controls.maxDistance = 500;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.5;

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

    // Ocean sphere (Glass Shell)
    const oceanGeometry = new THREE.IcosahedronGeometry(globeRadius, 20);
    const oceanMaterial = new THREE.MeshPhysicalMaterial({
        color: 0xadd8e6, // Lighter blue for glass
        roughness: 0.05,
        metalness: 0.0,
        transmission: 0.95,
        transparent: true,
        ior: 1.5, // Index of refraction closer to glass
        thickness: 15, // Simulates glass thickness for better refraction
        clearcoat: 1.0, // Adds a glossy clear coat layer
        clearcoatRoughness: 0.1,
    });
    const oceanSphere = new THREE.Mesh(oceanGeometry, oceanMaterial);
    scene.add(oceanSphere);
    const originalOceanPositions = oceanGeometry.attributes.position.clone();

    // Inner Liquid Core (for blurry effect)
    const innerCoreGeometry = new THREE.IcosahedronGeometry(globeRadius - 8, 10);
    const innerCoreMaterial = new THREE.MeshPhysicalMaterial({
        color: 0x54a0d4, // Deeper, slightly murky blue
        roughness: 0.4,
        metalness: 0.0,
        transmission: 0.8,
        transparent: true,
        opacity: 0.6,
        ior: 1.33,
    });
    const innerCore = new THREE.Mesh(innerCoreGeometry, innerCoreMaterial);
    scene.add(innerCore);

    // Cloud Layer
    const textureLoader = new THREE.TextureLoader();
    const cloudTexture = textureLoader.load('https://s3-us-west-2.amazonaws.com/s.cdpn.io/141228/earthcloudmap.jpg');
    const cloudGeometry = new THREE.IcosahedronGeometry(globeRadius + 3, 12);
    const cloudMaterial = new THREE.MeshPhongMaterial({
        map: cloudTexture,
        alphaMap: cloudTexture,
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
    });
    const clouds = new THREE.Mesh(cloudGeometry, cloudMaterial);
    scene.add(clouds);

    // Group to hold all country meshes for raycasting
    const countriesGroup = new THREE.Group();
    scene.add(countriesGroup);
    
    // Group to hold all markers
    const markersGroup = new THREE.Group();
    scene.add(markersGroup);

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
        const landMaterial = new THREE.MeshStandardMaterial({ color: 0x9a7b4f, roughness: 0.8 });

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

                return new THREE.Mesh(geometry, landMaterial);
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
    
    const createBoatPaths = (geoJson: FeatureCollection) => {
        const points = [];
        const validFeatures = geoJson.features.filter(f => f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'));

        for (let i = 0; i < 10; i++) {
            const feature = validFeatures[Math.floor(Math.random() * validFeatures.length)];
            let coords: number[];
            if (feature.geometry.type === 'Polygon') {
                coords = feature.geometry.coordinates[0][0];
            } else { // MultiPolygon
                coords = feature.geometry.coordinates[0][0][0];
            }
            if (coords && coords.length >= 2) {
                points.push(latLonToVector3(coords[1], coords[0], globeRadius + 0.1));
            }
        }

        const riverMaterial = new THREE.MeshPhysicalMaterial({
            color: 0x54a0d4,
            transmission: 0.7,
            roughness: 0.2,
            metalness: 0.0,
            transparent: true,
            opacity: 0.8,
            ior: 1.33
        });

        // Marker setup
        const markerMaterial = new THREE.MeshStandardMaterial({
            color: 0xdc143c, // Crimson red
            roughness: 0.4,
            metalness: 0.1
        });
        const markerHeight = 2.5;
        const markerGeometry = new THREE.CylinderGeometry(0.2, 0.2, markerHeight, 8);
        markerGeometry.translate(0, markerHeight / 2, 0); // Pivot at the bottom

        // Add a marker for each connection point
        points.forEach(point => {
            const marker = new THREE.Mesh(markerGeometry, markerMaterial);
            marker.position.copy(point);
            
            // Orient the marker to point outwards from the globe's center
            const normal = point.clone().normalize();
            const up = new THREE.Vector3(0, 1, 0); // Default cylinder orientation
            marker.quaternion.setFromUnitVectors(up, normal);
            
            markersGroup.add(marker);
        });

        for (let i = 0; i < points.length; i++) {
            const startPoint = points[i];
            const endPoint = points[(i + 1) % points.length];

            const controlPoints = [];
            const segments = 10;
            for(let j = 1; j < segments; j++) {
                const t = j / segments;
                const intermediatePoint = new THREE.Vector3().lerpVectors(startPoint, endPoint, t);
                const tangent = new THREE.Vector3().crossVectors(intermediatePoint, new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)).normalize();
                const offset = Math.sin(t * Math.PI) * (startPoint.distanceTo(endPoint) / 5);
                intermediatePoint.add(tangent.multiplyScalar(offset));
                intermediatePoint.normalize().multiplyScalar(globeRadius + 0.1);
                controlPoints.push(intermediatePoint);
            }
            
            const curve = new THREE.CatmullRomCurve3([startPoint, ...controlPoints, endPoint]);
            pathsRef.current.push(curve);

            const tubeGeometry = new THREE.TubeGeometry(curve, 100, 0.5, 8, false);
            const riverMesh = new THREE.Mesh(tubeGeometry, riverMaterial);
            scene.add(riverMesh);
        }
        pathLengthsRef.current = pathsRef.current.map(p => p.getLength());
    };

    const loadAndDrawGlobe = async () => {
        try {
            const res = await fetch('https://unpkg.com/world-atlas@2.0.2/countries-110m.json');
            if (!res.ok) throw new Error('Failed to fetch world data');
            const worldData = await res.json();
            
            const countriesGeoJson = topojson.feature(worldData, worldData.objects.countries) as unknown as FeatureCollection;
            renderWorldFromGeoJson(countriesGeoJson);
            createBoatPaths(countriesGeoJson);
        } catch (error) {
            console.error("Error loading or processing world data:
", error);
        }
    };

    loadAndDrawGlobe();
    
    const boat = new THREE.Group();
    const boatMaterial = new THREE.MeshStandardMaterial({
      color: 0xf7f5e6,
      roughness: 0.9,
      metalness: 0.1,
      side: THREE.DoubleSide
    });
    const hullGeom = new THREE.BoxGeometry(1.5, 0.4, 0.8);
    const hull = new THREE.Mesh(hullGeom, boatMaterial);
    hull.position.y = -0.2;
    boat.add(hull);
    const sailGeom = new THREE.PlaneGeometry(1.2, 1.8);
    sailGeom.translate(0, 0.9, 0); 
    const sail = new THREE.Mesh(sailGeom, boatMaterial);
    boat.add(sail);
    boat.scale.set(2, 2, 2);
    scene.add(boat);

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onPointerInteract = (event: MouseEvent) => {
        mouse.x = (event.clientX / renderer.domElement.clientWidth) * 2 - 1;
        mouse.y = -(event.clientY / renderer.domElement.clientHeight) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects([oceanSphere, ...countriesGroup.children], true);
        
        if (intersects.length > 0 && intersects[0].object === oceanSphere) {
             setTooltip(t => ({ ...t, content: null }));
             if (mount.style.cursor !== 'grabbing') {
                mount.style.cursor = 'grab';
             }
             return;
        }

        const countryIntersect = intersects.find(i => i.object.userData.countryName);

        if (countryIntersect) {
            const countryName = countryIntersect.object.userData.countryName;
            setTooltip({ content: countryName, x: event.clientX, y: event.clientY });
            mount.style.cursor = 'pointer';
        } else {
            setTooltip(t => ({ ...t, content: null }));
            if (mount.style.cursor !== 'grabbing') {
                mount.style.cursor = 'grab';
            }
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
    mount.addEventListener('pointerdown', onPointerDown, { passive: true });
    mount.addEventListener('dblclick', onDblClick, { passive: true });

    const animate = () => {
      requestAnimationFrame(animate);
      const delta = clock.getDelta();
      const elapsedTime = clock.getElapsedTime();
      
      clouds.rotation.y += delta * 0.01;

      const state = boatStateRef.current;
      const paths = pathsRef.current;
      const pathLengths = pathLengthsRef.current;

      if (paths.length > 0 && pathLengths.length > 0) {
        const currentPath = paths[state.pathIndex];
        const totalPathLength = pathLengths[state.pathIndex];
        
        const currentProgress = totalPathLength > 0 ? state.distanceTraveled / totalPathLength : 0;

        const tangent = currentPath.getTangentAt(currentProgress).normalize();
        const lookAheadDistanceForCurvature = 5;
        const nextTangentProgress = totalPathLength > 0 ? Math.min(currentProgress + (lookAheadDistanceForCurvature / totalPathLength), 1) : 1;
        const nextTangent = currentPath.getTangentAt(nextTangentProgress).normalize();
        
        const curvature = (1 - tangent.dot(nextTangent)) * 100;

        const baseSpeed = 10;
        const maxSpeedFactor = 1.5;
        const minSpeedFactor = 0.5;

        const speedFactor = THREE.MathUtils.lerp(maxSpeedFactor, minSpeedFactor, THREE.MathUtils.smoothstep(curvature, 0, 0.5));
        const currentSpeed = baseSpeed * speedFactor;

        state.distanceTraveled += currentSpeed * delta;

        if (state.distanceTraveled >= totalPathLength) {
            state.distanceTraveled = 0;
            state.pathIndex = (state.pathIndex + 1) % paths.length;
        }
        
        const newProgress = totalPathLength > 0 ? state.distanceTraveled / totalPathLength : 0;
        const currentPos = currentPath.getPointAt(newProgress);
        
        const lookAheadDistanceForOrientation = 1;
        const lookAtProgress = totalPathLength > 0 ? Math.min(newProgress + (lookAheadDistanceForOrientation / totalPathLength), 1) : 1;
        const lookAtPos = currentPath.getPointAt(lookAtProgress);
        
        const bobbingSpeed = 2.5;
        const bobbingAmount = 0.1;
        const bobbing = Math.sin(elapsedTime * bobbingSpeed) * bobbingAmount;

        currentPos.normalize().multiplyScalar(globeRadius + 0.2 + bobbing);
        lookAtPos.normalize().multiplyScalar(globeRadius + 0.2);
        
        boat.position.copy(currentPos);
        boat.lookAt(lookAtPos);
      }
      
      const oceanPositions = oceanSphere.geometry.attributes.position;
      const time = elapsedTime * 0.3;
      for (let i = 0; i < oceanPositions.count; i++) {
        const originalPos = new THREE.Vector3().fromBufferAttribute(originalOceanPositions, i);
        const distortedPos = new THREE.Vector3().fromBufferAttribute(originalOceanPositions, i).normalize();
        
        const wave1 = Math.sin(originalPos.x * 0.1 + time) * 0.2;
        const wave2 = Math.cos(originalPos.y * 0.1 + time) * 0.2;
        const wave3 = Math.sin(originalPos.z * 0.1 + time) * 0.2;
        const totalWave = wave1 + wave2 + wave3;
        
        distortedPos.multiplyScalar(globeRadius + totalWave);
        oceanPositions.setXYZ(i, distortedPos.x, distortedPos.y, distortedPos.z);
      }
      oceanSphere.geometry.attributes.position.needsUpdate = true;
      oceanSphere.geometry.computeVertexNormals();

      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      mount.removeEventListener('mousemove', onPointerInteract);
      mount.removeEventListener('click', onPointerInteract);
      mount.removeEventListener('pointerdown', onPointerDown as any);
      mount.removeEventListener('dblclick', onDblClick as any);
      controls.removeEventListener('start', handleControlStart);
      controls.removeEventListener('end', handleControlEnd);
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
      controls.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <>
      {/* Normal placement */}
      {!isFullscreen && (
        <div ref={mountRef} style={{ width: '100%', height: '100vh' }} />
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
          <div ref={mountRef} className="relative w-full h-full" />
        </div>
      )}
      {tooltip.content && (
        <div 
          className="absolute bg-white/80 backdrop-blur-sm p-3 rounded-md shadow-lg pointer-events-none transition-opacity duration-300"
          style={{
            top: `${tooltip.y}px`,
            left: `${tooltip.x}px`,
            transform: 'translate(15px, -30px)'
          }}
        >
          <p className="font-mono font-bold text-lg text-gray-800">{tooltip.content}</p>
        </div>
      )}
    </>
  );
};

export default GlobeComponent;

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import { fetchGlobeData, subscribeRealtime, type GlobeNode, type GlobeLink, type TimeFilter } from "@/lib/globeData";

type Size = { width: number; height: number };

const BRAND = {
  bg: "#faf8f5",
  land: "#a295b5",
  grid: "#e8c3d6",
  node: "#654f84",
  link: "#e8c3d6",
  halo: "rgba(101,79,132,0.2)",
};

export default function Globe() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<Size>({ width: 800, height: 480 });
  const [filter, setFilter] = useState<TimeFilter>("all");
  const nodesRef = useRef<GlobeNode[]>([]);
  const linksRef = useRef<GlobeLink[]>([]);
  const rotatingRef = useRef<[number, number, number]>([0, -15, 0]);

  // Resize observer
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const cr = e.contentRect;
        setSize({ width: Math.max(320, cr.width), height: Math.max(320, Math.min(720, cr.width * 0.6)) });
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Data load + realtime
  useEffect(() => {
    let unsub: (() => void) | null = null;
    (async () => {
      const { nodes, links } = await fetchGlobeData(filter);
      nodesRef.current = nodes;
      linksRef.current = links;
      draw();
      unsub = subscribeRealtime((u) => {
        // Minimal live-updates: refetch for simplicity at this scale
        fetchGlobeData(filter).then(({ nodes, links }) => {
          nodesRef.current = nodes;
          linksRef.current = links;
          draw();
        });
      });
    })();
    return () => {
      if (unsub) unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const projection = useMemo(() => d3.geoOrthographic(), []);
  const path = useMemo(() => d3.geoPath(projection), [projection]);
  const graticule = useMemo(() => d3.geoGraticule10(), []);

  // Basic world land from topojson (inline light sphere only if topo unavailable)
  // To keep this self-contained without external fetch, draw sphere + grid only.

  function draw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { width, height } = size;
    canvas.width = width;
    canvas.height = height;
    ctx.clearRect(0, 0, width, height);

    const scale = Math.min(width, height) * 0.45;
    projection.translate([width / 2, height / 2]).scale(scale).rotate(rotatingRef.current);

    // Background
    ctx.fillStyle = BRAND.bg;
    ctx.fillRect(0, 0, width, height);

    // Globe (sphere)
    ctx.beginPath();
    path.context(ctx)({ type: "Sphere" });
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = BRAND.grid;
    ctx.stroke();

    // Graticule
    ctx.beginPath();
    path(graticule);
    ctx.lineWidth = 0.5;
    ctx.strokeStyle = BRAND.grid;
    ctx.stroke();

    // Links (great-circle-like arcs)
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = BRAND.link;
    ctx.globalAlpha = 0.75;
    for (const link of linksRef.current) {
      const s = nodesRef.current.find((n) => n.id === link.source);
      const t = nodesRef.current.find((n) => n.id === link.target);
      if (!s || !t) continue;
      drawArc(ctx, s, t);
    }
    ctx.globalAlpha = 1;

    // Nodes
    for (const n of nodesRef.current) {
      const p = projection([n.lng, n.lat]);
      if (!p) continue;
      ctx.beginPath();
      ctx.arc(p[0], p[1], 3, 0, Math.PI * 2);
      ctx.fillStyle = BRAND.node;
      ctx.fill();
      // Halo
      ctx.beginPath();
      ctx.arc(p[0], p[1], 6, 0, Math.PI * 2);
      ctx.strokeStyle = BRAND.halo;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  function drawArc(ctx: CanvasRenderingContext2D, a: GlobeNode, b: GlobeNode) {
    const interp = d3.geoInterpolate([a.lng, a.lat], [b.lng, b.lat]);
    const steps = 32;
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const [lng, lat] = interp(i / steps);
      const p = projection([lng, lat]);
      if (!p) continue;
      if (i === 0) ctx.moveTo(p[0], p[1]);
      else ctx.lineTo(p[0], p[1]);
    }
    ctx.stroke();
  }

  // Interaction: rotate via drag; allow page scroll on touch unless dragging
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let dragging = false;
    let lastX = 0,
      lastY = 0;
    const onDown = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      const rot = rotatingRef.current.slice() as [number, number, number];
      rot[0] += dx * 0.3;
      rot[1] -= dy * 0.3;
      rotatingRef.current = rot;
      draw();
    };
    const onUp = (e: PointerEvent) => {
      dragging = false;
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {}
    };
    canvas.addEventListener("pointerdown", onDown, { passive: true });
    canvas.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.width, size.height]);

  // Redraw on size/rotation
  useEffect(() => {
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.width, size.height]);

  return (
    <section className="w-full py-6 lg:py-10">
      <div className="mx-auto max-w-6xl px-4" ref={containerRef}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-semibold text-purple-900">Dream River – Globe</h2>
          <div className="inline-flex items-center gap-2 text-sm">
            <button
              className={`px-2.5 py-1 rounded ${filter === "all" ? "bg-purple-200" : "bg-purple-100"}`}
              onClick={() => setFilter("all")}
            >
              All
            </button>
            <button
              className={`px-2.5 py-1 rounded ${filter === "30d" ? "bg-purple-200" : "bg-purple-100"}`}
              onClick={() => setFilter("30d")}
            >
              30d
            </button>
            <button
              className={`px-2.5 py-1 rounded ${filter === "7d" ? "bg-purple-200" : "bg-purple-100"}`}
              onClick={() => setFilter("7d")}
            >
              7d
            </button>
          </div>
        </div>
        <div className="relative w-full overflow-hidden rounded-md border border-purple-200">
          <canvas ref={canvasRef} className="block w-full h-auto touch-pan-y" />
        </div>
        <p className="mt-2 text-xs text-purple-700">Pan to rotate. Real-time updates from Supabase. Links show parent→child referrals; pins show recent participants.</p>
      </div>
    </section>
  );
}


