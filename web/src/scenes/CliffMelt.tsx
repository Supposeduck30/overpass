import { useEffect, useMemo, useRef, type KeyboardEvent } from "react";
import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { hexToRgb, sequential, TOKENS, type RampName } from "../lib/color";
import { MONTH_INITIALS, MONTHS, toYm, ymParts } from "../lib/format";
import { prefersReducedMotion } from "../lib/hooks";
import type { CellValue } from "../lib/series";
import type { Handoff } from "../views/calendarModel";
import { buildGrid, buildSurface, CELL_X, CELL_Z, contourStep, drape, handoffPath, HEIGHT, pick, worldX, worldZ, type Grid } from "./terrain";

const SETTLE_MS = 2500;
/** The settle plays once per visit, not each time the scene is reopened. */
let settled = false;

const REST = { azimuth: 0.56, elevation: 0.6 };
const LIGHT = new THREE.Vector3(-0.8, 0.45, 0.35).normalize();

const SURFACE_VERTEX = `
attribute float aRaw;
attribute float aHarm;
attribute vec3 aNormalRaw;
attribute vec3 aNormalHarm;
attribute vec2 aGrid;
uniform float uK;
uniform float uLift;
varying float vValue;
varying vec3 vNormal;
varying vec2 vGrid;
void main() {
  vValue = mix(aRaw, aHarm, uK);
  vNormal = mix(aNormalRaw, aNormalHarm, uK);
  vGrid = aGrid;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position.x, vValue * uLift, position.z, 1.0);
}`;

const SURFACE_FRAGMENT = `
uniform sampler2D uRamp;
uniform vec3 uPlain;
uniform vec3 uChalk;
uniform vec3 uLight;
uniform float uMax;
uniform float uStep;
uniform vec2 uActive;
varying float vValue;
varying vec3 vNormal;
varying vec2 vGrid;
void main() {
  float t = sqrt(clamp(vValue / uMax, 0.0, 1.0));
  vec3 ramp = texture2D(uRamp, vec2(t, 0.5)).rgb;
  vec3 base = mix(uPlain, ramp, smoothstep(0.0, 0.06, t));
  float lambert = max(dot(normalize(vNormal), uLight), 0.0);
  vec3 c = base * (0.5 + 0.55 * lambert);
  c += ramp * smoothstep(0.6, 1.0, t) * 0.2;

  float level = vValue / uStep;
  float w = fwidth(level);
  float iso = (level > 0.5 && w > 1e-6) ? 1.0 - smoothstep(0.0, 1.3, abs(fract(level - 0.5) - 0.5) / w) : 0.0;
  c = mix(c, uChalk, iso * 0.28);

  vec2 d = abs(vGrid - uActive);
  vec2 px = (0.5 - d) / max(fwidth(vGrid), vec2(1e-6));
  float edge = min(px.x, px.y);
  float ring = edge > 0.0 ? 1.0 - smoothstep(1.0, 2.5, edge) : 0.0;
  c = mix(c, uChalk, ring * 0.6);

  gl_FragColor = vec4(c, 1.0);
}`;

const SHEET_VERTEX = `
attribute float aSheet;
attribute float aMask;
uniform float uLift;
varying float vMask;
void main() {
  vMask = aMask;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position.x, aSheet * uLift, position.z, 1.0);
}`;

const SHEET_FRAGMENT = `
uniform vec3 uChalk;
uniform float uK;
varying float vMask;
void main() {
  if (vMask < 0.5) discard;
  gl_FragColor = vec4(uChalk, 0.16 * uK);
}`;

/** The ramp as a texture, addressed by the same 0 to 1 position the calendar uses. */
function rampTexture(ramp: RampName): THREE.DataTexture {
  const n = 256;
  const data = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const c = sequential(Math.max(1e-6, i / (n - 1)), ramp);
    const rgb = c.startsWith("#") ? hexToRgb(c) : c.match(/\d+(\.\d+)?/g)!.slice(0, 3).map(Number);
    data.set([rgb[0], rgb[1], rgb[2], 255], i * 4);
  }
  const tex = new THREE.DataTexture(data, n, 1, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

interface Label {
  text: string;
  at: [number, number, number];
  anchor: "start" | "middle" | "end";
  now?: boolean;
}

function labelsFor(g: Grid, handoffs: Handoff[], nowYear: number, narrow: boolean): Label[] {
  const rows = g.years.length;
  const out: Label[] = [];
  for (let i = 0; i < 12; i++) out.push({ text: narrow ? MONTH_INITIALS[i] : MONTHS[i], at: [worldX(i + 0.5), 0, worldZ(g, rows + 0.9)], anchor: "middle" });
  g.years.forEach((year, j) => {
    const now = year === nowYear;
    if (now || j === 0 || (year % 5 === 0 && nowYear - year > 1)) out.push({ text: String(year), at: [worldX(-0.45), 0, worldZ(g, j + 0.5)], anchor: "end", now });
  });
  for (const h of handoffs) {
    const path = handoffPath(g, h.ym);
    const [, z] = path[path.length - 1];
    out.push({ text: narrow ? h.label.split(",")[0] : h.label, at: [worldX(12.3), 0, worldZ(g, z)], anchor: "start" });
  }
  return out;
}

interface Stage {
  setK: (k: number) => void;
  setActive: (ym: string | null) => void;
  resize: (width: number, height: number) => void;
  dispose: () => void;
}

interface Props {
  /** the whole record; the terrain always shows every year */
  months: CellValue[];
  /** 0 = raw records, 1 = harmonized */
  k: number;
  ramp: RampName;
  handoffs: Handoff[];
  active: string | null;
  onActive: (ym: string | null) => void;
  width: number;
  height: number;
  label: string;
  /** called when the browser cannot start WebGL */
  onFail: () => void;
}

export function CliffMelt({ months, k, ramp, handoffs, active, onActive, width, height, label, onFail }: Props) {
  const holder = useRef<HTMLDivElement>(null);
  const labelHolder = useRef<HTMLDivElement>(null);
  const stage = useRef<Stage | null>(null);
  const live = useRef({ k, onActive, onFail });
  live.current = { k, onActive, onFail };

  const grid = useMemo(() => buildGrid(months), [months]);
  const last = months[months.length - 1];
  const narrow = width < 700;
  const labels = useMemo(() => labelsFor(grid, handoffs, last.year, narrow), [grid, handoffs, last.year, narrow]);
  const step = useMemo(() => contourStep(grid.max), [grid.max]);

  useEffect(() => {
    const el = holder.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    } catch {
      live.current.onFail();
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(TOKENS.night);
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
    const rows = grid.years.length;
    const target = new THREE.Vector3(0.6, 0, rows * CELL_Z * 0.1);
    const span = Math.hypot(12 * CELL_X, rows * CELL_Z);

    const surface = buildSurface(grid);
    const lift = HEIGHT / grid.max;
    const position = new THREE.BufferAttribute(surface.position, 3);
    const index = new THREE.BufferAttribute(surface.index, 1);
    const mask = new THREE.BufferAttribute(surface.mask, 1);

    const land = new THREE.BufferGeometry();
    land.setIndex(index);
    land.setAttribute("position", position);
    land.setAttribute("aRaw", new THREE.BufferAttribute(surface.raw, 1));
    land.setAttribute("aHarm", new THREE.BufferAttribute(surface.harm, 1));
    land.setAttribute("aNormalRaw", new THREE.BufferAttribute(surface.normalRaw, 3));
    land.setAttribute("aNormalHarm", new THREE.BufferAttribute(surface.normalHarm, 3));
    land.setAttribute("aGrid", new THREE.BufferAttribute(surface.grid, 2));
    const texture = rampTexture(ramp);
    const landMaterial = new THREE.ShaderMaterial({
      vertexShader: SURFACE_VERTEX, fragmentShader: SURFACE_FRAGMENT, side: THREE.DoubleSide,
      uniforms: {
        uK: { value: live.current.k }, uLift: { value: lift }, uRamp: { value: texture }, uMax: { value: grid.max }, uStep: { value: step },
        uPlain: { value: new THREE.Color("#16325A") }, uChalk: { value: new THREE.Color(TOKENS.chalk) }, uLight: { value: LIGHT },
        uActive: { value: new THREE.Vector2(-10, -10) },
      },
    });
    const landMesh = new THREE.Mesh(land, landMaterial);
    landMesh.frustumCulled = false;
    scene.add(landMesh);

    const sheetMaterial = new THREE.ShaderMaterial({
      vertexShader: SHEET_VERTEX, fragmentShader: SHEET_FRAGMENT, side: THREE.DoubleSide, transparent: true, depthWrite: false,
      uniforms: { uK: { value: live.current.k }, uLift: { value: lift }, uChalk: { value: new THREE.Color(TOKENS.chalk) } },
    });
    const sheets = [surface.lo, surface.hi].map((heights) => {
      const geo = new THREE.BufferGeometry();
      geo.setIndex(index);
      geo.setAttribute("position", position);
      geo.setAttribute("aSheet", new THREE.BufferAttribute(heights, 1));
      geo.setAttribute("aMask", mask);
      const mesh = new THREE.Mesh(geo, sheetMaterial);
      mesh.frustumCulled = false;
      scene.add(mesh);
      return mesh;
    });

    const nowRow = last.year - grid.years[0];
    const tracePath: [number, number][] = [[0.5, nowRow + 0.5], [Math.max(1, last.month - 0.5), nowRow + 0.5]];
    const traceMaterial = new LineMaterial({ color: TOKENS.sodium, linewidth: 3 });
    const trace = new Line2(new LineGeometry(), traceMaterial);
    const ruleMaterial = new LineMaterial({ color: TOKENS.chalk, linewidth: 1, transparent: true, opacity: 0.5, dashed: true, dashSize: 0.16, gapSize: 0.12 });
    const rules = handoffs.map((h) => ({ path: handoffPath(grid, h.ym), line: new Line2(new LineGeometry(), ruleMaterial) }));
    for (const line of [trace, ...rules.map((r) => r.line)]) {
      line.frustumCulled = false;
      scene.add(line);
    }
    const drapeLines = (at: number) => {
      trace.geometry.setPositions(drape(grid, tracePath, at, 0.04));
      for (const r of rules) {
        r.line.geometry.setPositions(drape(grid, r.path, at, 0.03));
        r.line.computeLineDistances();
      }
    };
    drapeLines(live.current.k);

    const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
    composer.addPass(new RenderPass(scene, camera));
    // The threshold sits above everything but the brightest ridges and the current-year trace.
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.14, 0.2, 0.68);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    const view = { ...REST, pull: 1, w: 1, h: 1 };
    const spans = [...labelHolder.current!.children] as HTMLElement[];
    const v = new THREE.Vector3();
    let frame = 0;
    const draw = () => {
      frame = 0;
      const radius = span * 1.5 * Math.max(1, 1.5 / camera.aspect) * view.pull;
      camera.position.set(
        target.x + radius * Math.cos(view.elevation) * Math.sin(view.azimuth),
        target.y + radius * Math.sin(view.elevation),
        target.z + radius * Math.cos(view.elevation) * Math.cos(view.azimuth),
      );
      camera.lookAt(target);
      composer.render();
      labels.forEach((l, i) => {
        v.set(...l.at).project(camera);
        spans[i].style.transform = `translate(${(((v.x + 1) / 2) * view.w).toFixed(1)}px, ${(((1 - v.y) / 2) * view.h).toFixed(1)}px)`;
      });
    };
    const invalidate = () => {
      frame ||= requestAnimationFrame(draw);
    };

    let settle = 0;
    if (!settled && !prefersReducedMotion()) {
      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / SETTLE_MS);
        const rest = 1 - (1 - t) ** 3;
        view.azimuth = REST.azimuth + 0.35 * (1 - rest);
        view.elevation = REST.elevation + 0.3 * (1 - rest);
        view.pull = 1 + 0.25 * (1 - rest);
        invalidate();
        settle = t < 1 ? requestAnimationFrame(tick) : 0;
      };
      settle = requestAnimationFrame(tick);
    }
    settled = true;

    const canvas = renderer.domElement;
    const ray = new THREE.Raycaster();
    let drag: { x: number; y: number } | null = null;
    const down = (e: PointerEvent) => {
      drag = { x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (drag) {
        cancelAnimationFrame(settle);
        view.pull = 1;
        view.azimuth = Math.max(-1.1, Math.min(1.1, view.azimuth - (e.clientX - drag.x) * 0.004));
        view.elevation = Math.max(0.25, Math.min(1.2, view.elevation + (e.clientY - drag.y) * 0.003));
        drag = { x: e.clientX, y: e.clientY };
        invalidate();
        return;
      }
      const r = canvas.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, 1 - ((e.clientY - r.top) / r.height) * 2), camera);
      live.current.onActive(pick(grid, ray.ray.origin.toArray(), ray.ray.direction.toArray(), live.current.k, span * 4));
    };
    const up = () => {
      drag = null;
    };
    const leave = () => live.current.onActive(null);
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    canvas.addEventListener("pointerleave", leave);

    stage.current = {
      setK: (at) => {
        landMaterial.uniforms.uK.value = at;
        sheetMaterial.uniforms.uK.value = at;
        for (const s of sheets) s.visible = at > 0.02;
        drapeLines(at);
        invalidate();
      },
      setActive: (ym) => {
        if (ym) {
          const { year, month } = ymParts(ym);
          landMaterial.uniforms.uActive.value.set(month - 0.5, year - grid.years[0] + 0.5);
        } else landMaterial.uniforms.uActive.value.set(-10, -10);
        invalidate();
      },
      resize: (w, h) => {
        view.w = w;
        view.h = h;
        renderer.setSize(w, h);
        composer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        traceMaterial.resolution.set(w, h);
        ruleMaterial.resolution.set(w, h);
        invalidate();
      },
      dispose: () => {
        cancelAnimationFrame(frame);
        cancelAnimationFrame(settle);
        canvas.removeEventListener("pointerdown", down);
        canvas.removeEventListener("pointermove", move);
        canvas.removeEventListener("pointerup", up);
        canvas.removeEventListener("pointercancel", up);
        canvas.removeEventListener("pointerleave", leave);
        for (const g of [land, ...sheets.map((s) => s.geometry), trace.geometry, ...rules.map((r) => r.line.geometry)]) g.dispose();
        for (const m of [landMaterial, sheetMaterial, traceMaterial, ruleMaterial]) m.dispose();
        texture.dispose();
        bloom.dispose();
        composer.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        canvas.remove();
      },
    };
    stage.current.setK(live.current.k);
    return () => {
      stage.current?.dispose();
      stage.current = null;
    };
  }, [grid, ramp, handoffs, labels, step, last.year, last.month]);

  useEffect(() => stage.current?.resize(width, height), [width, height, grid, ramp, handoffs, labels]);
  useEffect(() => stage.current?.setK(k), [k]);
  useEffect(() => stage.current?.setActive(active), [active, grid, ramp, handoffs, labels]);

  const onKey = (e: KeyboardEvent) => {
    const moves: Record<string, [number, number]> = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] };
    const by = moves[e.key];
    if (!by) return;
    e.preventDefault();
    const from = ymParts(active ?? last.ym);
    const month0 = from.month - 1 + by[1];
    const next = toYm(from.year + by[0] + Math.floor(month0 / 12), ((month0 % 12) + 12) % 12 + 1);
    if (grid.ym.includes(next)) onActive(next);
  };

  return (
    <div className="cliff" style={{ width, height }} role="group" tabIndex={0} aria-label={label}
      onKeyDown={onKey} onFocus={() => active ?? onActive(last.ym)} onBlur={() => onActive(null)}>
      <div ref={holder} className="cliff-canvas" />
      <div ref={labelHolder} className="cliff-labels" aria-hidden="true">
        {labels.map((l, i) => (
          <span key={i} className={`cliff-label cliff-label-${l.anchor}${l.now ? " cliff-label-now" : ""}`}><span>{l.text}</span></span>
        ))}
      </div>
    </div>
  );
}
