/**
 * validation.js - Modul Validation Layer (MSM-05)
 *
 * Empat tahap validasi output LLM secara berurutan:
 *   1. Struktural  - JSON schema
 *   2. Semantik    - kesesuaian dengan teks sumber via overlap token
 *   3. Kendala     - depth <= 4 level, branch <= 7 per node, level konsisten
 *   4. Kelengkapan - konsep utama teks tercakup dalam struktur
 *
 * Jika tahap gagal, validate() melempar error informatif yang dipakai
 * runtime di mindmap.routes.js untuk memicu retry (max 3x).
 */

import { tokenize } from './preprocess.js';

const MAX_DEPTH = 4; // root + 3 sub-level (level valid: 0,1,2,3)
const MAX_BRANCH = 7;
const SEMANTIC_THRESHOLD = 0.55;
const COVERAGE_THRESHOLD = 0.4;

/**
 * Validasi struktural: object dengan {concept, level, children}.
 * @param {any} node
 * @param {number} depth
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
 * @param {any} node
 * @param {number} depth
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
 * Validasi semantik: proporsi node yang token-nya muncul di teks sumber.
 * @param {any} node
 * @param {Set<string>} sourceTokens
 * @returns {{matched:number, total:number}}
 */
function semanticCoverage(node, sourceTokens) {
  let matched = 0;
  let total = 0;
  const visit = (n) => {
    total += 1;
    const tokens = tokenize(n.concept);
    if (tokens.some(t => sourceTokens.has(t))) matched += 1;
    for (const c of n.children) visit(c);
  };
  visit(node);
  return { matched, total };
}

/**
 * Validasi kelengkapan: pastikan istilah dominan teks ikut muncul.
 * @param {any} node
 * @param {string} sourceText
 */
function validateCoverage(node, sourceText) {
  const tokens = tokenize(sourceText);
  const freq = new Map();
  for (const t of tokens) freq.set(t, (freq.get(t) || 0) + 1);
  const top = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([t]) => t);
  if (!top.length) return;
  const conceptTokens = new Set();
  const visit = (n) => {
    for (const t of tokenize(n.concept)) conceptTokens.add(t);
    for (const c of n.children) visit(c);
  };
  visit(node);
  const covered = top.filter(t => conceptTokens.has(t));
  if (covered.length / top.length < COVERAGE_THRESHOLD) {
    throw new Error(`Kelengkapan: hanya ${covered.length}/${top.length} istilah dominan tercakup`);
  }
}

/**
 * Hitung statistik mind map untuk metadata.
 * @param {any} node
 * @returns {{nodes:number, depth:number, branchesRoot:number}}
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
 * @param {any} tree - hasil parse JSON dari LLM
 * @param {string} sourceText - teks input pengguna
 * @returns {{ok:true, stats:object}}
 */
export function validate(tree, sourceText) {
  validateStructural(tree, 0);
  validateConstraints(tree, 0);
  const sourceTokens = new Set(tokenize(sourceText));
  const { matched, total } = semanticCoverage(tree, sourceTokens);
  if (total > 0 && matched / total < SEMANTIC_THRESHOLD) {
    throw new Error(`Semantik: hanya ${matched}/${total} node berakar di teks sumber`);
  }
  validateCoverage(tree, sourceText);
  return { ok: true, stats: stats(tree) };
}

export const _thresholds = { MAX_DEPTH, MAX_BRANCH, SEMANTIC_THRESHOLD, COVERAGE_THRESHOLD };
export default { validate, stats };
