/**
 * sted.js - Semantic Tree Edit Distance untuk pohon mind map.
 *
 * Mengukur konsistensi struktural antar pohon JSON {concept,level,children}
 * sesuai formulasi Wang dkk. (2025):
 *
 *   STED(T_i, T_j) = 1 - min(1, (d_matched + lambda * delta_unmatched)
 *                              / max(|C_i|, |C_j|))
 *
 *   d_matched      = sum of (1 - sim(c_a, c_b)) untuk pasangan node match
 *   delta_unmatched= jumlah node yang tidak ter-match
 *   sim(a,b)       = Jaccard similarity atas token (proxy embedding lokal)
 *   |C|            = jumlah node di pohon
 *   lambda         = bobot penalty unmatched (default 0.5)
 *
 * Skor agregat dari n pohon:
 *   C(O) = (2/(n*(n-1))) * sum_{i<j} STED(T_i, T_j)
 *
 * Lalu dinormalisasi terhadap deviasi dengan steepness factor alpha:
 *   ConsistencyScore = 1 / (1 + exp(-alpha * (mean - 0.5)))
 *
 * Implementasi ini deterministik dan tidak butuh sentence-transformers
 * (cukup TF / Jaccard atas tokens). Untuk evaluasi yang lebih akurat,
 * sim() bisa diganti pakai embedding model di kemudian hari.
 */

import { tokenize } from './preprocess.js';

const LAMBDA = 0.5;
const ALPHA = 20;

/**
 * Jaccard similarity atas token concept.
 * @param {string} a
 * @param {string} b
 * @returns {number} 0..1
 */
function sim(a, b) {
  const A = new Set(tokenize(a));
  const B = new Set(tokenize(b));
  if (!A.size && !B.size) return 1;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter += 1;
  const union = A.size + B.size - inter;
  return union ? inter / union : 0;
}

/**
 * Flatten tree menjadi list node { concept, level, parentConcept }.
 */
function flatten(tree, parentConcept = '_root_') {
  const list = [];
  const visit = (node, parent) => {
    list.push({ concept: node.concept, level: node.level || 0, parentConcept: parent });
    for (const c of (node.children || [])) visit(c, node.concept);
  };
  visit(tree, parentConcept);
  return list;
}

/**
 * Hitung STED antar dua pohon.
 * @param {object} T_i
 * @param {object} T_j
 * @returns {number} 0..1 (1 = identik, 0 = sangat berbeda)
 */
export function sted(T_i, T_j) {
  const A = flatten(T_i);
  const B = flatten(T_j);
  const maxLen = Math.max(A.length, B.length);
  if (!maxLen) return 1;

  // Bipartite greedy matching by max similarity.
  const usedB = new Set();
  let dMatched = 0;
  let matched = 0;
  for (const a of A) {
    let bestIdx = -1;
    let bestSim = 0;
    for (let j = 0; j < B.length; j += 1) {
      if (usedB.has(j)) continue;
      const b = B[j];
      // Boost similarity jika level + parent juga sama
      const s = sim(a.concept, b.concept)
        * (a.level === b.level ? 1 : 0.7)
        * (a.parentConcept === b.parentConcept ? 1 : 0.85);
      if (s > bestSim) { bestSim = s; bestIdx = j; }
    }
    if (bestIdx !== -1 && bestSim > 0.25) {
      dMatched += (1 - bestSim);
      usedB.add(bestIdx);
      matched += 1;
    }
  }
  const unmatched = (A.length - matched) + (B.length - usedB.size);
  const distance = Math.min(1, (dMatched + LAMBDA * unmatched) / maxLen);
  return 1 - distance;
}

/**
 * Skor konsistensi agregat untuk n pohon.
 * @param {object[]} trees
 * @returns {{ mean:number, pairs:number, scoreNormalized:number }}
 */
export function aggregateConsistency(trees) {
  const n = trees.length;
  if (n < 2) return { mean: 1, pairs: 0, scoreNormalized: 1 };
  let sum = 0;
  let pairs = 0;
  for (let i = 0; i < n - 1; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      sum += sted(trees[i], trees[j]);
      pairs += 1;
    }
  }
  const mean = sum / pairs;
  // Sigmoid normalization (Wang dkk. 2025)
  const scoreNormalized = 1 / (1 + Math.exp(-ALPHA * (mean - 0.5)));
  return { mean, pairs, scoreNormalized };
}

export const _internals = { LAMBDA, ALPHA, sim, flatten };
