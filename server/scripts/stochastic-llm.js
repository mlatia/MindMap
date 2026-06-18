/**
 * stochastic-llm.js - Simulator variabilitas LLM untuk evaluasi stabilitas OFFLINE.
 *
 * Mengapa ada: provider "mock" bersifat DETERMINISTIK sehingga SCS selalu 1.0
 * (tidak realistis). Provider LLM nyata (Groq/Anthropic/OpenAI) butuh jaringan
 * & kuota. Simulator ini meniru variabilitas wajar LLM pada suhu > 0:
 *   - parafrase ringan label (pilih token berbeda dari kalimat sumber),
 *   - pengurutan ulang cabang/anak,
 *   - sesekali tambah/buang 1 node atau menambah 1 level,
 *   - jumlah cabang bergeser +-1.
 *
 * Semua concept TETAP berakar pada token teks sumber sehingga lolos validasi
 * (tidak ada halusinasi). Dengan begitu metrik STED/SCS/SCR/ESR (Wang dkk. 2025)
 * bisa dihitung dan ditampilkan secara reproducible (seed -> hasil sama).
 *
 * PENTING: ini ALAT EVALUASI OFFLINE, bukan pengganti LLM untuk produksi.
 * Untuk angka final TA, jalankan dengan provider LLM nyata.
 */

import { splitSentences, tokenize } from '../src/mindmap/preprocess.js';

/** RNG deterministik (mulberry32) - seed sama => urutan sama. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rnd) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Bentuk concept dari sebuah kalimat: pilih token PALING DISTINGTIF (jarang di
 * seluruh dokumen) sebagai label - meniru cara LLM menamai cabang dengan istilah
 * pembeda, bukan kata yang muncul di mana-mana (mis. "persen"). `globalFreq`
 * adalah frekuensi token di seluruh teks.
 */
function conceptFrom(sentence, rnd, max = 3, jitter = false, globalFreq = new Map(), topGlobal = '') {
  const tokens = tokenize(sentence);
  if (!tokens.length) {
    const num = (sentence.match(/\d+(?:[.,]\d+)*%?/) || [])[0];
    return num || sentence.split(/\s+/).slice(0, max).join(' ');
  }
  // urut berdasarkan frekuensi global DESC (istilah dominan dulu -> bagus utk
  // kelengkapan), TAPI buang 1 token paling ubikuitus (mis. "persen") agar label
  // tetap distingtif & tidak duplikatif antar cabang.
  const uniq = [...new Set(tokens)].filter(t => t !== topGlobal);
  const pool = uniq.length ? uniq : [...new Set(tokens)];
  let ranked = pool.sort((a, b) => {
    const ga = globalFreq.get(a) || 1, gb = globalFreq.get(b) || 1;
    if (gb !== ga) return gb - ga;          // dominan dulu
    if (b.length !== a.length) return b.length - a.length;
    return a.localeCompare(b);
  });
  if (jitter && ranked.length > max && rnd() < 0.4) ranked = ranked.slice(1);
  const n = Math.max(1, Math.min(max, ranked.length));
  const pick = ranked.slice(0, n);
  return pick.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/**
 * Hasilkan satu pohon mind map dengan variabilitas terkontrol seed.
 * @param {string} text
 * @param {number} seed
 * @returns {object} tree {concept, level, children}
 */
export function simulateMindMap(text, seed = 1) {
  const rnd = mulberry32(seed);
  const sentences = splitSentences(text);
  if (!sentences.length) return { concept: 'Mind Map', level: 0, children: [] };

  const tokens = tokenize(text);
  const freq = new Map();
  for (const t of tokens) freq.set(t, (freq.get(t) || 0) + 1);
  const ranked = [...freq.entries()].sort((a, b) => b[1] - a[1]);
  const topGlobal = ranked.length ? ranked[0][0] : '';
  const topTopic = ranked.length
    ? ranked.slice(0, 2).map(([w]) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    : 'Mind Map';

  // ---- DETEKSI BENTUK DARI ISI (bukan dipaksa) ----
  // Teks RUNTUT/SEBAB-AKIBAT (banyak konektif) -> dirangkai DALAM (depth-heavy).
  // Teks DAFTAR/PARALEL -> melebar (breadth-heavy). Sisanya -> balanced.
  const SEQ = /\b(lalu|kemudian|setelah|selanjutnya|sehingga|akibatnya|akhirnya|maka|membentuk|menjadi|diubah|hingga|diikuti|menyebabkan|mengakibatkan|berikutnya|sebab|disimpan)\b/i;
  const linked = sentences.map((sent, i) => i > 0 && SEQ.test(sent.slice(0, Math.ceil(sent.length * 0.65))));
  const linkRatio = sentences.length > 1 ? linked.filter(Boolean).length / (sentences.length - 1) : 0;

  const seen = new Set();
  const addConcept = (sent, max) => {
    const cc = conceptFrom(sent, rnd, max, true, freq, topGlobal);
    const k = cc.toLowerCase();
    if (!cc || seen.has(k)) return null;
    seen.add(k);
    return cc;
  };

  if (linkRatio >= 0.4 && sentences.length >= 3) {
    // ----- MODE RANTAI (depth-heavy muncul alami) -----
    const children = [];
    let cursor = null;           // node terakhir di rantai
    let level = 1;
    for (let i = 0; i < sentences.length; i += 1) {
      const cc = addConcept(sentences[i], 2);
      if (!cc) continue;
      const node = { concept: cc, level, children: [] };
      const breakChain = i === 0 || !linked[i] || rnd() < 0.1; // variasi: kadang putus
      if (breakChain || !cursor) {
        node.level = 1; children.push(node); cursor = node; level = 2;
      } else {
        node.level = level; cursor.children.push(node); cursor = node; level += 1;
      }
    }
    return { concept: topTopic, level: 0, children };
  }

  // ----- MODE SIBLING (breadth-heavy / balanced muncul alami) -----
  let branchSentences = shuffle(sentences.map((s, i) => ({ s, i })), rnd);
  const drop = rnd() < 0.5 ? 1 : 0; // sesekali buang 1 cabang
  if (branchSentences.length - drop >= 2) branchSentences = branchSentences.slice(0, branchSentences.length - drop);

  const children = [];
  for (const { s } of branchSentences) {
    const concept = addConcept(s, 2);
    if (!concept) continue;
    const kids = [];
    if (rnd() < 0.5) {
      const sub = addConcept(s, 3);
      if (sub) {
        const grand = [];
        if (rnd() < 0.22) {
          const g = addConcept(s, 1);
          if (g) grand.push({ concept: g, level: 3, children: [] });
        }
        kids.push({ concept: sub, level: 2, children: grand });
      }
    }
    children.push({ concept, level: 1, children: kids });
  }
  return { concept: topTopic, level: 0, children };
}

export default { simulateMindMap };
