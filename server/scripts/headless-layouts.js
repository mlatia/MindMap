/**
 * headless-layouts.js - Implementasi headless Reingold-Tilford radial
 * dan Force-Directed dengan konstrain radial untuk pengujian server-side.
 *
 * Output: positions Map<id, {x,y,w,h}> + edges Array<{src,tgt}> + durationMs.
 *
 * Node dimensi dihitung dengan estimasi sederhana berdasarkan panjang
 * concept (proxy text bounding box).
 */

const FONT_BASE = 13;
const PAD_X = 14, PAD_Y = 8;

function estimateSize(concept, depth) {
  const fontSize = depth === 0 ? 18 : (depth === 1 ? 14 : 12);
  const w = Math.max(70, concept.length * (fontSize * 0.55) + PAD_X * 2);
  const h = Math.max(28, fontSize + PAD_Y * 2);
  return { w, h };
}

function flatten(tree) {
  const nodes = []; const edges = [];
  const visit = (n, parentId, path) => {
    const id = path.join('.') || 'root';
    nodes.push({ id, concept: n.concept, depth: n.level || 0, path, parentId });
    if (parentId !== null) edges.push({ src: parentId, tgt: id });
    (n.children || []).forEach((c, i) => visit(c, id, [...path, i]));
  };
  visit(tree, null, []);
  return { nodes, edges };
}

// ---- Reingold-Tilford radial ----
/**
 * Implementasi sederhana d3.tree radial: tiap level di-assign theta merata,
 * radius = depth * step.
 */
export function reingoldTilfordRadial(tree, opts = {}) {
  const startedAt = Date.now();
  const radiusStep = opts.radiusStep || 110;
  const { nodes, edges } = flatten(tree);
  const positions = new Map();
  positions.set('root', { x: 0, y: 0, ...estimateSize(nodes[0].concept, 0) });

  // group nodes by depth
  const byDepth = new Map();
  for (const n of nodes) {
    if (n.depth === 0) continue;
    if (!byDepth.has(n.depth)) byDepth.set(n.depth, []);
    byDepth.get(n.depth).push(n);
  }
  // assign angles: level 1 spread merata 0..2pi, level deeper di-spread dalam wedge parent
  // simple approach: tiap node level d punya theta proporsional terhadap urutannya
  const childrenOf = new Map();
  for (const n of nodes) {
    if (!childrenOf.has(n.parentId)) childrenOf.set(n.parentId, []);
    if (n.parentId !== null) childrenOf.get(n.parentId).push(n);
  }

  // level 1: spread 0..2pi
  const lvl1 = childrenOf.get('root') || [];
  lvl1.forEach((n, i) => {
    const theta = (i / lvl1.length) * 2 * Math.PI;
    positionRadial(n, theta, theta - Math.PI / lvl1.length, theta + Math.PI / lvl1.length, radiusStep, positions, childrenOf);
  });

  for (const n of nodes) {
    if (!positions.has(n.id)) {
      positions.set(n.id, { x: 0, y: 0, ...estimateSize(n.concept, n.depth) });
    }
  }
  return { positions, edges, durationMs: Date.now() - startedAt };
}

function positionRadial(node, theta, thetaMin, thetaMax, step, positions, childrenOf) {
  const radius = node.depth * step;
  positions.set(node.id, {
    x: Math.cos(theta) * radius,
    y: Math.sin(theta) * radius,
    ...estimateSize(node.concept, node.depth)
  });
  const kids = childrenOf.get(node.id) || [];
  if (!kids.length) return;
  const wedge = (thetaMax - thetaMin) * 0.95;
  kids.forEach((c, i) => {
    const t = kids.length === 1 ? theta : thetaMin + (i + 0.5) * wedge / kids.length;
    positionRadial(c, t, thetaMin + (i) * wedge / kids.length, thetaMin + (i + 1) * wedge / kids.length, step, positions, childrenOf);
  });
}

// ---- Force-directed radial ----
/**
 * Simulasi force-directed sederhana dengan konstrain radial:
 *   - tarikan ke radius depth*R
 *   - repulsi antar node (manyBody)
 *   - spring antar parent-child
 */
export function forceDirectedRadial(tree, opts = {}) {
  const startedAt = Date.now();
  const radiusStep = opts.radiusStep || 130;
  const iterations = opts.iterations || 200;
  const { nodes, edges } = flatten(tree);
  // init dengan jitter deterministik
  const positions = new Map();
  for (const n of nodes) {
    const theta = (hashIdx(n.id) * 2 * Math.PI) / 7;
    const r = n.depth * radiusStep;
    positions.set(n.id, {
      x: Math.cos(theta) * r,
      y: Math.sin(theta) * r,
      vx: 0, vy: 0,
      ...estimateSize(n.concept, n.depth)
    });
  }
  // iterate
  for (let iter = 0; iter < iterations; iter += 1) {
    const alpha = 1 - iter / iterations;
    // repulsion
    const ids = [...positions.keys()];
    for (let i = 0; i < ids.length; i += 1) {
      const a = positions.get(ids[i]);
      for (let j = i + 1; j < ids.length; j += 1) {
        const b = positions.get(ids[j]);
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 1;
        const k = -260 / (dist * dist);
        const fx = k * dx / dist, fy = k * dy / dist;
        a.vx -= fx; a.vy -= fy;
        b.vx += fx; b.vy += fy;
      }
    }
    // spring
    for (const e of edges) {
      const a = positions.get(e.src), b = positions.get(e.tgt);
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.hypot(dx, dy) || 1;
      const target = 90;
      const k = 0.05 * (dist - target);
      a.vx += k * dx / dist; a.vy += k * dy / dist;
      b.vx -= k * dx / dist; b.vy -= k * dy / dist;
    }
    // radial constraint
    for (const n of nodes) {
      const p = positions.get(n.id);
      const angle = Math.atan2(p.y, p.x);
      const targetR = n.depth * radiusStep;
      const targetX = Math.cos(angle) * targetR;
      const targetY = Math.sin(angle) * targetR;
      p.vx += (targetX - p.x) * 0.08;
      p.vy += (targetY - p.y) * 0.08;
    }
    // integrate
    for (const id of ids) {
      const p = positions.get(id);
      p.vx *= 0.55; p.vy *= 0.55;
      p.x += p.vx * alpha;
      p.y += p.vy * alpha;
    }
  }
  // root fix
  const root = positions.get('root');
  root.x = 0; root.y = 0;
  // strip velocity
  for (const p of positions.values()) { delete p.vx; delete p.vy; }
  return { positions, edges, durationMs: Date.now() - startedAt };
}

function hashIdx(s) {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
