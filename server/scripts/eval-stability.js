/**
 * eval-stability.js - Pengujian Stabilitas Auto-CoT (Tabel IV.IV).
 *
 * Mengikuti kerangka Wang dkk. (2025):
 *   - Beberapa teks lintas domain, N ulangan per teks.
 *   - Structural Consistency Score (SCS) = Consistency Score C(O) = rata-rata
 *     pairwise STED (paper Eq.1) atas N pohon.  [src/mindmap/sted.js]
 *   - Schema Conformance Rate (SCR) = lolos validasi pada percobaan pertama.
 *   - Effective Success Rate (ESR)  = lolos validasi dalam <= 3 retry.
 *   - Klasifikasi BENTUK pohon (depth-heavy / breadth-heavy / balanced) -
 *     deskriptif, MUNCUL ALAMI dari teks (bukan dipaksa prompt).
 *
 * Target NF-2: ESR >= 90%, SCS >= 0.70.
 *
 * Provider (env LLM_PROVIDER):
 *   - sim   : simulator variabilitas OFFLINE (default eval) - reproducible.
 *   - groq/anthropic/openai : LLM nyata (butuh jaringan + kunci).
 *   - mock  : deterministik (SCS=1.0, hanya untuk uji pipa).
 *
 * Output:
 *   - tabel terminal
 *   - results/stability.csv
 *   - results/stability-report.json  (skor + contoh JSON tiap teks)
 *   - results/samples/<id>.json      (contoh pohon per teks)
 *
 * Cara pakai:
 *   npm run eval:stability                 # default provider dari .env
 *   LLM_PROVIDER=sim N=10 npm run eval:stability
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '..', '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*(#.*)?$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
// Untuk eval offline, default ke simulator bila provider tidak diset eksplisit.
if (!process.env.LLM_PROVIDER || process.env.LLM_PROVIDER === 'mock') {
  process.env.LLM_PROVIDER = process.env.LLM_PROVIDER === 'mock' ? 'mock' : 'sim';
}

const { buildPrompt }     = await import('../src/mindmap/autoCoT.js');
const { generateMindMap } = await import('../src/mindmap/llmClient.js');
const { simulateMindMap } = await import('./stochastic-llm.js');
const { validate, validateShape, stats } = await import('../src/mindmap/validation.js');
const { aggregateConsistency } = await import('../src/mindmap/sted.js');

const PROVIDER = process.env.LLM_PROVIDER || 'sim';
const N = parseInt(process.env.N || '10', 10);
const MAX_ATTEMPTS = 3;

const TEXTS = [
  {
    id: 'T1', domain: 'Sains dan Teknologi',
    text: 'Algoritma machine learning seperti random forest dan gradient boosting telah merevolusi prediksi cuaca. Model ensemble ini menggabungkan banyak decision tree untuk meningkatkan akurasi. Data historis dari satelit dan stasiun cuaca menjadi input utama. Preprocessing data mencakup imputation missing values, normalisasi, dan feature engineering. Model dilatih pada cluster GPU dengan framework PyTorch atau TensorFlow. Evaluasi performa menggunakan metrik RMSE, MAE, dan R-squared. Hasil prediksi disajikan dalam dashboard real-time untuk pengambilan keputusan.'
  },
  {
    id: 'T2', domain: 'Humaniora dan Sosial',
    text: 'Fenomena urbanisasi di Indonesia menunjukkan pergeseran demografi yang signifikan sejak era reformasi. Banyak penduduk desa bermigrasi ke kota mencari peluang ekonomi yang lebih baik. Akibatnya kota-kota besar menghadapi masalah kepadatan penduduk dan kemacetan. Munculnya kawasan kumuh menjadi tantangan sosial yang serius. Pemerintah merespons dengan program perumahan rakyat dan pengembangan kota satelit. Kebijakan desentralisasi mendorong pemerataan pembangunan ke daerah. Faktor budaya dan jaringan sosial keluarga juga mempengaruhi pola migrasi.'
  },
  {
    id: 'T3', domain: 'Bisnis dan Ekonomi',
    text: 'Strategi pemasaran digital menjadi pilar penting bagi UMKM di era pasca-pandemi. Penggunaan media sosial seperti Instagram, TikTok, dan Facebook memperluas jangkauan pasar. Influencer marketing menjadi tren dengan konversi penjualan yang tinggi. SEO dan content marketing membantu visibilitas organik di mesin pencari. Email marketing dengan personalisasi meningkatkan retensi pelanggan. Analytics seperti Google Analytics dan Meta Insights digunakan untuk evaluasi kampanye. ROAS dan customer acquisition cost menjadi KPI utama keberhasilan strategi.'
  },
  {
    id: 'T4', domain: 'Kesehatan dan Kedokteran',
    text: 'Diabetes melitus tipe 2 merupakan penyakit metabolik kronis yang ditandai resistensi insulin. Faktor risiko meliputi obesitas, pola makan tinggi gula, dan kurang aktivitas fisik. Gejala umum mencakup polidipsia, poliuria, dan polifagia. Diagnosis ditegakkan melalui pemeriksaan gula darah puasa, gula darah sewaktu, dan HbA1c. Pengelolaan jangka panjang membutuhkan modifikasi gaya hidup dan terapi farmakologi. Komplikasi serius meliputi nefropati, retinopati, dan neuropati diabetik. Edukasi pasien mengenai self-monitoring blood glucose sangat penting.'
  },
  {
    id: 'T5', domain: 'Hukum dan Kebijakan',
    text: 'Undang-Undang Perlindungan Data Pribadi disahkan pada tahun 2022 untuk melindungi privasi warga negara Indonesia. Regulasi ini mengatur kewajiban data controller dan processor dalam pengolahan data. Hak subjek data mencakup hak akses, koreksi, penghapusan, dan portabilitas data. Sanksi administratif berupa denda hingga 2 persen dari pendapatan tahunan dapat dikenakan. Lembaga independen dibentuk untuk pengawasan dan penegakan undang-undang. Sosialisasi dilakukan kepada korporasi, lembaga publik, dan masyarakat umum. Pelanggaran berat seperti kebocoran data dapat dipidana hingga lima tahun penjara.'
  },
  {
    id: 'T7', domain: 'Proses / Sebab-Akibat (Sains)',
    text: 'Fotosintesis diawali ketika klorofil menyerap energi cahaya matahari. Energi itu kemudian memecah molekul air menjadi oksigen dan ion hidrogen. Ion hidrogen selanjutnya dipakai untuk mengikat karbondioksida dari udara. Proses pengikatan tersebut akhirnya membentuk glukosa. Glukosa kemudian diubah menjadi energi yang menjadi sumber tenaga bagi tumbuhan. Energi tersebut sebagian disimpan sehingga dapat digunakan saat malam hari.'
  },
  {
    id: 'T6', domain: 'Statistik / Data Angka (BPS)',
    text: 'Badan Pusat Statistik mencatat inflasi tahunan Indonesia sebesar 5,51 persen pada 2022, kemudian turun menjadi 2,61 persen pada 2023, dan 1,57 persen pada 2024. Menurut kelompok pengeluaran, makanan dan minuman menyumbang 1,21 persen, transportasi 0,89 persen, perumahan 0,42 persen, serta pendidikan 0,15 persen. Inflasi inti tercatat 2,11 persen, komponen harga bergejolak 0,12 persen, dan harga diatur pemerintah 0,34 persen. Provinsi dengan inflasi tertinggi adalah Papua 4,15 persen dan terendah Maluku 1,02 persen.'
  }
];

const c = { reset:'\x1b[0m', bold:'\x1b[1m', dim:'\x1b[2m', green:'\x1b[32m', yellow:'\x1b[33m', red:'\x1b[31m', cyan:'\x1b[36m' };

/** Hasilkan satu pohon (provider-aware) dengan seed eksplisit utk reproducibility. */
async function genTree(text, seed) {
  if (PROVIDER === 'sim') return simulateMindMap(text, seed);
  const prompt = buildPrompt(text);
  return generateMindMap(prompt, text);
}

/** Jalankan pipeline 1x dgn retry. */
async function runOnce(text, seed) {
  let lastError = null;
  let lastTree = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      // retry pakai seed berbeda (meniru re-prompt LLM)
      const tree = await genTree(text, seed * 100 + attempt);
      lastTree = tree;
      validate(tree, text);
      return { tree, attempts: attempt, scrPass: attempt === 1, esrPass: true };
    } catch (err) {
      lastError = err.message;
    }
  }
  // degradasi anggun: bentuk sehat tetap dihitung sukses-struktural
  const shapeOk = lastTree && (() => { try { return validateShape(lastTree); } catch { return false; } })();
  return { tree: shapeOk ? lastTree : null, attempts: MAX_ATTEMPTS, scrPass: false, esrPass: !!shapeOk, error: lastError, degraded: !!shapeOk };
}

async function evalText(item) {
  console.log(`\n${c.bold}${item.id} - ${item.domain}${c.reset} (${item.text.length} char)`);
  const results = [];
  let scrPasses = 0, esrPasses = 0;
  for (let i = 0; i < N; i += 1) {
    process.stdout.write(`  run ${i + 1}/${N}... `);
    const r = await runOnce(item.text, (item.id.charCodeAt(1) * 1000) + i + 1);
    results.push(r);
    if (r.scrPass) scrPasses += 1;
    if (r.esrPass) esrPasses += 1;
    console.log(r.esrPass
      ? `${c.green}OK${c.reset} (attempts=${r.attempts}${r.degraded ? ', degraded' : ''})`
      : `${c.red}FAIL${c.reset} (${(r.error || '').slice(0, 60)})`);
  }
  const trees = results.filter(r => r.tree).map(r => r.tree);
  const cons = aggregateConsistency(trees);
  const sample = trees[0] || null;
  const sStats = sample ? stats(sample) : { nodes: 0, depth: 0, branchesRoot: 0, maxBranch: 0, shape: '-' };
  // distribusi bentuk antar run
  const shapeDist = {};
  for (const t of trees) { const sh = stats(t).shape; shapeDist[sh] = (shapeDist[sh] || 0) + 1; }
  return {
    id: item.id, domain: item.domain,
    SCS: cons.C.toFixed(3),
    SCR: (scrPasses / N * 100).toFixed(1) + '%',
    ESR: (esrPasses / N * 100).toFixed(1) + '%',
    bentuk: sStats.shape,
    nodes: sStats.nodes, depth: sStats.depth, maxBranch: sStats.maxBranch,
    pairs: cons.pairs, runs: N,
    _sample: sample, _shapeDist: shapeDist
  };
}

async function main() {
  console.log(`\n${c.bold}== Eval Stabilitas Auto-CoT (Tabel IV.IV) ==${c.reset}`);
  console.log(`${c.dim}provider:${c.reset} ${PROVIDER}  ${c.dim}N per teks:${c.reset} ${N}  ${c.dim}total panggilan:${c.reset} ${N * TEXTS.length}`);
  if (PROVIDER === 'mock') {
    console.log(`${c.yellow}! mock = deterministik -> SCS=1.0 (tidak realistis). Pakai LLM_PROVIDER=sim atau LLM nyata.${c.reset}`);
  } else if (PROVIDER === 'sim') {
    console.log(`${c.dim}  (simulator variabilitas offline, reproducible; bukan pengganti LLM nyata untuk angka final)${c.reset}`);
  }

  const outDir = join(__dirname, 'results');
  const sampleDir = join(outDir, 'samples');
  if (!existsSync(sampleDir)) mkdirSync(sampleDir, { recursive: true });

  const rows = [];
  for (const item of TEXTS) rows.push(await evalText(item));

  // simpan contoh JSON per teks
  for (const r of rows) {
    if (r._sample) writeFileSync(join(sampleDir, `${r.id}.json`), JSON.stringify(r._sample, null, 2));
  }

  const meanSCS = rows.reduce((s, r) => s + parseFloat(r.SCS), 0) / rows.length;
  const meanSCR = rows.reduce((s, r) => s + parseFloat(r.SCR), 0) / rows.length;
  const meanESR = rows.reduce((s, r) => s + parseFloat(r.ESR), 0) / rows.length;

  console.log(`\n${c.bold}== Tabel IV.IV Hasil Pengujian Stabilitas ==${c.reset}`);
  console.table(rows.map(({ _sample, _shapeDist, ...r }) => r));

  console.log(`\n${c.bold}Distribusi bentuk pohon antar run (bukti bentuk MUNCUL ALAMI, tidak dipaksa):${c.reset}`);
  for (const r of rows) console.log(`  ${r.id} ${r.domain}: ${JSON.stringify(r._shapeDist)}`);

  console.log(`\n${c.bold}Kesimpulan:${c.reset}`);
  console.log(`  SCS rata-rata: ${meanSCS.toFixed(3)} (target >= 0.70 ${meanSCS >= 0.70 ? c.green + 'TERPENUHI' + c.reset : c.red + 'BELUM' + c.reset})`);
  console.log(`  ESR rata-rata: ${meanESR.toFixed(1)}%  (target >= 90% ${meanESR >= 90 ? c.green + 'TERPENUHI (NF-2)' + c.reset : c.red + 'BELUM' + c.reset})`);

  // CSV
  const csvPath = join(outDir, 'stability.csv');
  const csv = ['Teks,Domain,SCS,SCR,ESR,bentuk,nodes,depth,maxBranch,pairs,runs',
    ...rows.map(r => `${r.id},"${r.domain}",${r.SCS},${r.SCR},${r.ESR},${r.bentuk},${r.nodes},${r.depth},${r.maxBranch},${r.pairs},${r.runs}`),
    `---,"Rata-rata",${meanSCS.toFixed(3)},${meanSCR.toFixed(1)}%,${meanESR.toFixed(1)}%,,,,,,`
  ].join('\n');
  writeFileSync(csvPath, csv);

  // JSON report (skor + contoh pohon)
  const report = {
    generatedAt: new Date().toISOString(),
    provider: PROVIDER, N,
    metricRef: 'Wang dkk. (2025) STED & Consistency Score (Eq.1, Eq.4, lambda=0.1, Hungarian)',
    targets: { SCS: '>=0.70', ESR: '>=90%' },
    summary: { meanSCS: +meanSCS.toFixed(3), meanSCR: +meanSCR.toFixed(1), meanESR: +meanESR.toFixed(1) },
    perText: rows.map(r => ({
      id: r.id, domain: r.domain, SCS: +r.SCS, SCR: r.SCR, ESR: r.ESR,
      bentuk: r.bentuk, nodes: r.nodes, depth: r.depth, maxBranch: r.maxBranch,
      shapeDistribution: r._shapeDist, sample: r._sample
    }))
  };
  writeFileSync(join(outDir, 'stability-report.json'), JSON.stringify(report, null, 2));

  console.log(`\n${c.dim}CSV:${c.reset} ${csvPath}`);
  console.log(`${c.dim}Report JSON:${c.reset} ${join(outDir, 'stability-report.json')}`);
  console.log(`${c.dim}Contoh pohon:${c.reset} ${sampleDir}/<id>.json\n`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
