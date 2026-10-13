"use client";

import { Canvas, ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, RoundedBox } from "@react-three/drei";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { FACE_NORMALS, STICKER_POINTS, Vec3, dot, layerDepth } from "@/lib/cube/geometry";
import { Move, invertMove, moveLayers, parseMove } from "@/lib/cube/moves";
import { COLOR_HEX, EMPTY } from "@/lib/cube/state";
import { displayedState, useCube } from "@/store/cubeStore";

const EMPTY_HEX = "#8a8f98";
const FACE_LETTERS = ["U", "R", "F", "D", "L", "B"];

export const VIEWS: Record<string, [number, number, number]> = {
  default: [6.4, 5.2, 7.6],
  back: [-6.4, 5.2, -7.6],
  top: [0.001, 11.2, 0.8],
  bottom: [0.001, -11.2, 0.8],
  left: [-7.6, 5.2, 6.4],
  right: [7.6, 5.2, -6.4],
};

const CUBIES: Vec3[] = [];
for (const x of [-3, -1, 1, 3])
  for (const y of [-3, -1, 1, 3])
    for (const z of [-3, -1, 1, 3]) if (Math.abs(x) === 3 || Math.abs(y) === 3 || Math.abs(z) === 3) CUBIES.push([x, y, z]);

function inLayer(depth: number, m: Move) {
  return (moveLayers(m) & (1 << (depth - 1))) !== 0;
}
const cubieDepth = (c: Vec3, face: number) => (3 - dot(c, FACE_NORMALS[face])) / 2 + 1;

const stickerShape = (() => {
  const s = new THREE.Shape();
  const h = 0.42;
  const r = 0.1;
  s.moveTo(-h + r, -h);
  s.lineTo(h - r, -h);
  s.quadraticCurveTo(h, -h, h, -h + r);
  s.lineTo(h, h - r);
  s.quadraticCurveTo(h, h, h - r, h);
  s.lineTo(-h + r, h);
  s.quadraticCurveTo(-h, h, -h, h - r);
  s.lineTo(-h, -h + r);
  s.quadraticCurveTo(-h, -h, -h + r, -h);
  return s;
})();

interface Anim {
  move: Move;
  from: Uint8Array;
  start: number;
  duration: number;
}

const Z = new THREE.Vector3(0, 0, 1);
const STICKER_TRANSFORMS = STICKER_POINTS.map((p, i) => {
  const n = FACE_NORMALS[Math.floor(i / 16)];
  const pos = new THREE.Vector3(p[0] / 2 + n[0] * 0.006, p[1] / 2 + n[1] * 0.006, p[2] / 2 + n[2] * 0.006);
  const q = new THREE.Quaternion().setFromUnitVectors(Z, new THREE.Vector3(...n));
  return { pos, q };
});

const Sticker = memo(function Sticker({
  index,
  color,
  flagged,
  editable,
  onPaint,
}: {
  index: number;
  color: number;
  flagged: boolean;
  editable: boolean;
  onPaint: (i: number) => void;
}) {
  const [hover, setHover] = useState(false);
  const { pos, q } = STICKER_TRANSFORMS[index];
  const hex = color === EMPTY ? EMPTY_HEX : COLOR_HEX[color];
  return (
    <group position={pos} quaternion={q}>
      {flagged && (
        <mesh position={[0, 0, -0.002]} scale={1.16}>
          <shapeGeometry args={[stickerShape]} />
          <meshBasicMaterial color="#ff2d55" />
        </mesh>
      )}
      <mesh
        scale={hover && editable ? 1.06 : 1}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          if (!editable || e.delta > 6) return;
          e.stopPropagation();
          onPaint(index);
        }}
        onPointerOver={(e) => {
          if (!editable) return;
          e.stopPropagation();
          setHover(true);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHover(false);
          document.body.style.cursor = "";
        }}
      >
        <shapeGeometry args={[stickerShape]} />
        <meshStandardMaterial color={hex} roughness={color === EMPTY ? 0.9 : 0.35} metalness={0.02} />
      </mesh>
    </group>
  );
});

function FaceLabel({ face, color }: { face: number; color: string }) {
  const texture = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d")!;
    g.fillStyle = color;
    g.font = "600 84px ui-sans-serif, system-ui, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(FACE_LETTERS[face], 64, 70);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [face, color]);
  const n = FACE_NORMALS[face];
  return (
    <sprite position={[n[0] * 2.75, n[1] * 2.75, n[2] * 2.75]} scale={0.55}>
      <spriteMaterial map={texture} transparent depthWrite={false} />
    </sprite>
  );
}

function CubeModel({ dark }: { dark: boolean }) {
  const mode = useCube((s) => s.mode);
  const stickers = useCube((s) => s.stickers);
  const solution = useCube((s) => s.solution);
  const solveStart = useCube((s) => s.solveStart);
  const step = useCube((s) => s.step);
  const speed = useCube((s) => s.speed);
  const validation = useCube((s) => s.validation);
  const paint = useCube((s) => s.paint);

  const target = useMemo(
    () => displayedState({ mode, stickers, solution, solveStart, step }),
    [mode, stickers, solution, solveStart, step],
  );
  const [anim, setAnim] = useState<Anim | null>(null);
  const prev = useRef<{ step: number; solution: unknown; state: Uint8Array }>({ step, solution, state: target });

  useEffect(() => {
    const p = prev.current;
    if (mode === "solve" && solution && p.solution === solution && Math.abs(step - p.step) === 1) {
      const forward = step > p.step;
      const m = forward ? parseMove(solution.moves[step - 1]) : invertMove(parseMove(solution.moves[step]));
      const duration = Math.min(650, (0.85 * 1000) / speed) * (m.amount === 2 ? 1.25 : 1);
      setAnim({ move: m, from: p.state, start: performance.now(), duration });
    } else {
      setAnim(null);
    }
    prev.current = { step, solution, state: target };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const rotGroup = useRef<THREE.Group>(null);
  useFrame((three) => {
    if (!anim || !rotGroup.current) return;
    three.invalidate(); // frameloop is "demand": keep rendering only while a turn is animating
    const t = Math.min(1, (performance.now() - anim.start) / anim.duration);
    const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const quarters = anim.move.amount === 3 ? -1 : anim.move.amount;
    const n = FACE_NORMALS[anim.move.face];
    rotGroup.current.quaternion.setFromAxisAngle(new THREE.Vector3(...n), -quarters * (Math.PI / 2) * e);
    if (t >= 1) setAnim(null);
  });

  // Next move to perform (highlighted while paused) or the move being animated.
  const highlightMove: Move | null = anim
    ? anim.move
    : mode === "solve" && solution && step < solution.moves.length
      ? parseMove(solution.moves[step])
      : null;

  const colors = anim ? anim.from : target;
  const flagged = useMemo(() => new Set(validation && !validation.ok ? validation.issues.flatMap((i) => i.stickers) : []), [validation]);

  const moving = (depthOf: (face: number) => number) => anim !== null && inLayer(depthOf(anim.move.face), anim.move);

  const bodyColor = dark ? "#0b0d12" : "#15171c";
  const highlightColor = dark ? "#2c3797" : "#5563e6";

  const cubie = (c: Vec3, k: number) => {
    const hl = highlightMove && inLayer(cubieDepth(c, highlightMove.face), highlightMove);
    return (
      <RoundedBox key={`c${k}`} args={[0.97, 0.97, 0.97]} radius={0.07} smoothness={3} position={[c[0] / 2, c[1] / 2, c[2] / 2]}>
        <meshStandardMaterial color={hl ? highlightColor : bodyColor} roughness={0.55} />
      </RoundedBox>
    );
  };
  const sticker = (i: number) => (
    <Sticker key={`s${i}`} index={i} color={colors[i]} flagged={flagged.has(i)} editable={mode === "edit"} onPaint={paint} />
  );

  const staticCubies: React.ReactNode[] = [];
  const movingCubies: React.ReactNode[] = [];
  CUBIES.forEach((c, k) => (moving((f) => cubieDepth(c, f)) ? movingCubies : staticCubies).push(cubie(c, k)));
  const staticStickers: React.ReactNode[] = [];
  const movingStickers: React.ReactNode[] = [];
  for (let i = 0; i < 96; i++) (moving((f) => layerDepth(i, f)) ? movingStickers : staticStickers).push(sticker(i));

  return (
    <group>
      <group>
        {staticCubies}
        {staticStickers}
      </group>
      <group ref={rotGroup} key={anim ? `a${anim.start}` : "idle"}>
        {movingCubies}
        {movingStickers}
      </group>
      {[0, 1, 2, 3, 4, 5].map((f) => (
        <FaceLabel key={f} face={f} color={dark ? "#9aa3b5" : "#5b6375"} />
      ))}
    </group>
  );
}

/** Narrow (portrait) canvases need the camera further away so the cube fits horizontally. */
const fitFactor = (aspect: number) => (aspect < 1.05 ? Math.pow(1.05 / aspect, 0.9) : 1);

function ViewController() {
  const req = useCube((s) => s.viewRequest);
  const { camera, controls, size, invalidate } = useThree() as unknown as {
    invalidate: () => void;
    camera: THREE.Camera;
    controls: OrbitControlsImpl | null;
    size: { width: number; height: number };
  };
  const anim = useRef<{ from: THREE.Vector3; to: THREE.Vector3; start: number } | null>(null);
  const fit = fitFactor(size.width / Math.max(1, size.height));
  useEffect(() => {
    camera.position.setLength(new THREE.Vector3(...VIEWS.default).length() * fit);
    controls?.update();
    invalidate();
  }, [fit, camera, controls, invalidate]);
  useEffect(() => {
    if (req.n === 0) return;
    const dist = camera.position.length();
    const to = new THREE.Vector3(...(VIEWS[req.name] ?? VIEWS.default)).multiplyScalar(fit);
    if (req.name.startsWith("zoom")) {
      const f = req.name === "zoom-in" ? 0.82 : 1.22;
      const len = Math.min(18 * fit, Math.max(6, dist * f));
      to.copy(camera.position).setLength(len);
    }
    anim.current = { from: camera.position.clone(), to, start: performance.now() };
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [req, camera]);
  useFrame((three) => {
    const a = anim.current;
    if (!a) return;
    three.invalidate();
    const t = Math.min(1, (performance.now() - a.start) / 450);
    const e = 1 - Math.pow(1 - t, 3);
    // Interpolate direction and length separately so the camera orbits rather than cutting through the cube.
    const dir = a.from.clone().normalize().lerp(a.to.clone().normalize(), e).normalize();
    const len = THREE.MathUtils.lerp(a.from.length(), a.to.length(), e);
    camera.position.copy(dir.multiplyScalar(len));
    camera.lookAt(0, 0, 0);
    controls?.update();
    if (t >= 1) anim.current = null;
  });
  return null;
}

export default function CubeCanvas({ dark }: { dark: boolean }) {
  return (
    <Canvas
      frameloop="demand"
      dpr={[1, 2]}
      camera={{ position: VIEWS.default, fov: 34 }}
      gl={{ antialias: true, preserveDrawingBuffer: true }}
      aria-label="Interactive 3D 4x4x4 cube. Drag to rotate, scroll or pinch to zoom, click a sticker to paint it."
      data-testid="cube-canvas"
    >
      <hemisphereLight args={["#ffffff", dark ? "#30343d" : "#b9bec9", 1.3]} />
      <directionalLight position={[6, 9, 7]} intensity={1.4} />
      <directionalLight position={[-7, -4, -6]} intensity={0.45} />
      <CubeModel dark={dark} />
      <OrbitControls makeDefault enablePan={false} minDistance={6} maxDistance={24} rotateSpeed={0.9} />
      <ViewController />
    </Canvas>
  );
}
