/**
 * validation.js - Modul Validation Layer (MSM-05)
 *
 * Empat tahap validasi output LLM secara berurutan:
 *   1. Struktural  - JSON schema
 *   2. Semantik    - kesesuaian dengan teks sumber via overlap + substring
 *   3. Kendala     - depth <= 4 level, branch <= 7 per node, level konsisten
 *   4. Kelengkapan - konsep utama teks tercakup dalam struktur
 *
 * Jika tahap gagal, validate() melempar error informatif yang dipakai
 * runtime di mindmap.routes.js untuk memicu retry (max 3x).
 *
 * Threshold dipilih cukup longgar agar tetap menolak halusinasi total
 * (>50% concept tidak berakar) tetapi memberi ruang untuk LLM yang
 * memparafrasekan istilah sumber (mis. "penemu Buzan" untuk "Tony Buzan").
 */

import { tokenize } from './preprocess.js';

const MAX_DEPTH = 4;
const MAX_BRANCH = 7;
const SEMANTIC_THRESHOLD = 0.55;  // tadinya 0.55 - terlalu ketat untuk LLM paraphrase
const COVERAGE_THRESHOLD = 0.40;  // tadinya 0.4 - longgarkan

/**
 * Validasi struktural: object dengan {concept, level, children}.
 */
function validateStructural(node, depth = 0) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) {
    throw new Error('Struktural: node bukan object');
  }
  if (typeof node.concept !== 'string' || !node.concept.trim()) {
    throw new Error('Struktural: properti concept wajib string non-kosong');
  }
  if (typeof node.level !== 'number' || node.level !== depth) {
    throw new Error(`Struktural: level tidak konsisten pada "${node.concept}" (diharapkan ${depth}, dapat ${node.level})`);
  }
  if (!Array.isArray(node.children)) {
    throw new Error('Struktural: properti children wajib array');
  }
  for (const child of node.children) validateStructural(child, depth + 1);
}

/**
 * Validasi kendala: maksimal depth (0..MAX_DEPTH-1) & branch <= MAX_BRANCH.
 */
function validateConstraints(node, depth = 0) {
  if (depth > MAX_DEPTH - 1) {
    throw new Error(`Kendala: hierarki melebihi ${MAX_DEPTH} level (depth ${depth})`);
  }
  if (node.children.length > MAX_BRANCH) {
    throw new Error(`Kendala: "${node.concept}" memiliki ${node.children.length} cabang (>${MAX_BRANCH})`);
  }
  for (const child of node.children) validateConstraints(child, depth + 1);
}

/**
 * Cek apakah token muncul di set sumber (eksak ATAU substring 4+ char).
 * Toleran terhadap inflection ringan seperti "buatan" -> "buat".
 */
function tokenAppearsIn(token, sourceTokens, sourceText) {
  if (sourceTokens.has(token)) return true;
  if (token.length >= 4) {
    // substring search di seluruh teks (case-insensitive)
    if (sourceText.toLowerCase().includes(token.toLowerCase())) return true;
    // root match: kalau ada source token yang share prefix 4+ char
    for (const st of sourceTokens) {
      if (st.length >= 4 && (st.startsWith(token.substring(0, 4)) || token.startsWith(st.substring(0, 4)))) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Validasi semantik: proporsi node yang token-nya muncul di teks sumber.
 */
function semanticCoverage(node, sourceTokens, sourceText) {
  let matched = 0;
  let total = 0;
  const visit = (n) => {
    total += 1;
    const tokens = tokenize(n.concept);
    if (tokens.some(t => tokenAppearsIn(t, sourceTokens, sourceText))) matched += 1;
    for (const c of n.children) visit(c);
  };
  visit(node);
  return { matched, total };
}

/**
 * Validasi kelengkapan: pastikan istilah dominan teks ikut muncul (substring tolerant).
 */
function validateCoverage(node, sourceText) {
  const tokens = tokenize(sourceText);
  const freq = new Map();
  for (const t of tokens) freq.set(t, (freq.get(t) || 0) + 1);
  const top = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([t]) => t);
  if (!top.length) return;

  // gabungkan semua concept text jadi satu blob lowercase
  const conceptBlob = [];
  const visit = (n) => {
    conceptBlob.push(n.concept.toLowerCase());
    for (const c of n.children) visit(c);
  };
  visit(node);
  const blob = conceptBlob.join(' ');

  // istilah dominan dianggap covered jika muncul as substring di blob
  const covered = top.filter(t => blob.includes(t.substring(0, Math.min(4, t.length))));
  if (covered.length / top.length < COVERAGE_THRESHOLD) {
    throw new Error(`Kelengkapan: hanya ${covered.length}/${top.length} istilah dominan tercakup (target >= ${Math.ceil(top.length * COVERAGE_THRESHOLD)}). Istilah yang belum: [${top.filter(t => !covered.includes(t)).join(', ')}]`);
  }
}

/**
 * Hitung statistik mind map untuk metadata.
 */
export function stats(node) {
  let nodes = 0;
  let depth = 0;
  const visit = (n, d) => {
    nodes += 1;
    if (d > depth) depth = d;
    for (const c of n.children) visit(c, d + 1);
  };
  visit(node, 0);
  return { nodes, depth, branchesRoot: node.children?.length || 0 };
}

/**
 * Jalankan semua validasi. Throws Error jika salah satu gagal.
 */
export function validate(tree, sourceText) {
  validateStructural(tree, 0);
  validateConstraints(tree, 0);
  const sourceTokens = new Set(tokenize(sourceText));
  const { matched, total } = semanticCoverage(tree, sourceTokens, sourceText);
  if (total > 0 && matched / total < SEMANTIC_THRESHOLD) {
    throw new Error(`Semantik: hanya ${matched}/${total} node berakar di teks sumber (target >= ${Math.ceil(total * SEMANTIC_THRESHOLD)})`);
  }
  validateCoverage(tree, sourceText);
  return { ok: true, stats: stats(tree) };
}

export const _thresholds = { MAX_DEPTH, MAX_BRANCH, SEMANTIC_THRESHOLD, COVERAGE_THRESHOLD };
export default { validate, stats };
