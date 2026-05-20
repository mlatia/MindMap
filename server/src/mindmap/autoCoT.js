/**
 * autoCoT.js - Modul Auto-CoT Generator (MSM-03)
 *
 * Menyusun prompt akhir untuk LLM berdasarkan empat elemen (Wei et al. 2022,
 * Zhang et al. 2023):
 *   1. Deskripsi tugas (task description)
 *   2. Instruksi reasoning Auto-CoT (chain-of-thought guidance)
 *   3. Spesifikasi JSON schema output (format spec)
 *   4. Demonstrasi few-shot yang dihasilkan otomatis melalui
 *      question-clustering + kalimat representatif (lihat embedding.js).
 *
 * Output: { system, user } string yang siap dikirim ke LLM client.
 */

import { splitSentences } from './preprocess.js';
import { clusterSentences } from './embedding.js';

// ---- JSON schema yang WAJIB diikuti LLM ----
const JSON_SCHEMA = `{
  "concept": "string (frasa pendek 1-4 kata, BUKAN kalimat panjang)",
  "level":   "integer (root = 0, anak = parent.level + 1)",
  "children": [ /* array node anak dengan struktur sama */ ]
}`;

// ---- System prompt: aturan ketat ----
const SYSTEM_PROMPT = `Anda adalah asisten ahli yang mengubah teks naratif menjadi mind map hierarkis bergaya Tony Buzan.
Selalu balas dengan JSON valid sesuai schema. Gunakan bahasa yang SAMA dengan teks input.

ATURAN STRUKTURAL (WAJIB):
1. Kedalaman maksimal 10 level (root level=0, sub-level 1, 2, 3). JANGAN buat level 4 atau lebih.
2. Cabang langsung dari root MAKSIMAL 7. Pilih 3-7 cabang utama yang paling representatif.
3. Setiap "concept" adalah KATA KUNCI atau frasa pendek (1-4 kata). BUKAN kalimat lengkap.
4. Properti "level" HARUS konsisten dengan kedalaman (root=0, anak root=1, cucu root=2, dst).
5. Setiap concept HARUS berakar pada teks sumber (hindari halusinasi). Gunakan istilah dari teks.
6. Hindari redundansi: jangan tulis concept yang sama di dua cabang berbeda.
7. Susun secara hierarkis: ide besar di level 1-3, detail di level 4-10.
8. PENTING: gunakan ISTILAH PERSIS yang muncul di teks sumber untuk setiap "concept". Hindari sinonim atau parafrase. Contoh: jika teks mengatakan "Tony Buzan", tulis "Tony Buzan", BUKAN "penemu mind map". Ini memudahkan validasi kelengkapan.

OUTPUT: HANYA JSON valid, tanpa markdown fence (jangan kasih backtick), tanpa komentar, tanpa teks tambahan.`;

// ---- Contoh demonstrasi (Auto-CoT few-shot) ----
const FEW_SHOT_EXAMPLE = `Contoh:
TEKS: "Mind mapping adalah teknik visualisasi yang dikembangkan Tony Buzan. Teknik ini memetakan konsep dari pusat ke cabang radial. Penelitian menunjukkan mind map efektif meningkatkan retensi memori siswa. Pembuatan manual butuh 20-30 menit per dokumen."

REASONING (jangan ditulis di output, hanya panduan internal):
- Topik utama: Mind Mapping
- Cabang utama: (a) penemu Tony Buzan, (b) struktur radial, (c) manfaat memori, (d) hambatan waktu
- Tiap cabang punya 1-2 sub-konsep dari detail teks

OUTPUT JSON:
{
  "concept": "Mind Mapping",
  "level": 0,
  "children": [
    { "concept": "Tony Buzan", "level": 1, "children": [
      { "concept": "Teknik Visualisasi", "level": 2, "children": [] }
    ]},
    { "concept": "Struktur Radial", "level": 1, "children": [
      { "concept": "Pusat ke Cabang", "level": 2, "children": [] }
    ]},
    { "concept": "Retensi Memori", "level": 1, "children": [
      { "concept": "Efektif untuk Siswa", "level": 2, "children": [] }
    ]},
    { "concept": "Pembuatan Manual", "level": 1, "children": [
      { "concept": "20-30 Menit", "level": 2, "children": [] }
    ]}
  ]
}`;

/**
 * Susun kalimat representatif via question-clustering (Auto-CoT).
 * @param {string} text - teks input pengguna
 * @param {number} demos - jumlah contoh yang dimasukkan ke prompt
 * @returns {string[]}
 */
function buildDemonstrations(text, demos = 3) {
  const sentences = splitSentences(text);
  if (sentences.length < 2) return [];
  const k = Math.min(demos, sentences.length);
  const { medoids } = clusterSentences(sentences, k);
  return medoids.map(idx => sentences[idx]).filter(Boolean);
}

/**
 * Bangun pasangan { system, user } prompt untuk LLM.
 *
 * @param {string} text - teks sumber yang akan dipetakan
 * @param {Object} [options]
 * @param {number} [options.demos=3] - jumlah kalimat representatif dari clustering
 * @param {string} [options.previousError] - pesan error validasi sebelumnya (untuk retry)
 * @returns {{system:string, user:string}}
 */
export function buildPrompt(text, options = {}) {
  const { demos = 3, previousError } = options;
  const samples = buildDemonstrations(text, demos);

  const reasoning = `LAKUKAN REASONING AUTO-COT SECARA INTERNAL (jangan tulis di output):
Langkah 1: Identifikasi TOPIK UTAMA dari teks (1 frasa pendek) -> root level=0.
Langkah 2: Tentukan 3-7 CABANG UTAMA (level=1) yang merepresentasikan kategori besar di teks.
Langkah 3: Untuk tiap cabang utama, tentukan 1-3 SUB-KONSEP (level=2) berdasarkan detail teks.
Langkah 4: Jika ada detail lebih spesifik, tambahkan level=3 (jangan lebih dalam).
Langkah 5: Verifikasi setiap concept berasal dari teks input, tidak redundan, dan level konsisten.`;

  const demoBlock = samples.length
    ? `\nKALIMAT REPRESENTATIF DARI TEKS (hasil semantic clustering, untuk panduan):\n${samples.map((s, i) => `${i + 1}. ${s}`).join('\n')}`
    : '';

  const retryBlock = previousError
    ? `\nPERHATIAN: percobaan sebelumnya GAGAL validasi dengan alasan: "${previousError}".
PERBAIKI di iterasi ini. Cek ulang level konsistensi, kedalaman, jumlah cabang, dan apakah concept berakar pada teks.`
    : '';

  const user = `TUGAS: Ekstrak struktur hierarkis mind map dari teks berikut.

SCHEMA JSON OUTPUT (wajib diikuti):
${JSON_SCHEMA}

${reasoning}

${FEW_SHOT_EXAMPLE}
${demoBlock}
${retryBlock}

TEKS INPUT YANG HARUS DIPETAKAN:
"""
${text.trim()}
"""

Balas HANYA dengan JSON valid sesuai schema. Tanpa markdown fence, tanpa penjelasan, tanpa komentar.`;

  return { system: SYSTEM_PROMPT, user };
}

export default { buildPrompt };
