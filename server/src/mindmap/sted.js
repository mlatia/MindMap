/**
 * sted.js - Semantic Tree Edit Distance (STED) & Consistency Score.
 *
 * Implementasi SETIA pada paper:
 *   Wang dkk. (2025) "STED and Consistency Scoring: A Framework for Evaluating
 *   LLM Structured Output Reliability" (AWS GenAI Innovation Center).
 *
 * Rumus inti yang diikuti:
 *   - Optimal Subtree Matching memakai HUNGARIAN ALGORITHM di SETIAP level
 *     pohon (paper Sec 3.5), bukan greedy lokal.
 *   - Normalisasi per-level (paper Eq.4):
 *         STED(T1,T2) = 1 - min(1, (d_matched + lambda * delta_unmatched)
 *                                  / max(|C1|, |C2|))
 *     dengan lambda = 0.1 dan delta_unmatched = ||C1| - |C2||  (selisih ukuran).
 *   - Consistency Score C(O) (paper Eq.1) = RATA-RATA pairwise similarity:
 *         C(O) = (2 / (n(n-1))) * sum_{i<j} STED(Ti, Tj)
 *     (TIDAK ada normalisasi sigmoid - itu tidak ada di paper).
 *
 * CATATAN PROXY EMBEDDING: paper memakai embedding (Titan/MiniLM/dst) untuk
 * similarity field-name & value (Sec 3.4). Di sini, agar deterministik dan
 * tanpa dependensi model, similarity konsep dihitung dengan proxy lokal
 * (Jaccard token + fallback char-bigram untuk konsep numerik). Paper sendiri
 * menyatakan STED bersifat model-agnostic terhadap pilihan embedding.
 */

import { tokenize } from './preprocess.js';

const LAMBDA = 0.1;       // bobot penalti selisih ukuran (paper Eq.4)
const W_LABEL = 0.5;      // bobot kemiripan label node (adaptasi mind map)
const W_CHILD = 0.5;      // bobot kemiripan susunan anak

/**
 * Similarity konsep [0,1] sebagai proxy embedding.
 * - Jaccard atas token kata bila ada token.
 * - Untuk konsep numerik/simbolik (token kata kosong, mis. "2,61%"),
 *   fallback ke kesamaan string ternormalisasi + Jaccard bigram karakter.
 */
export function sim(a, b) {
  const A = new Set(tokenize(a));
  const B = new Set(tokenize(b));
  if (A.size || B.size) {
    if (!A.size || !B.size) return 0;
    let inter = 0;
    for (const t of A) if (B.has(t)) inter += 1;
    const union = A.size + B.size - inter;
    return union ? inter / union : 0;
  }
  // tokenless (angka/simbol): bandingkan string ternormalisasi
  const na = String(a).toLowerCase().replace(/\s+/g, '');
  const nb = String(b).toLowerCase().replace(/\s+/g, '');
  if (!na && !nb) return 1;
  if (na === nb) return 1;
  const bg = (s) => { const g = new Set(); for (let i = 0; i < s.length - 1; i += 1) g.add(s.slice(i, i + 2)); return g; };
  const GA = bg(na), GB = bg(nb);
  if (!GA.size && !GB.size) return na === nb ? 1 : 0;
  let inter = 0;
  for (const g of GA) if (GB.has(g)) inter += 1;
  const union = GA.size + GB.size - inter;
  return union ? inter / union : 0;
}

/**
 * Hungarian algorithm (O(n^3)) untuk penugasan biaya MINIMUM pada matriks
 * persegi cost[n][n]. Mengembalikan array assign[row] = col.
 * Implementasi klasik (metode potensial / Kuhn-Munkres versi padding 1-indexed).
 */
function hungarian(cost) {
  const n = cost.length;
  if (n === 0) return [];
  const INF = Infinity;
  const u = new Array(n + 1).fill(0);
  const v = new Array(n + 1).fill(0);
  const p = new Array(n + 1).fill(0); // p[j] = baris yang ditugaskan ke kolom j
  const way = new Array(n + 1).fill(0);
  for (let i = 1; i <= n; i += 1) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array(n + 1).fill(INF);
    const used = new Array(n + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = INF;
      let j1 = -1;
      for (let j = 1; j <= n; j += 1) {
        if (!used[j]) {
          const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
          if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
          if (minv[j] < delta) { delta = minv[j]; j1 = j; }
        }
      }
      for (let j = 0; j <= n; j += 1) {
        if (used[j]) { u[p[j]] += delta; v[j] -= delta; }
        else { minv[j] -= delta; }
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0);
  }
  const assign = new Array(n).fill(-1);
  for (let j = 1; j <= n; j += 1) if (p[j] > 0) assign[p[j] - 1] = j - 1;
  return assign;
}

/**
 * Similarity rekursif dua subpohon [0,1] dengan matching Hungarian per-level
 * dan normalisasi Eq.4.
 */
function simTree(a, b) {
  const labelSim = sim(a.concept || '', b.concept || '');
  const Ca = a.children || [];
  const Cb = b.children || [];
  if (Ca.length === 0 && Cb.length === 0) return labelSim; // daun: murni label

  const m = Math.max(Ca.length, Cb.length);
  // matriks biaya persegi m x m; sel "padding" (anak tak ada) = biaya 1 (insert/delete)
  const cost = Array.from({ length: m }, () => new Array(m).fill(1));
  for (let i = 0; i < Ca.length; i += 1) {
    for (let j = 0; j < Cb.length; j += 1) {
      cost[i][j] = 1 - simTree(Ca[i], Cb[j]); // dissimilarity rekursif
    }
  }
  const assign = hungarian(cost);
  let dMatched = 0;
  for (let i = 0; i < Ca.length; i += 1) {
    const j = assign[i];
    if (j !== -1 && j < Cb.length) dMatched += cost[i][j]; // hanya pasangan nyata
  }
  const deltaUnmatched = Math.abs(Ca.length - Cb.length);
  const childrenDist = Math.min(1, (dMatched + LAMBDA * deltaUnmatched) / m); // Eq.4
  const childrenSim = 1 - childrenDist;
  return W_LABEL * labelSim + W_CHILD * childrenSim;
}

/**
 * STED similarity dua pohon mind map (paper Eq.4 secara rekursif per-level).
 * @returns {number} 0..1 (1 = identik secara semantik & struktural)
 */
export function sted(T_i, T_j) {
  if (!T_i || !T_j) return 0;
  return simTree(T_i, T_j);
}

/**
 * Consistency Score C(O) (paper Eq.1) = rata-rata pairwise STED.
 * @param {object[]} trees
 * @returns {{ mean:number, C:number, pairs:number, scoreNormalized:number }}
 */
export function aggregateConsistency(trees) {
  const n = trees.length;
  if (n < 2) return { mean: 1, C: 1, pairs: 0, scoreNormalized: 1 };
  let sum = 0;
  let pairs = 0;
  for (let i = 0; i < n - 1; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      sum += sted(trees[i], trees[j]);
      pairs += 1;
    }
  }
  const mean = sum / pairs;
  // C(O) = mean (Eq.1). scoreNormalized dipertahankan sbg alias mean utk kompatibilitas.
  return { mean, C: mean, pairs, scoreNormalized: mean };
}

export const _internals = { LAMBDA, W_LABEL, W_CHILD, sim, hungarian, simTree };
