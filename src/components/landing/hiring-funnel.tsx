"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as React from "react";
import * as THREE from "three";

/**
 * Hiring pipeline funnel (Three.js via React Three Fiber).
 *
 * Candidate "nodes" flow down and spiral inward through a funnel, warming from a
 * neutral tone at the top to brand red as they converge on a single bright point
 * — the hire. It mirrors the product (applicants → shortlist → hire) and the
 * brand's funnel logomark.
 *
 * Client-only and mount-gated (WebGL can't server-render). Honours
 * prefers-reduced-motion by freezing the flow.
 */

const COUNT = 2200;
const TOP_Y = 2.2;
const BOTTOM_Y = -2.1;
const MAX_R = 2.15;
const MIN_R = 0.06;

// Brand palette, sampled as THREE colors.
const COLOR_TOP = new THREE.Color("#b9b49a"); // muted khaki — "just applied"
const COLOR_MID = new THREE.Color("#e58a5c"); // warming
const COLOR_HIRE = new THREE.Color("#e43a38"); // brand red — the hire

/** Soft round sprite so points read as dots, not squares. */
function useCircleTexture() {
  return React.useMemo(() => {
    const size = 64;
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const ctx = c.getContext("2d")!;
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.35, "rgba(255,255,255,0.9)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
  }, []);
}

function funnelRadius(t: number) {
  // t: 0 (bottom) → 1 (top). Wide at top, pinched at the bottom.
  return MIN_R + (MAX_R - MIN_R) * Math.pow(t, 1.35);
}

function FunnelPoints({ reduced }: { reduced: boolean }) {
  const texture = useCircleTexture();
  const pointsRef = React.useRef<THREE.Points>(null);

  // Per-particle state kept outside React so the frame loop mutates freely.
  const particles = React.useMemo(() => {
    const angle = new Float32Array(COUNT);
    const t = new Float32Array(COUNT); // height 0..1
    const speed = new Float32Array(COUNT);
    const jitter = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      angle[i] = Math.random() * Math.PI * 2;
      t[i] = Math.random();
      speed[i] = 0.03 + Math.random() * 0.05;
      jitter[i] = 0.85 + Math.random() * 0.15;
    }
    return { angle, t, speed, jitter };
  }, []);

  const { positions, colors } = React.useMemo(() => {
    const positions = new Float32Array(COUNT * 3);
    const colors = new Float32Array(COUNT * 3);
    return { positions, colors };
  }, []);

  const tmp = React.useMemo(() => new THREE.Color(), []);

  const write = React.useCallback(() => {
    const { angle, t, jitter } = particles;
    for (let i = 0; i < COUNT; i++) {
      const ti = t[i];
      const r = funnelRadius(ti) * jitter[i];
      const y = BOTTOM_Y + (TOP_Y - BOTTOM_Y) * ti;
      const a = angle[i];
      positions[i * 3] = Math.cos(a) * r;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = Math.sin(a) * r;

      // Colour warms as the node descends (progresses toward hire).
      if (ti > 0.5) tmp.copy(COLOR_TOP).lerp(COLOR_MID, (1 - ti) / 0.5);
      else tmp.copy(COLOR_MID).lerp(COLOR_HIRE, (0.5 - ti) / 0.5);
      colors[i * 3] = tmp.r;
      colors[i * 3 + 1] = tmp.g;
      colors[i * 3 + 2] = tmp.b;
    }
  }, [particles, positions, colors, tmp]);

  // Initial fill.
  React.useEffect(() => {
    write();
    const geo = pointsRef.current?.geometry;
    if (geo) {
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
    }
  }, [write]);

  useFrame((_, delta) => {
    if (reduced) return;
    const d = Math.min(delta, 0.05);
    const { angle, t, speed } = particles;
    for (let i = 0; i < COUNT; i++) {
      t[i] -= speed[i] * d; // flow down
      angle[i] += (0.25 + (1 - t[i]) * 0.5) * d; // swirl faster as it narrows
      if (t[i] <= 0) {
        t[i] += 1; // recycle to the top
        angle[i] = Math.random() * Math.PI * 2;
      }
    }
    write();
    const geo = pointsRef.current?.geometry;
    if (geo) {
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
    }
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.075}
        map={texture}
        alphaMap={texture}
        vertexColors
        transparent
        depthWrite={false}
        sizeAttenuation
        opacity={0.95}
      />
    </points>
  );
}

/** The bright convergence point + soft glow — the "hire". */
function HirePoint() {
  const texture = useCircleTexture();
  return (
    <group position={[0, BOTTOM_Y - 0.05, 0]}>
      <mesh>
        <sphereGeometry args={[0.08, 24, 24]} />
        <meshBasicMaterial color="#e43a38" />
      </mesh>
      <sprite scale={[1.1, 1.1, 1.1]}>
        <spriteMaterial map={texture} color="#e43a38" transparent opacity={0.5} depthWrite={false} />
      </sprite>
    </group>
  );
}

/** Gentle mouse parallax on the whole funnel. */
function ParallaxRig({ children, reduced }: { children: React.ReactNode; reduced: boolean }) {
  const group = React.useRef<THREE.Group>(null);
  const { pointer } = useThree();
  useFrame(() => {
    if (!group.current) return;
    const targetX = reduced ? 0.35 : 0.35 + pointer.y * 0.12;
    const targetY = reduced ? 0 : pointer.x * 0.35;
    group.current.rotation.x += (targetX - group.current.rotation.x) * 0.05;
    group.current.rotation.y += (targetY - group.current.rotation.y) * 0.05;
  });
  return <group ref={group}>{children}</group>;
}

export function HiringFunnel() {
  const [mounted, setMounted] = React.useState(false);
  const [reduced, setReduced] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  if (!mounted) {
    return <div className="size-full" aria-hidden />;
  }

  return (
    <Canvas
      aria-hidden
      dpr={[1, 1.75]}
      camera={{ position: [0, 0.6, 6.2], fov: 42 }}
      gl={{ antialias: true, alpha: true }}
      style={{ background: "transparent" }}
    >
      <ParallaxRig reduced={reduced}>
        <FunnelPoints reduced={reduced} />
        <HirePoint />
      </ParallaxRig>
    </Canvas>
  );
}
