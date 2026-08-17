/**
 * AutoCoT_asli_referensi.js
 * =========================================================================
 * FILE PEMBELAJARAN (bukan bagian sistem). Tujuannya: menunjukkan Auto-CoT
 * ASLI (Zhang dkk., ICLR 2023 - "Automatic Chain-of-Thought Prompting in LLMs")
 * supaya jelas bedanya dengan ADAPTASI yang dipakai di tugas akhir ini.
 *
 * PERBEDAAN INTI (hafalkan untuk sidang):
 *
 *   AUTO-CoT ASLI                          ADAPTASI DI TA INI (autoCoT.js)
 *   ------------------------------------   ------------------------------------
 *   Input: DATASET banyak PERTANYAAN       Input: SATU TEKS yang mau dipetakan
 *   Embedding kalimat (mis. Sentence-BERT) TF-IDF lokal (tanpa model)
 *   Clustering k-means atas pertanyaan     k-medoids atas kalimat teks
 *   Pilih 1 pertanyaan wakil per cluster   Pilih 1 kalimat wakil per cluster
 *   >> Zero-Shot-CoT membuat RATIONALE <<  >> TIDAK ADA Zero-Shot-CoT <<
 *      ("Let's think step by step")           (contoh & reasoning STATIS)
 *   Demonstrasi = (pertanyaan + rationale  Demonstrasi = kalimat wakil saja,
 *      hasil buatan model)                    ditempel sebagai "panduan"
 *   Tujuan: few-shot CoT untuk MENJAWAB    Tujuan: ekstraksi struktur JSON
 *      soal penalaran                         mind map dari teks
 *
 * Jadi yang HILANG di adaptasi = tahap Zero-Shot-CoT (pembuatan rationale
 * otomatis) dan sumbernya DATASET. Yang DIPINJAM = ide "cluster lalu ambil
 * wakil".
 * ========================================================================= */

// ---------------------------------------------------------------------------
// 0) Anggap ada fungsi embedding & LLM. Di Auto-CoT asli embedding-nya model
//    neural (Sentence-BERT / MiniLM), BUKAN TF-IDF.
// ---------------------------------------------------------------------------
async function embedSentence(text) {
  // ASLI: panggil model embedding, mis. sentence-transformers 'all-MiniLM-L6-v2'
  //   return await miniLM.encode(text);  // -> vektor angka (mis. 384 dimensi)
  // (di sini hanya placeholder konsептual)
  throw new Error('sambungkan ke model embedding neural, mis. MiniLM/Sentence-BERT');
}

async function callLLM(prompt) {
  // panggilan ke LLM (OpenAI/Groq/dst). Mengembalikan teks jawaban.
  throw new Error('sambungkan ke API LLM');
}

// ---------------------------------------------------------------------------
// 1) QUESTION CLUSTERING
//    Kelompokkan SELURUH PERTANYAAN di dataset berdasar kemiripan embedding,
//    lalu pilih satu pertanyaan REPRESENTATIF tiap cluster (paling dekat
//    ke centroid + memenuhi heuristik kesederhanaan).
// ---------------------------------------------------------------------------
function kmeans(vectors, k, iters = 50) {
  // k-means klasik (ASLI pakai k-means; adaptasi TA pakai k-medoids)
  let centroids = vectors.slice(0, k).map(v => v.slice());
  let assign = new Array(vectors.length).fill(0);
  const dist2 = (a, b) => a.reduce((s, x, i) => s + (x - b[i]) ** 2, 0);
  for (let it = 0; it < iters; it++) {
    // assign
    for (let i = 0; i < vectors.length; i++) {
      let best = 0, bd = Infinity;
      for (let c = 0; c < k; c++) { const d = dist2(vectors[i], centroids[c]); if (d < bd) { bd = d; best = c; } }
      assign[i] = best;
    }
    // update centroid = rata-rata anggota
    const sums = Array.from({ length: k }, () => new Array(vectors[0].length).fill(0));
    const cnt = new Array(k).fill(0);
    vectors.forEach((v, i) => { v.forEach((x, d) => sums[assign[i]][d] += x); cnt[assign[i]]++; });
    centroids = sums.map((s, c) => cnt[c] ? s.map(x => x / cnt[c]) : centroids[c]);
  }
  return { assign, centroids };
}

async function questionClustering(questions, k) {
  const vectors = [];
  for (const q of questions) vectors.push(await embedSentence(q)); // embedding neural
  const { assign, centroids } = kmeans(vectors, k);
  // pilih 1 wakil per cluster: pertanyaan terdekat ke centroid-nya
  const reps = new Array(k).fill(null);
  const bestDist = new Array(k).fill(Infinity);
  const dist2 = (a, b) => a.reduce((s, x, i) => s + (x - b[i]) ** 2, 0);
  vectors.forEach((v, i) => {
    const c = assign[i];
    const d = dist2(v, centroids[c]);
    // Heuristik paper: utamakan pertanyaan yang tidak terlalu panjang
    const okLen = questions[i].split(/\s+/).length <= 60;
    if (okLen && d < bestDist[c]) { bestDist[c] = d; reps[c] = questions[i]; }
  });
  return reps.filter(Boolean);
}

// ---------------------------------------------------------------------------
// 2) DEMONSTRATION SAMPLING  (INI YANG TIDAK ADA DI ADAPTASI TA)
//    Untuk tiap pertanyaan wakil, jalankan ZERO-SHOT-CoT untuk MENGHASILKAN
//    rationale (rantai penalaran) SECARA OTOMATIS oleh model.
// ---------------------------------------------------------------------------
async function generateRationale(question) {
  // Kunci Auto-CoT asli: pemicu "Let's think step by step" (Kojima dkk. 2022)
  const zeroShotCoT = `Q: ${question}\nA: Let's think step by step.`;
  const rationale = await callLLM(zeroShotCoT); // model MENULIS penalarannya sendiri
  return { question, rationale }; // inilah "demonstrasi" yang dibuat otomatis
}

async function buildDemonstrationsAsli(questions, k = 8) {
  const reps = await questionClustering(questions, k);
  const demos = [];
  for (const q of reps) demos.push(await generateRationale(q)); // Zero-Shot-CoT tiap wakil
  return demos; // [{question, rationale}, ...] -> dibuat model, bukan hard-coded
}

// ---------------------------------------------------------------------------
// 3) INFERENCE
//    Rangkai demonstrasi (few-shot) + pertanyaan baru, lalu minta model
//    menjawab dengan pola berpikir yang sama.
// ---------------------------------------------------------------------------
function assemblePrompt(demos, testQuestion) {
  const shots = demos
    .map(d => `Q: ${d.question}\nA: ${d.rationale}`)
    .join('\n\n');
  return `${shots}\n\nQ: ${testQuestion}\nA: Let's think step by step.`;
}

async function autoCoTInfer(datasetQuestions, testQuestion, k = 8) {
  const demos = await buildDemonstrationsAsli(datasetQuestions, k); // sekali di awal
  const prompt = assemblePrompt(demos, testQuestion);
  return callLLM(prompt);
}

/* =========================================================================
 * RINGKASAN UNTUK DIUCAPKAN KE DOSEN:
 * "Auto-CoT asli butuh DATASET pertanyaan, meng-embed dengan model neural,
 *  meng-cluster, lalu untuk tiap wakil menjalankan Zero-Shot-CoT agar MODEL
 *  MEMBUAT contoh penalaran sendiri. Di tugas akhir saya, tidak ada dataset
 *  dan tidak ada Zero-Shot-CoT; saya hanya meminjam ide clustering untuk
 *  memilih kalimat representatif dari SATU teks input, sedangkan contoh dan
 *  instruksinya statis. Karena itu saya sebut ADAPTASI Auto-CoT."
 * ========================================================================= */
module.exports = { questionClustering, buildDemonstrationsAsli, assemblePrompt, autoCoTInfer };
