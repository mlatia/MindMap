/**
 * layout-metrics.js - Hitung lima metrik graph-drawing aesthetics
 * (Purchase 2002, Mooney dkk. 2024) untuk evaluasi visualisasi mind map.
 *
 *   NOR  - Node Overlap Rate
 *   ECN  - Edge Crossing Number
 *   LC   - Layout Compactness
 *   WKL  - Waktu Komputasi Layout (ms)
 *   ELV  - Edge Length Variance (coefficient of variation)
 *
 * Menerima `positions`: Map<id, {x,y,w,h}> dan `edges`: Array<{src,tgt}>.
 */

/**
 * Cek apakah dua bounding box overlap.
 */
function overlap(a, b) {
  return !(a.x + a.w / 2 < b.x - b.w / 2 ||
           a.x - a.w / 2 > b.x + b.w / 2 ||
           a.y + a.h / 2 < b.y - b.h / 2 ||
           a.y - a.h / 2 > b.y + b.h / 2);
}

/**
 * Apakah dua segmen lurus berpotongan?
 */
function segIntersect(p1, p2, p3, p4) {
  const d1x = p2.x - p1.x, d1y = p2.y - p1.y;
  const d2x = p4.x - p3.x, d2y = p4.y - p3.y;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-9) return false;
  const t = ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / denom;
  const u = ((p3.x - p1.x) * d1y - (p3.y - p1.y) * d1x) / denom;
  return t > 0.01 && t < 0.99 && u > 0.01 && u < 0.99;
}

/**
 * Hitung NOR: proporsi pasangan node yang overlap.
 */
export function nodeOverlapRate(positions) {
  const ids = [...positions.keys()];
  let pairs = 0, overlaps = 0;
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      pairs += 1;
      if (overlap(positions.get(ids[i]), positions.get(ids[j]))) overlaps += 1;
    }
  }
  return pairs ? overlaps / pairs : 0;
}

/**
 * Hitung ECN: jumlah pasangan edge yang persilangan.
 */
export function edgeCrossingNumber(positions, edges) {
  let count = 0;
  for (let i = 0; i < edges.length; i += 1) {
    const e1 = edges[i];
    const p1 = positions.get(e1.src);
    const p2 = positions.get(e1.tgt);
    for (let j = i + 1; j < edges.length; j += 1) {
      const e2 = edges[j];
      // Skip jika berbagi node (tidak dihitung sebagai crossing)
      if (e1.src === e2.src || e1.src === e2.tgt || e1.tgt === e2.src || e1.tgt === e2.tgt) continue;
      const p3 = positions.get(e2.src);
      const p4 = positions.get(e2.tgt);
      if (segIntersect(p1, p2, p3, p4)) count += 1;
    }
  }
  return count;
}

/**
 * LC: rasio area sum bounding box / area bounding box global.
 */
export function layoutCompactness(positions) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let areaSum = 0;
  for (const p of positions.values()) {
    const x1 = p.x - p.w / 2, x2 = p.x + p.w / 2;
    const y1 = p.y - p.h / 2, y2 = p.y + p.h / 2;
    if (x1 < minX) minX = x1;
    if (y1 < minY) minY = y1;
    if (x2 > maxX) maxX = x2;
    if (y2 > maxY) maxY = y2;
    areaSum += p.w * p.h;
  }
  const globalArea = (maxX - minX) * (maxY - minY);
  return globalArea > 0 ? Math.min(1, areaSum / globalArea) : 0;
}

/**
 * ELV: coefficient of variation panjang edge.
 */
export function edgeLengthVariance(positions, edges) {
  const lengths = edges.map(e => {
    const a = positions.get(e.src);
    const b = positions.get(e.tgt);
    return Math.hypot(a.x - b.x, a.y - b.y);
  });
  if (!lengths.length) return 0;
  const mean = lengths.reduce((s, v) => s + v, 0) / lengths.length;
  if (!mean) return 0;
  const variance = lengths.reduce((s, v) => s + (v - mean) ** 2, 0) / lengths.length;
  return Math.sqrt(variance) / mean;
}

/**
 * Hitung kelima metrik sekaligus.
 */
export function computeMetrics(positions, edges, durationMs) {
  return {
    NOR: nodeOverlapRate(positions),
    ECN: edgeCrossingNumber(positions, edges),
    LC:  layoutCompactness(positions),
    WKL: durationMs,
    ELV: edgeLengthVariance(positions, edges),
  };
}
