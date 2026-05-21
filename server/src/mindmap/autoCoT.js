/**
 * autoCoT.js - Modul Auto-CoT Generator (MSM-03)
 *
 * Menyusun prompt akhir untuk LLM (Wei et al. 2022, Zhang et al. 2023):
 *   1. Deskripsi tugas
 *   2. Reasoning Auto-CoT
 *   3. JSON schema
 *   4. Few-shot demonstrasi via question-clustering
 *
 * Update: prompt sekarang meminta MIND MAP YANG KOMPREHENSIF dengan
 * kedalaman 3-4 level untuk teks panjang, bukan cuma 2 level.
 */

import { splitSentences } from './preprocess.js';
import { clusterSentences } from './embedding.js';

const JSON_SCHEMA = `{
  "concept": "string (frasa pendek 1-4 kata, BUKAN kalimat panjang)",
  "level":   "integer (root = 0, anak = parent.level + 1)",
  "children": [ /* array node anak dengan struktur sama */ ]
}`;

const SYSTEM_PROMPT = `Anda adalah asisten ahli yang mengubah teks naratif menjadi mind map hierarkis bergaya Tony Buzan.
Selalu balas dengan JSON valid sesuai schema. Gunakan bahasa yang SAMA dengan teks input.

ATURAN STRUKTURAL (WAJIB):
1. Bangun struktur KOMPREHENSIF dengan kedalaman 3-4 level (root level=0, sub-level 1, 2, 3).
   - Teks pendek (<500 char): minimal 2 level (root + cabang)
   - Teks sedang (500-2000 char): minimal 3 level (root + cabang + sub-konsep)
   - Teks panjang (>2000 char): WAJIB 4 level penuh dengan detail
2. Cabang langsung dari root: 4-7 cabang utama yang representatif (jangan kurang dari 4 kalau ada cukup materi).
3. Setiap cabang level-1 sebaiknya punya 2-4 anak (level-2), dan level-2 bisa punya 1-3 detail (level-3).
4. Setiap "concept" adalah KATA KUNCI atau frasa pendek (1-4 kata). BUKAN kalimat lengkap.
5. Properti "level" HARUS konsisten dengan kedalaman.
6. Setiap concept HARUS berakar pada teks sumber (hindari halusinasi).
7. PENTING: gunakan ISTILAH PERSIS yang muncul di teks sumber. Hindari sinonim atau parafrase.
8. Hindari redundansi: jangan tulis concept yang sama di dua cabang berbeda.
9. Susun secara hierarkis-semantik: kategori besar di level 1, sub-kategori di level 2, detail/contoh di level 3.

OUTPUT: HANYA JSON valid, tanpa markdown fence (jangan kasih backtick), tanpa komentar, tanpa teks tambahan.`;

const FEW_SHOT_EXAMPLE = `Contoh untuk teks SEDANG (~800 karakter):
TEKS: "Machine learning adalah cabang AI yang fokus pada algoritma yang belajar dari data. Tiga pendekatan utama: supervised learning menggunakan data berlabel untuk klasifikasi dan regresi. Unsupervised learning menemukan pola tersembunyi seperti clustering K-Means dan DBSCAN. Reinforcement learning melatih agen melalui reward signal, seperti pada robot dan game AI. Algoritma populer termasuk decision tree, random forest, dan neural network. Evaluasi model menggunakan metrik akurasi, precision, dan recall."

OUTPUT JSON (depth 3 - KOMPREHENSIF):
{
  "concept": "Machine Learning",
  "level": 0,
  "children": [
    { "concept": "Supervised Learning", "level": 1, "children": [
      { "concept": "Data Berlabel", "level": 2, "children": [
        { "concept": "Klasifikasi", "level": 3, "children": [] },
        { "concept": "Regresi", "level": 3, "children": [] }
      ]}
    ]},
    { "concept": "Unsupervised Learning", "level": 1, "children": [
      { "concept": "Clustering", "level": 2, "children": [
        { "concept": "K-Means", "level": 3, "children": [] },
        { "concept": "DBSCAN", "level": 3, "children": [] }
      ]},
      { "concept": "Pola Tersembunyi", "level": 2, "children": [] }
    ]},
    { "concept": "Reinforcement Learning", "level": 1, "children": [
      { "concept": "Reward Signal", "level": 2, "children": [] },
      { "concept": "Aplikasi", "level": 2, "children": [
        { "concept": "Robot", "level": 3, "children": [] },
        { "concept": "Game AI", "level": 3, "children": [] }
      ]}
    ]},
    { "concept": "Algoritma", "level": 1, "children": [
      { "concept": "Decision Tree", "level": 2, "children": [] },
      { "concept": "Random Forest", "level": 2, "children": [] },
      { "concept": "Neural Network", "level": 2, "children": [] }
    ]},
    { "concept": "Evaluasi Model", "level": 1, "children": [
      { "concept": "Akurasi", "level": 2, "children": [] },
      { "concept": "Precision", "level": 2, "children": [] },
      { "concept": "Recall", "level": 2, "children": [] }
    ]}
  ]
}

Perhatikan: ada 5 cabang utama, sebagian besar memiliki 2-3 anak, beberapa memiliki cucu (level-3 detail). Ini struktur yang KOMPREHENSIF, bukan dangkal.`;

function buildDemonstrations(text, demos = 3) {
  const sentences = splitSentences(text);
  if (sentences.length < 2) return [];
  const k = Math.min(demos, sentences.length);
  const { medoids } = clusterSentences(sentences, k);
  return medoids.map(idx => sentences[idx]).filter(Boolean);
}

/**
 * Bangun prompt {system, user}.
 * @param {string} text
 * @param {{ demos?:number, previousError?:string, targetDepth?:number }} [options]
 */
export function buildPrompt(text, options = {}) {
  const { demos = 3, previousError, targetDepth } = options;
  const samples = buildDemonstrations(text, demos);
  const len = text.length;
  const inferDepth = len > 2000 ? 4 : (len > 500 ? 3 : 2);
  const depth = targetDepth || inferDepth;

  const reasoning = `LAKUKAN REASONING AUTO-COT SECARA INTERNAL (jangan tulis di output):
Langkah 1: Identifikasi TOPIK UTAMA dari teks (1 frasa pendek) -> root level=0.
Langkah 2: Tentukan 4-7 CABANG UTAMA (level=1) yang merepresentasikan kategori besar di teks.
Langkah 3: Untuk SETIAP cabang utama, tentukan 2-4 SUB-KONSEP (level=2) berdasarkan detail teks.
Langkah 4: Untuk sub-konsep yang punya detail spesifik (contoh, jenis, atribut), tambahkan 1-3 DETAIL (level=3).
Langkah 5: TARGET KEDALAMAN: ${depth} level. Teks ini panjangnya ${len} karakter sehingga butuh struktur ${depth >= 3 ? 'komprehensif (3-4 level)' : 'dasar (2 level)'}.
Langkah 6: Verifikasi setiap concept berasal dari teks input, tidak redundan, dan level konsisten.`;

  const demoBlock = samples.length
    ? `\nKALIMAT REPRESENTATIF DARI TEKS (hasil semantic clustering, untuk panduan):\n${samples.map((s, i) => `${i + 1}. ${s}`).join('\n')}`
    : '';

  const retryBlock = previousError
    ? `\nPERHATIAN: percobaan sebelumnya GAGAL validasi: "${previousError}".
PERBAIKI di iterasi ini. Cek ulang level konsistensi, kedalaman, jumlah cabang, dan apakah concept berakar pada teks.`
    : '';

  const user = `TUGAS: Ekstrak struktur hierarkis mind map dari teks berikut.
JADIKAN KOMPREHENSIF DENGAN TARGET ${depth} LEVEL HIERARKI - JANGAN cuma 2 level kalau teksnya kaya informasi.

SCHEMA JSON OUTPUT (wajib diikuti):
${JSON_SCHEMA}

${reasoning}

${FEW_SHOT_EXAMPLE}

${demoBlock}
${retryBlock}

TEKS INPUT YANG HARUS DIPETAKAN (${len} karakter):
"""
${text.trim()}
"""

Balas HANYA dengan JSON valid sesuai schema, dengan struktur SEDALAM mungkin (target ${depth} level). Tanpa markdown fence, tanpa penjelasan.`;

  return { system: SYSTEM_PROMPT, user };
}

export default { buildPrompt };
