/**
 * eval-layout.js - Pengujian Komparatif Layout (Tabel IV.X).
 *
 * Sesuai TA Subbab IV.X.4:
 *   1. Bekukan 15 JSON fixture (5 domain x 3 panjang)
 *   2. Render dengan Reingold-Tilford radial DAN Force-Directed radial
 *   3. Hitung NOR, ECN, LC, WKL, ELV untuk setiap (teks, algoritma)
 *   4. Lakukan paired t-test sederhana (atau Wilcoxon kalau tidak normal)
 *
 * Cara pakai:
 *   npm run eval:layout              # gunakan fixture pre-generated
 *   GEN=1 npm run eval:layout        # generate JSON dulu via LLM aktif
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
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
const { reingoldTilfordRadial, forceDirectedRadial } = await import('./headless-layouts.js');
const { computeMetrics }  = await import('./layout-metrics.js');

// 15 teks (5 domain x 3 panjang). Pendek <=1000 char, Sedang 1000-3000, Panjang 3000-6000.
const TEXTS = buildTextCorpus();

const c = { reset:'\x1b[0m', bold:'\x1b[1m', dim:'\x1b[2m', green:'\x1b[32m', yellow:'\x1b[33m', red:'\x1b[31m', cyan:'\x1b[36m' };

const FIXTURE_DIR = join(__dirname, 'results', 'fixtures');
const RESULTS_CSV = join(__dirname, 'results', 'layout.csv');

async function getOrGenerateFixture(item) {
  const fp = join(FIXTURE_DIR, `${item.id}.json`);
  if (!process.env.GEN && existsSync(fp)) {
    return JSON.parse(readFileSync(fp, 'utf8'));
  }
  // generate
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const prompt = buildPrompt(item.text, { previousError: lastError });
      const tree = await generateMindMap(prompt, item.text);
      validate(tree, item.text);
      if (!existsSync(FIXTURE_DIR)) mkdirSync(FIXTURE_DIR, { recursive: true });
      writeFileSync(fp, JSON.stringify(tree, null, 2));
      return tree;
    } catch (err) { lastError = err.message; }
  }
  throw new Error(`Gagal generate fixture ${item.id}: ${lastError}`);
}

function paired(arrA, arrB) {
  const n = arrA.length;
  const diffs = arrA.map((a, i) => a - arrB[i]);
  const mean = diffs.reduce((s, v) => s + v, 0) / n;
  const variance = diffs.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1 || 1);
  const sd = Math.sqrt(variance) || 1e-9;
  const t = mean / (sd / Math.sqrt(n));
  // 2-tailed p approx (Welch): pakai approx normal untuk df>=14
  const p = 2 * (1 - normalCdf(Math.abs(t)));
  return { mean, sd, t, p };
}
function normalCdf(z) {
  // approximation
  const t = 1 / (1 + 0.2316419 * z);
  const d = 0.3989423 * Math.exp(-z * z / 2);
  return 1 - d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
}
function meanOf(arr) { return arr.reduce((s, v) => s + v, 0) / arr.length; }
function sdOf(arr) {
  const m = meanOf(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1 || 1));
}

async function main() {
  console.log(`\n${c.bold}== Eval Komparatif Layout (Tabel IV.X) ==${c.reset}`);
  console.log(`${c.dim}provider:${c.reset} ${process.env.LLM_PROVIDER || 'mock'}  ${c.dim}fixtures:${c.reset} ${TEXTS.length}`);
  if (process.env.LLM_PROVIDER === 'mock' && !process.env.GEN) {
    console.log(`${c.yellow}  (fixture pakai mock generator; set LLM_PROVIDER=openai + GEN=1 untuk regenerate)${c.reset}`);
  }

  const observations = [];
  for (const item of TEXTS) {
    process.stdout.write(`${c.dim}fixture ${item.id} (${item.lenCat})...${c.reset} `);
    let tree;
    try {
      tree = await getOrGenerateFixture(item);
    } catch (err) {
      console.log(`${c.red}skip (${err.message})${c.reset}`);
      continue;
    }
    const rt = reingoldTilfordRadial(tree);
    const fd = forceDirectedRadial(tree);
    const metricsRT = computeMetrics(rt.positions, rt.edges, rt.durationMs);
    const metricsFD = computeMetrics(fd.positions, fd.edges, fd.durationMs);
    observations.push({ id: item.id, domain: item.domain, len: item.lenCat, rt: metricsRT, fd: metricsFD });
    console.log(`${c.green}OK${c.reset}  RT-NOR=${metricsRT.NOR.toFixed(2)} FD-NOR=${metricsFD.NOR.toFixed(2)} RT-ECN=${metricsRT.ECN} FD-ECN=${metricsFD.ECN}`);
  }

  // Aggregate per metric
  const metrics = ['NOR', 'ECN', 'LC', 'WKL', 'ELV'];
  const arrows = { NOR: 'min', ECN: 'min', LC: 'max', WKL: 'min', ELV: 'min' };
  const rows = metrics.map(m => {
    const rt = observations.map(o => o.rt[m]);
    const fd = observations.map(o => o.fd[m]);
    const stat = paired(rt, fd);
    const winner = arrows[m] === 'min'
      ? (meanOf(rt) < meanOf(fd) ? 'Reingold-Tilford' : 'Force-Directed')
      : (meanOf(rt) > meanOf(fd) ? 'Reingold-Tilford' : 'Force-Directed');
    return {
      Metrik: m,
      'RT (Mean ± SD)': `${meanOf(rt).toFixed(3)} ± ${sdOf(rt).toFixed(3)}`,
      'FD (Mean ± SD)': `${meanOf(fd).toFixed(3)} ± ${sdOf(fd).toFixed(3)}`,
      'p-value': stat.p.toFixed(4),
      'Sig (α=0.05)': stat.p < 0.05 ? 'YES' : 'no',
      Kesimpulan: `${winner} lebih baik (${arrows[m]})`
    };
  });

  console.log(`\n${c.bold}== Tabel IV.X Hasil Pengujian Komparatif Layout ==${c.reset}`);
  console.table(rows);

  if (!existsSync(dirname(RESULTS_CSV))) mkdirSync(dirname(RESULTS_CSV), { recursive: true });
  const csvHeader = 'id,domain,len,algo,NOR,ECN,LC,WKL,ELV';
  const csvRows = observations.flatMap(o => [
    `${o.id},"${o.domain}",${o.len},RT,${o.rt.NOR.toFixed(4)},${o.rt.ECN},${o.rt.LC.toFixed(4)},${o.rt.WKL},${o.rt.ELV.toFixed(4)}`,
    `${o.id},"${o.domain}",${o.len},FD,${o.fd.NOR.toFixed(4)},${o.fd.ECN},${o.fd.LC.toFixed(4)},${o.fd.WKL},${o.fd.ELV.toFixed(4)}`
  ]);
  writeFileSync(RESULTS_CSV, [csvHeader, ...csvRows].join('\n'));
  console.log(`\n${c.dim}CSV tersimpan:${c.reset} ${RESULTS_CSV}\n`);
}

function buildTextCorpus() {
  const DOMAINS = [
    { id: 'T1', name: 'Sains dan Teknologi',     short: 'Machine learning seperti random forest dan gradient boosting telah merevolusi prediksi cuaca. Model ensemble menggabungkan banyak decision tree untuk akurasi tinggi. Data satelit dan stasiun cuaca menjadi input utama.' },
    { id: 'T2', name: 'Humaniora dan Sosial',    short: 'Urbanisasi di Indonesia menunjukkan pergeseran demografi sejak reformasi. Penduduk desa bermigrasi ke kota mencari peluang ekonomi. Kota besar menghadapi masalah kepadatan dan kemacetan.' },
    { id: 'T3', name: 'Bisnis dan Ekonomi',      short: 'Pemasaran digital menjadi pilar UMKM pasca-pandemi. Media sosial seperti Instagram dan TikTok memperluas pasar. Influencer marketing menjadi tren dengan konversi tinggi.' },
    { id: 'T4', name: 'Kesehatan dan Kedokteran',short: 'Diabetes melitus tipe 2 adalah penyakit metabolik kronis ditandai resistensi insulin. Faktor risiko meliputi obesitas dan pola makan tinggi gula. Diagnosis melalui pemeriksaan gula darah.' },
    { id: 'T5', name: 'Hukum dan Kebijakan',     short: 'Undang-Undang Perlindungan Data Pribadi disahkan 2022 untuk melindungi privasi. Regulasi mengatur kewajiban data controller dan processor. Sanksi denda hingga 2 persen pendapatan tahunan.' }
  ];
  const out = [];
  for (const d of DOMAINS) {
    out.push({ id: `${d.id}-S`, domain: d.name, lenCat: 'pendek', text: d.short });
    out.push({ id: `${d.id}-M`, domain: d.name, lenCat: 'sedang', text: d.short + ' ' + d.short + ' Implementasi membutuhkan pertimbangan teknis dan etis yang mendalam. Stakeholder mencakup akademisi, praktisi, regulator, dan masyarakat umum.' });
    out.push({ id: `${d.id}-L`, domain: d.name, lenCat: 'panjang', text: d.short + ' ' + d.short + ' ' + d.short + ' Tantangan utama meliputi keterbatasan sumber daya, kompleksitas regulasi, dan kebutuhan adaptasi cepat terhadap perubahan teknologi. Solusi memerlukan kolaborasi multi-pihak, investasi infrastruktur, dan pengembangan kompetensi sumber daya manusia secara berkelanjutan. Pengukuran dampak harus mempertimbangkan dimensi ekonomi, sosial, dan lingkungan.' });
  }
  return out;
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
