/**
 * eval-stability.js - Pengujian Stabilitas Auto-CoT (Tabel IV.IV).
 *
 * Sesuai TA Subbab IV.X.3:
 *   - 5 teks (5 domain pengetahuan, panjang ~1500 char)
 *   - N=10 ulangan per teks => 50 panggilan LLM total
 *   - Hitung Structural Consistency Score (SCS) via STED Wang dkk. 2025
 *   - Schema Conformance Rate (SCR) = pass-on-first-try
 *   - Effective Success Rate (ESR)  = pass setelah max 3 retry
 *
 * Target NF-2: ESR >= 90%, SCS >= 0.70.
 *
 * Output: tabel terminal + CSV ke server/scripts/results/stability.csv
 *
 * Cara pakai:
 *   npm run eval:stability
 *   # default N=10 per teks; bisa override:
 *   N=3 npm run eval:stability        (untuk dry-run cepat)
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

const { buildPrompt }     = await import('../src/mindmap/autoCoT.js');
const { generateMindMap } = await import('../src/mindmap/llmClient.js');
const { validate }        = await import('../src/mindmap/validation.js');
const { aggregateConsistency } = await import('../src/mindmap/sted.js');

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
  }
];

const c = { reset:'\x1b[0m', bold:'\x1b[1m', dim:'\x1b[2m', green:'\x1b[32m', yellow:'\x1b[33m', red:'\x1b[31m', cyan:'\x1b[36m' };

/**
 * Jalankan pipeline 1x dengan retry. Return { tree, attempts, scrPass, esrPass, error? }
 */
async function runOnce(text) {
  let lastError = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const prompt = buildPrompt(text, { previousError: lastError });
      const tree = await generateMindMap(prompt, text);
      validate(tree, text);
      return { tree, attempts: attempt, scrPass: attempt === 1, esrPass: true };
    } catch (err) {
      lastError = err.message;
      if (attempt === MAX_ATTEMPTS) return { tree: null, attempts: attempt, scrPass: false, esrPass: false, error: err.message };
    }
  }
}

/**
 * Pengujian satu teks.
 */
async function evalText(item) {
  console.log(`\n${c.bold}${item.id} - ${item.domain}${c.reset} (${item.text.length} char)`);
  const results = [];
  let scrPasses = 0, esrPasses = 0;
  for (let i = 0; i < N; i += 1) {
    process.stdout.write(`  run ${i + 1}/${N}... `);
    const r = await runOnce(item.text);
    results.push(r);
    if (r.scrPass) scrPasses += 1;
    if (r.esrPass) esrPasses += 1;
    console.log(r.esrPass
      ? `${c.green}OK${c.reset} (attempts=${r.attempts})`
      : `${c.red}FAIL${c.reset} (${r.error?.slice(0, 60)})`);
  }
  const trees = results.filter(r => r.tree).map(r => r.tree);
  const cons = aggregateConsistency(trees);
  return {
    id: item.id,
    domain: item.domain,
    SCS: cons.scoreNormalized.toFixed(3),
    SCS_mean: cons.mean.toFixed(3),
    SCR: (scrPasses / N * 100).toFixed(1) + '%',
    ESR: (esrPasses / N * 100).toFixed(1) + '%',
    pairs: cons.pairs,
    runs: N
  };
}

async function main() {
  const provider = process.env.LLM_PROVIDER || 'mock';
  console.log(`\n${c.bold}== Eval Stabilitas Auto-CoT (Tabel IV.IV) ==${c.reset}`);
  console.log(`${c.dim}provider:${c.reset} ${provider}  ${c.dim}N per teks:${c.reset} ${N}  ${c.dim}total LLM call:${c.reset} ${N * TEXTS.length}`);

  if (provider === 'mock') {
    console.log(`\n${c.yellow}! Provider = mock = deterministik. SCS akan = 1.0 di semua teks (tidak realistis).${c.reset}`);
    console.log(`${c.yellow}  Untuk hasil yang valid untuk laporan TA, set LLM_PROVIDER=openai + OPENAI_API_KEY di .env.${c.reset}`);
  }

  const rows = [];
  for (const item of TEXTS) {
    rows.push(await evalText(item));
  }

  // mean row
  const meanSCS = rows.reduce((s, r) => s + parseFloat(r.SCS), 0) / rows.length;
  const meanSCR = rows.reduce((s, r) => s + parseFloat(r.SCR), 0) / rows.length;
  const meanESR = rows.reduce((s, r) => s + parseFloat(r.ESR), 0) / rows.length;
  rows.push({ id: '---', domain: 'Rata-rata', SCS: meanSCS.toFixed(3), SCS_mean: '', SCR: meanSCR.toFixed(1) + '%', ESR: meanESR.toFixed(1) + '%', pairs: '', runs: '' });

  console.log(`\n${c.bold}== Hasil Pengujian Stabilitas ==${c.reset}`);
  console.table(rows);

  console.log(`\n${c.bold}Kesimpulan:${c.reset}`);
  console.log(`  SCS rata-rata: ${meanSCS.toFixed(3)} (target >= 0.70 ${meanSCS >= 0.70 ? c.green + 'TERPENUHI' + c.reset : c.red + 'BELUM' + c.reset})`);
  console.log(`  ESR rata-rata: ${meanESR.toFixed(1)}%  (target >= 90% ${meanESR >= 90 ? c.green + 'TERPENUHI (NF-2)' + c.reset : c.red + 'BELUM' + c.reset})`);

  // CSV export
  const outDir = join(__dirname, 'results');
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const csvPath = join(outDir, 'stability.csv');
  const csv = ['Teks,Domain,SCS,SCS_mean,SCR,ESR,pairs,runs',
    ...rows.map(r => `${r.id},"${r.domain}",${r.SCS},${r.SCS_mean},${r.SCR},${r.ESR},${r.pairs},${r.runs}`)
  ].join('\n');
  writeFileSync(csvPath, csv);
  console.log(`\n${c.dim}CSV tersimpan:${c.reset} ${csvPath}\n`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
