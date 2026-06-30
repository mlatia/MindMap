/**
 * cluster-layout.js - Radial Cluster (Dendrogram) headless memakai d3.cluster().
 * Output sama format dengan headless-layouts.js: {positions, edges, durationMs}.
 */
import { hierarchy, cluster as d3cluster } from 'd3-hierarchy';

const PAD_X = 14, PAD_Y = 8;
function estimateSize(concept, depth) {
  const fs = depth === 0 ? 18 : (depth === 1 ? 14 : 12);
  return { w: Math.max(70, (concept || '').length * (fs * 0.55) + PAD_X * 2), h: Math.max(28, fs + PAD_Y * 2) };
}

export function clusterRadial(tree, opts = {}) {
  const start = Date.now();
  const baseRadius = opts.baseRadius || 380;
  const root = hierarchy(tree, d => d.children);
  d3cluster().size([2 * Math.PI, baseRadius]).separation((a, b) => {
    const la = (a.data.concept || '').length, lb = (b.data.concept || '').length;
    const f = Math.max(1, (la + lb) / 18);
    return (a.parent === b.parent ? 1 : 1.6) * f;
  })(root);
  const positions = new Map(); const edges = [];
  const pathOf = (d) => d.ancestors().reverse().slice(1).map(n => n.parent.children.indexOf(n));
  root.each(d => {
    const path = pathOf(d);
    const id = path.length ? path.join('.') : 'root';
    positions.set(id, {
      x: Math.cos(d.x - Math.PI / 2) * d.y,
      y: Math.sin(d.x - Math.PI / 2) * d.y,
      ...estimateSize(d.data.concept, d.depth),
    });
    if (d.parent) { const pp = pathOf(d.parent); edges.push({ src: pp.length ? pp.join('.') : 'root', tgt: id }); }
  });
  return { positions, edges, durationMs: Date.now() - start };
}
export default { clusterRadial };
