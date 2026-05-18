/**
 * autoCoT.js - Modul Auto-CoT Generator (MSM-03)
 *
 * Menyusun prompt akhir untuk LLM berdasarkan empat elemen:
 *   1. Deskripsi tugas
 *   2. Instruksi reasoning Auto-CoT
 *   3. Spesifikasi JSON schema output
 *   4. Demonstrasi few-shot yang dihasilkan otomatis via
 *      question-clustering (lihat embedding.clusterSentences) +
 *      zero-shot CoT.
 *
 * Output: { system, user } string yang siap dikirim ke LLM client.
 */

import { splitSentences } from './preprocess.js';
import { clusterSentences } from './embedding.js';

const JSON_SCHEMA = `{
  "concept": "string (frasa pendek, 1-4 kata, tanpa kalimat penuh)",
  "level": "integer (0 = root)",
  "children": [
    { "concept": "...", "level": 1, "children": [...] }
  ]
}`;

const SYSTEM_PROMPT = `Anda adalah asisten ahli yang mengubah teks naratif menjadi mind map hierarkis Tony Buzan.
Selalu balas dengan JSON valid sesuai schema. Gunakan bahasa yang sama dengan teks input.
Aturan struktural:
- Maksimal kedalaman 4 level (root + 3 sub-level).
- Maksimal 7 cabang langsung untuk node root.
- Setiap concept adalah kata kunci, BUKAN kalimat.
- Hindari redundansi dan halusinasi (semua concept harus berdasar pada teks input).`;

/**
 * Susun beberapa contoh few-shot otomatis menggunakan kalimat
 * representatif dari setiap cluster (Auto-CoT-style demonstration).
 *
 * @param {string} text - teks input pengguna
 * @param {number} demos - jumlah contoh yang dimasukkan ke prompt
 * @returns {string[]}
 */
function buildDemonstrations(text, demos = 3) {
  const sentences = splitSentences(text);
  if (sentences.length < 2) return [];
  const k = Math.min(demos, sentences.length);
  const { medoids } = clusterSentences(sentences, k);
  return medoids
    .map(idx => sentences[idx])
    .filter(Boolean);
}

/**
 * Bangun pasangan { system, user } prompt untuk LLM.
 *
 * @param {string} text - teks sumber yang akan dipetakan
 * @param {Object} [options]
 * @param {number} [options.demos=3] - jumlah demonstrasi few-shot
 * @param {string} [options.previousError] - error validasi sebelumnya untuk perbaikan
 * @returns {{system:string, user:string}}
 */
export function buildPrompt(text, options = {}) {
  const { demos = 3, previousError } = options;
  const samples = buildDemonstrations(text, demos);

  const reasoning = `Lakukan reasoning Auto-CoT secara internal sebelum menghasilkan JSON:
Langkah 1: Identifikasi topik utama (root) dari teks.
Langkah 2: Tentukan 3-7 cabang utama (level 1) yang mewakili kategori besar.
Langkah 3: Untuk setiap cabang, tentukan sub-konsep (level 2) yang relevan.
Langkah 4: Verifikasi setiap concept berasal dari teks dan tidak redundan.`;

  const demoBlock = samples.length
    ? `\nContoh kalimat representatif (untuk konteks):\n${samples
        .map((s, i) => `${i + 1}. ${s}`)
        .join('\n')}`
    : '';

  const retryBlock = previousError
    ? `\nPerhatian: percobaan sebelumnya gagal dengan alasan: ${previousError}. Perbaiki di iterasi ini.`
    : '';

  const user = `Tugas: ekstrak struktur hierarkis mind map dari teks berikut.

Schema JSON yang WAJIB:
${JSON_SCHEMA}

${reasoning}
${demoBlock}
${retryBlock}

Teks input:
"""
${text.trim()}
"""

Balas HANYA dengan JSON valid, tanpa markdown fence, tanpa komentar.`;

  return { system: SYSTEM_PROMPT, user };
}

export default { buildPrompt };
