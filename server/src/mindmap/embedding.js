/**
 * embedding.js - Modul Sentence Embedding (MSM-02)
 *
 * Catatan: implementasi *deterministik & lokal* berbasis bag-of-words
 * TF-IDF agar pipeline Auto-CoT dapat berjalan tanpa dependensi LLM
 * eksternal pada tahap question-clustering. Dapat ditukar dengan
 * model embedding seperti `text-embedding-3-small` di kemudian hari.
 *
 * - vectorize(sentence, vocab) -> Map<term, tfidf>
 * - cosine(a, b) -> number ∈ [0, 1]
 * - clusterSentences(sentences, k) -> array of cluster (indeks kalimat)
 *   menggunakan algoritma k-medoids sederhana untuk stabilitas dan
 *   menghindari random seed (FR-3: output konsisten).
 */

import { tokenize } from './preprocess.js';

/**
 * Bangun vocabulary + document frequency.
 * @param {string[][]} docs - array of token arrays
 * @returns {{vocab:Map<string,number>, df:Map<string,number>}}
 */
function buildVocab(docs) {
  const vocab = new Map();
  const df = new Map();
  for (const doc of docs) {
    const seen = new Set();
    for (const term of doc) {
      if (!vocab.has(term)) vocab.set(term, vocab.size);
      if (!seen.has(term)) {
        df.set(term, (df.get(term) || 0) + 1);
        seen.add(term);
      }
    }
  }
  return { vocab, df };
}

/**
 * Hitung vektor TF-IDF (Map) untuk sebuah dokumen.
 * @param {string[]} tokens
 * @param {Map<string,number>} df
 * @param {number} N - jumlah dokumen total
 * @returns {Map<string,number>}
 */
function tfidfVector(tokens, df, N) {
  const tf = new Map();
  for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
  const vec = new Map();
  for (const [term, freq] of tf) {
    const idf = Math.log((N + 1) / ((df.get(term) || 0) + 1)) + 1;
    vec.set(term, freq * idf);
  }
  return vec;
}

/**
 * Cosine similarity antar dua vektor Map.
 * @param {Map<string,number>} a
 * @param {Map<string,number>} b
 * @returns {number}
 */
export function cosine(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const [, v] of a) na += v * v;
  for (const [, v] of b) nb += v * v;
  for (const [term, av] of a) {
    if (b.has(term)) dot += av * b.get(term);
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Buat vektor TF-IDF untuk daftar kalimat.
 * @param {string[]} sentences
 * @returns {Map<string,number>[]}
 */
export function vectorize(sentences) {
  const tokenized = sentences.map(tokenize);
  const { df } = buildVocab(tokenized);
  const N = sentences.length || 1;
  return tokenized.map(tokens => tfidfVector(tokens, df, N));
}

/**
 * K-medoids clustering deterministik atas vektor kalimat.
 * Medoid awal dipilih berdasarkan indeks teratur (kalimat ke-(i*N/k))
 * sehingga output reproducible (penting untuk FR-3).
 *
 * @param {string[]} sentences
 * @param {number} k - jumlah cluster yang diinginkan (1..N)
 * @returns {{clusters:number[][], medoids:number[]}}
 */
export function clusterSentences(sentences, k) {
  const N = sentences.length;
  const targetK = Math.max(1, Math.min(k, N));
  const vectors = vectorize(sentences);
  // medoid awal: indeks tersebar merata
  let medoids = Array.from({ length: targetK }, (_, i) =>
    Math.floor((i * N) / targetK)
  );
  const distance = (a, b) => 1 - cosine(vectors[a], vectors[b]);

  for (let iter = 0; iter < 20; iter += 1) {
    // assign
    const clusters = Array.from({ length: targetK }, () => []);
    for (let i = 0; i < N; i += 1) {
      let best = 0;
      let bestD = Infinity;
      for (let m = 0; m < medoids.length; m += 1) {
        const d = distance(i, medoids[m]);
        if (d < bestD) { bestD = d; best = m; }
      }
      clusters[best].push(i);
    }
    // recompute medoid: pilih anggota dengan total jarak intra-cluster minimal
    const newMedoids = medoids.slice();
    for (let m = 0; m < clusters.length; m += 1) {
      const members = clusters[m];
      if (!members.length) continue;
      let bestIdx = members[0];
      let bestSum = Infinity;
      for (const i of members) {
        let sum = 0;
        for (const j of members) sum += distance(i, j);
        if (sum < bestSum) { bestSum = sum; bestIdx = i; }
      }
      newMedoids[m] = bestIdx;
    }
    if (newMedoids.every((v, i) => v === medoids[i])) {
      return { clusters, medoids: newMedoids };
    }
    medoids = newMedoids;
  }
  // fallback jika tidak konvergen
  const clusters = Array.from({ length: targetK }, () => []);
  for (let i = 0; i < N; i += 1) {
    let best = 0;
    let bestD = Infinity;
    for (let m = 0; m < medoids.length; m += 1) {
      const d = distance(i, medoids[m]);
      if (d < bestD) { bestD = d; best = m; }
    }
    clusters[best].push(i);
  }
  return { clusters, medoids };
}

export default { vectorize, cosine, clusterSentences };
