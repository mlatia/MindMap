/**
 * validation.js - Modul Validation Layer (MSM-05)
 *
 * Empat tahap validasi output LLM secara berurutan:
 *   1. Struktural  - JSON schema {concept, level, children} & level konsisten
 *   2. Kendala     - SAFETY GUARD (bukan aturan keseimbangan): tolak pohon
 *                    yang jelas rusak / hasil halusinasi runaway.
 *   3. Semantik    - proporsi node yang berakar di teks sumber (anti-halusinasi)
 *   4. Kelengkapan - istilah konseptual dominan teks tercakup di struktur
 *
 * PENTING (revisi): tahap "Kendala" TIDAK lagi dipakai untuk memaksa pohon
 * menjadi seimbang. Dulu MAX_DEPTH=4 dan MAX_BRANCH=7 ikut "menghukum" pohon
 * yang secara alami dalam (depth-heavy) atau lebar (breadth-heavy) sehingga
 * pipeline memaksa retry / membentuk struktur yang tidak sesuai konteks.
 * Sekarang batas dibuat LONGGAR dan hanya berfungsi sebagai pengaman terhadap
 * output yang benar-benar tidak wajar (mis. ribuan cabang akibat parsing rusak,
 * atau rekursi tak berujung). Bentuk pohon (dalam/lebar/seimbang) dibiarkan
 * muncul alami dan dievaluasi pada tahap visualisasi, bukan ditolak di sini.
 *
 * Tahap semantik & kelengkapan dibuat TOLERAN ANGKA: teks padat statistik
 * (mis. data inflasi BPS) sering memunculkan concept berupa angka murni
 * ("2,61%"). Node seperti ini sebelumnya selalu dianggap "tidak berakar"
 * karena tokenizer membuang token < 3 karakter, sehingga teks angka kerap
 * gagal 3x retry. Sekarang angka pada concept dicocokkan langsung ke teks.
 */

import { tokenize } from './preprocess.js';

// --- SAFETY GUARD (longgar; BUKAN aturan keseimbangan) ---
const MAX_DEPTH = 12;   // pengaman terhadap rekursi/halusinasi runaway, bukan target
const MAX_BRANCH = 24;  // pengaman terhadap cabang meledak akibat parsing rusak

// --- Ambang anti-halusinasi (tetap menolak halusinasi total) ---
const SEMANTIC_THRESHOLD = 0.50;  // >= 50% node harus berakar di teks
const COVERAGE_THRESHOLD = 0.35;  // >= 35% istilah konseptual dominan tercakup

/**
 * Ekstrak urutan angka dari sebuah string (mis. "2,61%" -> ["2,61","261"]).
 * Dipakai agar concept berupa angka tetap bisa dicocokkan ke teks sumber.
 */
function extractNumbers(str) {
  const out = [];
  const m = String(str).match(/\d+(?:[.,]\d+)*/g);
  if (m) {
    for (const g of m) {
      out.push(g);
      const digits = g.replace(/[.,]/g, '');
      if (digits.length >= 2 && digits !== g) out.push(digits);
    }
  }
  return out;
}

/**
 * Validasi struktural: object dengan {concept, level, children} & level konsisten.
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
  for (const child of node.children) validateStructural(child, depth + 1); // rekursif
}

/**
 * Validasi kendala (SAFETY GUARD longgar). Tidak memaksa keseimbangan -
 * hanya menolak pohon yang jelas rusak.
 */
function validateConstraints(node, depth = 0) {
  if (depth > MAX_DEPTH - 1) {
    throw new Error(`Kendala: kedalaman ${depth + 1} melebihi batas pengaman ${MAX_DEPTH} level (kemungkinan rekursi/halusinasi rusak)`);
  }
  if (node.children.length > MAX_BRANCH) {
    throw new Error(`Kendala: "${node.concept}" punya ${node.children.length} cabang (>${MAX_BRANCH} batas pengaman; kemungkinan parsing rusak)`);
  }
  for (const child of node.children) validateConstraints(child, depth + 1);
}

/**
 * Cek apakah token muncul di set sumber (eksak ATAU substring 4+ char).
 */
function tokenAppearsIn(token, sourceTokens, sourceText) {
  if (sourceTokens.has(token)) return true;
  if (token.length >= 4) {
    if (sourceText.toLowerCase().includes(token.toLowerCase())) return true;
    for (const st of sourceTokens) {
      if (st.length >= 4 && (st.startsWith(token.substring(0, 4)) || token.startsWith(st.substring(0, 4)))) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Apakah sebuah concept "berakar" di teks sumber?
 * - kalau punya token kata: cocokkan via tokenAppearsIn,
 * - kalau hanya berisi angka/simbol (mis. "2,61%"): cocokkan angka ke teks.
 */
function conceptRooted(concept, sourceTokens, sourceText) {
  const tokens = tokenize(concept);
  if (tokens.length) {
    if (tokens.some(t => tokenAppearsIn(t, sourceTokens, sourceText))) return true;
  }
  const nums = extractNumbers(concept);
  const srcNoSep = sourceText.replace(/[.,]/g, '');
  for (const n of nums) {
    if (sourceText.includes(n)) return true;
    if (srcNoSep.includes(n.replace(/[.,]/g, ''))) return true;
  }
  return false;
}

/**
 * Validasi semantik: proporsi node yang berakar di teks sumber.
 */
function semanticCoverage(node, sourceTokens, sourceText) {
  let matched = 0;
  let total = 0;
  const visit = (n) => {
    total += 1;
    if (conceptRooted(n.concept, sourceTokens, sourceText)) matched += 1;
    for (const c of n.children) visit(c);
  };
  visit(node);
  return { matched, total };
}

/**
 * Validasi kelengkapan: istilah KONSEPTUAL dominan teks ikut muncul.
 * Token angka murni TIDAK dijadikan syarat kelengkapan (bukan "konsep").
 */
function validateCoverage(node, sourceText) {
  const tokens = tokenize(sourceText).filter(t => !/^\d+$/.test(t));
  const freq = new Map();
  for (const t of tokens) freq.set(t, (freq.get(t) || 0) + 1);
  const top = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([t]) => t);
  if (!top.length) return; // teks (nyaris) seluruhnya angka -> lewati syarat ini

  const conceptBlob = [];
  const visit = (n) => {
    conceptBlob.push(n.concept.toLowerCase());
    for (const c of n.children) visit(c);
  };
  visit(node);
  const blob = conceptBlob.join(' ');

  const covered = top.filter(t => blob.includes(t.substring(0, Math.min(4, t.length))));
  if (covered.length / top.length < COVERAGE_THRESHOLD) {
    throw new Error(`Kelengkapan: hanya ${covered.length}/${top.length} istilah dominan tercakup (target >= ${Math.ceil(top.length * COVERAGE_THRESHOLD)}). Istilah yang belum: [${top.filter(t => !covered.includes(t)).join(', ')}]`);
  }
}

/**
 * Hitung statistik mind map untuk metadata.
 * shape: 'depth-heavy' | 'breadth-heavy' | 'balanced' (deskriptif, bukan paksaan).
 */
export function stats(node) {
  let nodes = 0;
  let depth = 0;
  let maxBranch = 0;
  const visit = (n, d) => {
    nodes += 1;
    if (d > depth) depth = d;
    const k = n.children?.length || 0;
    if (k > maxBranch) maxBranch = k;
    for (const c of n.children) visit(c, d + 1);
  };
  visit(node, 0);
  const branchesRoot = node.children?.length || 0;
  let shape = 'balanced';
  if (depth >= 2 * Math.max(maxBranch, 1)) shape = 'depth-heavy';
  else if (maxBranch >= 2 * Math.max(depth, 1)) shape = 'breadth-heavy';
  return { nodes, depth, branchesRoot, maxBranch, shape };
}

/**
 * Validasi BENTUK saja (struktural + kendala pengaman), tanpa cek
 * semantik/kelengkapan. Dipakai route untuk degradasi anggun: pohon yang
 * bentuknya sehat tidak boleh ditolak total hanya karena cek lunak gagal.
 * @returns {boolean} true jika bentuk valid; melempar Error jika tidak.
 */
export function validateShape(tree) {
  validateStructural(tree, 0);
  validateConstraints(tree, 0);
  return true;
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
export default { validate, validateShape, stats };
