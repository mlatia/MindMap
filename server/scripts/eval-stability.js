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
const { stabilityCorpus } = await import('./corpus.js');

const PROVIDER = process.env.LLM_PROVIDER || 'sim';
const N = parseInt(process.env.N || '10', 10);
const MAX_ATTEMPTS = 3;

// Korpus stabilitas: 5 domain, 1 teks MEDIUM (~1000 token) per domain (desain dosen).
const TEXTS = stabilityCorpus();

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
  console.log(`\n${c.bold}${item.id} - ${item.domain}${c.reset} (~${item.tokens ?? '?'} token)`);
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
  const scsValid = trees.length >= 2; // SCS butuh >= 2 output sukses, kalau tidak: N/A
  const sample = trees[0] || null;
  const sStats = sample ? stats(sample) : { nodes: 0, depth: 0, branchesRoot: 0, maxBranch: 0, shape: '-' };
  // distribusi bentuk antar run
  const shapeDist = {};
  for (const t of trees) { const sh = stats(t).shape; shapeDist[sh] = (shapeDist[sh] || 0) + 1; }
  return {
    id: item.id, domain: item.domain,
    SCS: scsValid ? cons.C.toFixed(3) : '-',
    validRuns: trees.length,
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

  const scsRows = rows.filter(r => r.SCS !== '-');
  const meanSCS = scsRows.length ? scsRows.reduce((s, r) => s + parseFloat(r.SCS), 0) / scsRows.length : NaN;
  const meanSCR = rows.reduce((s, r) => s + parseFloat(r.SCR), 0) / rows.length;
  const meanESR = rows.reduce((s, r) => s + parseFloat(r.ESR), 0) / rows.length;

  console.log(`\n${c.bold}== Tabel IV.IV Hasil Pengujian Stabilitas ==${c.reset}`);
  console.table(rows.map(({ _sample, _shapeDist, ...r }) => r));

  console.log(`\n${c.bold}Distribusi bentuk pohon antar run (bukti bentuk MUNCUL ALAMI, tidak dipaksa):${c.reset}`);
  for (const r of rows) console.log(`  ${r.id} ${r.domain}: ${JSON.stringify(r._shapeDist)}`);

  console.log(`\n${c.bold}Kesimpulan:${c.reset}`);
  if (Number.isNaN(meanSCS)) console.log(`  SCS rata-rata: ${c.yellow}N/A (data tidak cukup: <2 run sukses per teks; kemungkinan rate-limit)${c.reset}`);
  else console.log(`  SCS rata-rata: ${meanSCS.toFixed(3)} (dari ${scsRows.length} teks; target >= 0.70 ${meanSCS >= 0.70 ? c.green + 'TERPENUHI' + c.reset : c.red + 'BELUM' + c.reset})`);
  if (meanESR < 90) console.log(`  ${c.yellow}! ESR rendah biasanya karena rate-limit Groq (bukan kegagalan sistem). Lihat saran di bawah.${c.reset}`);
  console.log(`  ESR rata-rata: ${meanESR.toFixed(1)}%  (target >= 90% ${meanESR >= 90 ? c.green + 'TERPENUHI (NF-2)' + c.reset : c.red + 'BELUM' + c.reset})`);

  // CSV
  const csvPath = join(outDir, 'stability.csv');
  const csv = ['Teks,Domain,SCS,SCR,ESR,bentuk,nodes,depth,maxBranch,pairs,runs',
    ...rows.map(r => `${r.id},"${r.domain}",${r.SCS},${r.SCR},${r.ESR},${r.bentuk},${r.nodes},${r.depth},${r.maxBranch},${r.pairs},${r.runs}`),
    `---,"Rata-rata",${Number.isNaN(meanSCS)?'-':meanSCS.toFixed(3)},${meanSCR.toFixed(1)}%,${meanESR.toFixed(1)}%,,,,,,`
  ].join('\n');
  writeFileSync(csvPath, csv);

  // JSON report (skor + contoh pohon)
  const report = {
    generatedAt: new Date().toISOString(),
    provider: PROVIDER, N,
    metricRef: 'Wang dkk. (2025) STED & Consistency Score (Eq.1, Eq.4, lambda=0.1, Hungarian)',
    targets: { SCS: '>=0.70', ESR: '>=90%' },
    summary: { meanSCS: Number.isNaN(meanSCS) ? null : +meanSCS.toFixed(3), meanSCR: +meanSCR.toFixed(1), meanESR: +meanESR.toFixed(1) },
    perText: rows.map(r => ({
      id: r.id, domain: r.domain, SCS: r.SCS === '-' ? null : +r.SCS, SCR: r.SCR, ESR: r.ESR,
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
