/**
 * autoCoT.js - Modul Auto-CoT Generator (MSM-03)
 *
 * Menyusun prompt akhir untuk LLM berdasarkan dua referensi inti:
 *   - Wei dkk. (2022) "Chain-of-Thought Prompting Elicits Reasoning in LLMs"
 *     -> reasoning bertahap (chain-of-thought) sebelum menghasilkan jawaban.
 *   - Zhang dkk. (2023, ICLR) "Automatic Chain-of-Thought Prompting in LLMs"
 *     -> demonstrasi few-shot dibentuk OTOMATIS via question-clustering
 *        (k-medoids atas embedding kalimat), bukan few-shot manual.
 *
 * PRINSIP DESAIN PROMPT (revisi):
 *   Struktur JSON HARUS MENGIKUTI struktur informasi pada teks (faithful),
 *   BUKAN dipaksa menjadi seimbang/komprehensif. Bentuk akhir pohon
 *   (depth-heavy, breadth-heavy, atau balanced) dibiarkan MUNCUL ALAMI dari
 *   isi teks, lalu baru dianalisis kualitas visualnya pada tahap evaluasi.
 *
 *   Karena itu prompt ini SECARA SENGAJA TIDAK lagi:
 *     - menargetkan jumlah level tertentu (dulu "3-4 level"),
 *     - menargetkan jumlah cabang tertentu (dulu "4-7 cabang"),
 *     - meminta struktur "sedalam mungkin" / "komprehensif".
 *   Sebagai gantinya prompt menekankan kesetiaan pada teks, anti-duplikasi,
 *   dan kebebasan bentuk (cocok untuk teks naratif maupun teks padat angka
 *   seperti data statistik BPS yang relasinya tidak selalu eksplisit).
 */

import { splitSentences } from './preprocess.js';
import { clusterSentences } from './embedding.js';

const JSON_SCHEMA = `{
  "concept": "string (frasa pendek / kata kunci 1-4 kata, BUKAN kalimat panjang)",
  "level":   "integer (root = 0, anak = parent.level + 1)",
  "children": [ /* array node anak dengan struktur sama; boleh kosong [] */ ]
}`;

const SYSTEM_PROMPT = `Anda adalah asisten ahli yang mengubah teks menjadi mind map hierarkis bergaya Tony Buzan.
Selalu balas HANYA dengan JSON valid sesuai schema. Gunakan bahasa yang SAMA dengan teks input.

PRINSIP UTAMA: BENTUK MENGIKUTI ISI (FAITHFUL TO TEXT).
Struktur pohon harus mencerminkan struktur informasi yang BENAR-BENAR ADA di teks.
JANGAN memaksakan pohon menjadi seimbang, dalam, atau lebar. Biarkan bentuknya muncul apa adanya:
  - teks runtut/berproses sebab-akibat boleh menghasilkan pohon DALAM (depth-heavy),
  - teks berisi daftar/banyak item sejajar (mis. data statistik) boleh menghasilkan pohon LEBAR & DANGKAL (breadth-heavy),
  - teks campuran boleh menghasilkan pohon SEIMBANG (balanced).
Ketiganya sama-sama benar selama setia pada teks.

ATURAN STRUKTURAL (WAJIB):
1. Tentukan satu TOPIK UTAMA sebagai root (level 0).
2. Buat hubungan parent-child HANYA bila ada keterkaitan yang jelas (eksplisit atau implisit yang kuat) di teks.
   Jika sebuah informasi tidak punya induk yang jelas, jadikan ia cabang LANGSUNG dari root - jangan dipaksa menempel ke node lain.
3. JANGAN menambah level atau cabang hanya untuk "mengisi" bentuk. Berhenti memperdalam saat teks tidak lagi menyediakan detail.
4. Setiap "concept" adalah kata kunci / frasa pendek (1-4 kata), BUKAN kalimat. Gunakan ISTILAH PERSIS dari teks (hindari sinonim/parafrase).
5. Properti "level" konsisten dengan kedalaman (root=0, anak=parent.level+1).
6. ANTI-DUPLIKASI: satu konsep hanya boleh muncul di SATU tempat. Jangan menulis concept yang sama di dua cabang berbeda.
7. TEKS PADAT ANGKA / STATISTIK: kelompokkan nilai di bawah dimensi/label yang relevan apa adanya
   (mis. "Inflasi 2023" -> "2,61%"), tanpa memaksa hierarki dalam atau mengarang kategori yang tidak ada di teks.
8. Setiap concept HARUS berakar pada teks sumber (hindari halusinasi).

OUTPUT: HANYA JSON valid, tanpa markdown fence (jangan kasih backtick), tanpa komentar, tanpa teks tambahan.`;

/* ---------------------------------------------------------------------------
 * Few-shot demonstrasi (Zhang dkk. 2023): sengaja DIBUAT KONTRAS agar model
 * tidak belajar satu pola "seimbang" saja. Tiga contoh = tiga bentuk pohon
 * yang berbeda, semuanya setia pada teksnya masing-masing.
 * ------------------------------------------------------------------------- */
const FEW_SHOT_EXAMPLES = `CONTOH 1 - teks PADAT ANGKA (bentuk LEBAR/DANGKAL muncul alami, breadth-heavy):
TEKS: "Inflasi tahunan Indonesia tercatat 3,61% pada 2022, lalu 2,61% pada 2023, dan 1,57% pada 2024. Komponen inti menyumbang 2,11%, harga bergejolak 0,12%, sedangkan harga diatur pemerintah 0,34%."
OUTPUT JSON:
{
  "concept": "Inflasi Indonesia",
  "level": 0,
  "children": [
    { "concept": "Inflasi 2022", "level": 1, "children": [ { "concept": "3,61%", "level": 2, "children": [] } ] },
    { "concept": "Inflasi 2023", "level": 1, "children": [ { "concept": "2,61%", "level": 2, "children": [] } ] },
    { "concept": "Inflasi 2024", "level": 1, "children": [ { "concept": "1,57%", "level": 2, "children": [] } ] },
    { "concept": "Komponen Inti", "level": 1, "children": [ { "concept": "2,11%", "level": 2, "children": [] } ] },
    { "concept": "Harga Bergejolak", "level": 1, "children": [ { "concept": "0,12%", "level": 2, "children": [] } ] },
    { "concept": "Harga Diatur Pemerintah", "level": 1, "children": [ { "concept": "0,34%", "level": 2, "children": [] } ] }
  ]
}
Perhatikan: relasi antar angka tidak dalam, jadi pohonnya WAJAR lebar & dangkal. Tidak dipaksa berlevel banyak.

CONTOH 2 - teks BERPROSES/RUNTUT (bentuk DALAM muncul alami, depth-heavy):
TEKS: "Fotosintesis diawali penyerapan cahaya oleh klorofil. Cahaya memecah air menjadi oksigen dan hidrogen. Hidrogen lalu dipakai mengikat karbondioksida. Ikatan itu membentuk glukosa sebagai sumber energi."
OUTPUT JSON:
{
  "concept": "Fotosintesis",
  "level": 0,
  "children": [
    { "concept": "Penyerapan Cahaya", "level": 1, "children": [
      { "concept": "Pemecahan Air", "level": 2, "children": [
        { "concept": "Oksigen", "level": 3, "children": [] },
        { "concept": "Hidrogen", "level": 3, "children": [
          { "concept": "Mengikat Karbondioksida", "level": 4, "children": [
            { "concept": "Glukosa", "level": 5, "children": [] }
          ]}
        ]}
      ]}
    ]}
  ]
}
Perhatikan: karena teks bersifat rantai sebab-akibat, pohonnya WAJAR dalam & sempit. Tidak dipaksa melebar.

CONTOH 3 - teks BERKATEGORI (bentuk SEIMBANG muncul alami, balanced):
TEKS: "Machine learning punya tiga pendekatan. Supervised learning memakai data berlabel untuk klasifikasi dan regresi. Unsupervised learning menemukan pola seperti clustering. Reinforcement learning melatih agen lewat reward."
OUTPUT JSON:
{
  "concept": "Machine Learning",
  "level": 0,
  "children": [
    { "concept": "Supervised Learning", "level": 1, "children": [
      { "concept": "Klasifikasi", "level": 2, "children": [] },
      { "concept": "Regresi", "level": 2, "children": [] }
    ]},
    { "concept": "Unsupervised Learning", "level": 1, "children": [
      { "concept": "Clustering", "level": 2, "children": [] }
    ]},
    { "concept": "Reinforcement Learning", "level": 1, "children": [
      { "concept": "Reward", "level": 2, "children": [] }
    ]}
  ]
}
Perhatikan: jumlah cabang & kedalaman TIDAK dipaksa sama; mengikuti banyaknya detail tiap kategori di teks.`;

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
 * @param {{ demos?:number, previousError?:string }} [options]
 */
export function buildPrompt(text, options = {}) {
  const { demos = 3, previousError } = options;
  const samples = buildDemonstrations(text, demos);
  const len = text.length;

  // Reasoning Auto-CoT: DIPANDU ISI, BUKAN target kedalaman/jumlah cabang.
  const reasoning = `LAKUKAN REASONING AUTO-COT SECARA INTERNAL (jangan tulis di output):
Langkah 1: Tentukan TOPIK UTAMA teks (1 frasa pendek) -> root level=0.
Langkah 2: Daftarkan UNIT INFORMASI penting yang benar-benar ada di teks (apa adanya), tanpa menargetkan jumlah tertentu.
Langkah 3: Untuk tiap unit, putuskan: apakah ia sub-bagian dari unit lain (ada keterkaitan jelas) ATAU berdiri sendiri?
           - jika sub-bagian -> jadikan anak dari unit induknya.
           - jika berdiri sendiri -> jadikan cabang langsung dari root.
Langkah 4: Perdalam sebuah cabang HANYA selama teks memberi detail lanjutan. Jika tidak ada detail, biarkan children = [].
Langkah 5: Periksa anti-duplikasi (satu konsep satu tempat) dan pastikan setiap concept berakar di teks.
Langkah 6: JANGAN menyamakan jumlah cabang antar node dan JANGAN menyamakan kedalaman antar cabang. Bentuk akhir mengikuti teks.`;

  const demoBlock = samples.length
    ? `\nKALIMAT REPRESENTATIF DARI TEKS (hasil semantic clustering Auto-CoT, untuk panduan):\n${samples.map((s, i) => `${i + 1}. ${s}`).join('\n')}`
    : '';

  const retryBlock = previousError
    ? `\nPERHATIAN: percobaan sebelumnya GAGAL validasi: "${previousError}".
PERBAIKI di iterasi ini TANPA mengubah bentuk pohon menjadi seimbang secara paksa.
Cek ulang: level konsisten, tidak ada duplikasi, setiap concept berakar di teks, dan JSON valid.`
    : '';

  const user = `TUGAS: Ekstrak struktur hierarkis mind map dari teks berikut, SETIA pada struktur informasi teks.
Bentuk pohon (dalam / lebar / seimbang) biarkan MUNCUL ALAMI dari isi - JANGAN dipaksa seimbang.

SCHEMA JSON OUTPUT (wajib diikuti):
${JSON_SCHEMA}

${reasoning}

${FEW_SHOT_EXAMPLES}

${demoBlock}
${retryBlock}

TEKS INPUT YANG HARUS DIPETAKAN (${len} karakter):
"""
${text.trim()}
"""

Balas HANYA dengan JSON valid sesuai schema, mengikuti struktur teks apa adanya. Tanpa markdown fence, tanpa penjelasan.`;

  return { system: SYSTEM_PROMPT, user };
}

export default { buildPrompt };
