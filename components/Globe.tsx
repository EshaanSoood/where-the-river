"use client";

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as topojson from 'topojson-client';
import type { FeatureCollection } from '../types';
import { fetchGlobeData } from '@/lib/globeData';
// Country name resolution handled via mesh userData; no DOM node overlay

const GlobeComponent: React.FC = () => {
  const mountRef = useRef<HTMLDivElement>(null);
  
  const lastTapRef = useRef<number>(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [tooltip, setTooltip] = useState<{
    content: string | null;
    x: number;
    y: number;
  }>({ content: null, x: 0, y: 0 });
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  

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
    

    const camera = new THREE.PerspectiveCamera(45, initialWidth / initialHeight, 0.1, 2000);
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

    // Stars (far background, exempt from fog)
    const starGeometry = new THREE.BufferGeometry();
    const starVerts: number[] = [];
    const starRadius = 1500;
    const starCount = (typeof window !== 'undefined' && window.innerWidth < 768) ? 3000 : 10000;
    for (let i = 0; i < starCount; i++) {
      const u = Math.random();
      const v = Math.random();
      const theta = 2 * Math.PI * u;
      const phi = Math.acos(2 * v - 1);
      const x = starRadius * Math.sin(phi) * Math.cos(theta);
      const y = starRadius * Math.sin(phi) * Math.sin(theta);
      const z = starRadius * Math.cos(phi);
      starVerts.push(x, y, z);
    }
    starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starVerts, 3));
    const starMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 0.7, transparent: true, opacity: 0.8 });
    starMaterial.fog = false;
    const stars = new THREE.Points(starGeometry, starMaterial);
    scene.add(stars);

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
    
    // Removed boat paths/markers and SVG overlays for simplified visual style

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
    };
    animate();

    const handleResize = () => {
      const { width, height } = getContainerSize();
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
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

  // Removed SVG overlay data fetch; globe runs without DOM nodes/edges overlay

  return (
    <>
      {/* Normal placement: fills parent container */}
      {!isFullscreen && (
        <div className="relative" style={{ width: '100%', height: '100%' }}>
          <div ref={mountRef} style={{ position: 'absolute', inset: 0 }} />
          
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
      
    </>
  );
};

export default GlobeComponent;

