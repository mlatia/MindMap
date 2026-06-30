/**
 * eval-layout.js - Pengujian Visualisasi / Komparatif Layout (desain Levy).
 *
 * Korpus: 5 domain x 3 panjang token (250 short / 1000 medium / 3000 long) = 15 teks.
 * Untuk tiap teks: JSON tree (dari LLM/sim) di-render dengan Reingold-Tilford
 * radial DAN Force-Directed radial (headless, identik logika klien), lalu diukur
 * 5 metrik aesthetics (Purchase 2002; Mooney dkk. 2024):
 *   NOR  Node Overlap Rate            (kecil lebih baik)
 *   ECN  Edge Crossing Number         (kecil lebih baik)
 *   LC   Layout Compactness           (besar lebih baik)
 *   WKL  Waktu Komputasi Layout (ms)  (kecil lebih baik)
 *   ELV  Edge Length Variance (CoV)   (kecil lebih baik)
 *
 * Analisis (sesuai arahan):
 *   A. Pengaruh PANJANG INPUT terhadap kualitas visualisasi (short->medium->long).
 *   B. Perbandingan Reingold-Tilford vs Force-Directed per kategori panjang.
 *   C. Pengaruh DOMAIN (opsional).
 *
 * Provider: sim (offline reproducible) | groq | openai | anthropic | mock.
 *   - Untuk angka FINAL TA, jalankan dengan LLM_PROVIDER=groq (lihat README).
 *
 * Output: tabel terminal + results/layout.csv + results/layout-report.json + fixtures.
 *
 * Cara pakai:
 *   LLM_PROVIDER=sim node scripts/eval-layout.js
 *   LLM_PROVIDER=groq GEN=1 node scripts/eval-layout.js   # regenerate via Groq
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
if (!process.env.LLM_PROVIDER || process.env.LLM_PROVIDER === 'mock') process.env.LLM_PROVIDER = 'sim';
const PROVIDER = process.env.LLM_PROVIDER;

const { buildPrompt }     = await import('../src/mindmap/autoCoT.js');
const { generateMindMap } = await import('../src/mindmap/llmClient.js');
const { simulateMindMap } = await import('./stochastic-llm.js');
const { validate }        = await import('../src/mindmap/validation.js');
const { reingoldTilfordRadial, forceDirectedRadial } = await import('./headless-layouts.js');
const { clusterRadial } = await import('./cluster-layout.js');
const { computeMetrics }  = await import('./layout-metrics.js');
const { layoutCorpus }    = await import('./corpus.js');

const c = { reset:'\x1b[0m', bold:'\x1b[1m', dim:'\x1b[2m', green:'\x1b[32m', yellow:'\x1b[33m', red:'\x1b[31m', cyan:'\x1b[36m' };
const TEXTS = layoutCorpus();
const FIXTURE_DIR = join(__dirname, 'results', 'fixtures');
const METRICS = ['NOR', 'ECN', 'LC', 'WKL', 'ELV'];
const BETTER  = { NOR:'min', ECN:'min', LC:'max', WKL:'min', ELV:'min' };

async function genTree(item, seed) {
  const fp = join(FIXTURE_DIR, `${item.id}.json`);
  if (!process.env.GEN && existsSync(fp)) return JSON.parse(readFileSync(fp, 'utf8'));
  let tree;
  if (PROVIDER === 'sim') tree = simulateMindMap(item.text, seed);
  else {
    let lastErr = null;
    for (let a = 1; a <= 3; a += 1) {
      try { tree = await generateMindMap(buildPrompt(item.text, { previousError: lastErr }), item.text); validate(tree, item.text); break; }
      catch (e) { lastErr = e.message; if (a === 3) throw new Error(`gagal generate ${item.id}: ${lastErr}`); }
    }
  }
  if (!existsSync(FIXTURE_DIR)) mkdirSync(FIXTURE_DIR, { recursive: true });
  writeFileSync(fp, JSON.stringify(tree, null, 2));
  return tree;
}

const mean = (a) => a.reduce((s, v) => s + v, 0) / (a.length || 1);
const sd   = (a) => { const m = mean(a); return Math.sqrt(mean(a.map(v => (v - m) ** 2))); };

async function main() {
  console.log(`\n${c.bold}== Pengujian Visualisasi / Komparatif Layout (desain Levy) ==${c.reset}`);
  console.log(`${c.dim}provider:${c.reset} ${PROVIDER}  ${c.dim}fixtures:${c.reset} ${TEXTS.length} (5 domain x 3 panjang)`);
  if (PROVIDER === 'sim') console.log(`${c.dim}  (simulator offline; untuk angka final TA jalankan dengan LLM_PROVIDER=groq GEN=1)${c.reset}`);

  const obs = [];
  let seed = 1;
  for (const item of TEXTS) {
    process.stdout.write(`${c.dim}${item.id} ${item.lenCat}(${item.tokens}tok)...${c.reset} `);
    let tree;
    try { tree = await genTree(item, seed++); } catch (e) { console.log(`${c.red}skip (${e.message})${c.reset}`); continue; }
    const rt = reingoldTilfordRadial(tree), fd = forceDirectedRadial(tree), cl = clusterRadial(tree);
    const mRT = computeMetrics(rt.positions, rt.edges, rt.durationMs);
    const mFD = computeMetrics(fd.positions, fd.edges, fd.durationMs);
    const mCL = computeMetrics(cl.positions, cl.edges, cl.durationMs);
    const nodes = rt.positions.size;
    obs.push({ id: item.id, domain: item.domain, len: item.lenCat, tokens: item.tokens, nodes, rt: mRT, fd: mFD, cl: mCL });
    console.log(`${c.green}OK${c.reset} nodes=${nodes} RT-NOR=${mRT.NOR.toFixed(3)} FD-NOR=${mFD.NOR.toFixed(3)} RT-ECN=${mRT.ECN} FD-ECN=${mFD.ECN}`);
  }

  // ---- A. Rata-rata metrik per kategori panjang (RT / FD / CL) ----
  console.log(`\n${c.bold}== A. Rata-rata Metrik per Kategori Panjang (RT, FD, CL) ==${c.reset}`);
  const cats = ['short', 'medium', 'long'];
  const algos = [['RT','rt'],['FD','fd'],['CL','cl']];
  const fmt = (v,m) => v.toFixed(m === 'ECN' || m === 'WKL' ? 1 : 3);
  const rowsA = [];
  for (const cat of cats) {
    const sub = obs.filter(o => o.len === cat);
    for (const [name,key] of algos) {
      const row = { Panjang: cat, Algoritma: name };
      for (const m of METRICS) row[m] = fmt(mean(sub.map(o => o[key][m])), m);
      rowsA.push(row);
    }
  }
  console.table(rowsA);

  // ---- B. RT vs FD per kategori panjang (pemenang per metrik) ----
  console.log(`\n${c.bold}== B. Reingold-Tilford vs Force-Directed per Kategori Panjang ==${c.reset}`);
  const rowsB = [];
  for (const cat of cats) {
    const sub = obs.filter(o => o.len === cat);
    for (const m of METRICS) {
      const rtM = mean(sub.map(o => o.rt[m])), fdM = mean(sub.map(o => o.fd[m]));
      const better = BETTER[m] === 'min' ? (rtM < fdM ? 'RT' : 'FD') : (rtM > fdM ? 'RT' : 'FD');
      rowsB.push({ Panjang: cat, Metrik: m, RT: rtM.toFixed(3), FD: fdM.toFixed(3), 'Lebih baik': better });
    }
  }
  console.table(rowsB);

  // ---- C. Pengaruh domain (mean NOR/ECN per domain) ----
  console.log(`\n${c.bold}== C. Pengaruh Domain (rata-rata lintas panjang) ==${c.reset}`);
  const domains = [...new Set(obs.map(o => o.domain))];
  console.table(domains.map(d => {
    const sub = obs.filter(o => o.domain === d);
    return { Domain: d, 'RT NOR': mean(sub.map(o => o.rt.NOR)).toFixed(3), 'FD NOR': mean(sub.map(o => o.fd.NOR)).toFixed(3),
             'RT ECN': mean(sub.map(o => o.rt.ECN)).toFixed(1), 'FD ECN': mean(sub.map(o => o.fd.ECN)).toFixed(1) };
  }));

  // ---- Output files ----
  const outDir = join(__dirname, 'results');
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const csv = ['id,domain,len,tokens,nodes,algo,NOR,ECN,LC,WKL,ELV',
    ...obs.flatMap(o => [
      `${o.id},"${o.domain}",${o.len},${o.tokens},${o.nodes},RT,${o.rt.NOR.toFixed(4)},${o.rt.ECN},${o.rt.LC.toFixed(4)},${o.rt.WKL},${o.rt.ELV.toFixed(4)}`,
      `${o.id},"${o.domain}",${o.len},${o.tokens},${o.nodes},FD,${o.fd.NOR.toFixed(4)},${o.fd.ECN},${o.fd.LC.toFixed(4)},${o.fd.WKL},${o.fd.ELV.toFixed(4)}`,
      `${o.id},"${o.domain}",${o.len},${o.tokens},${o.nodes},CL,${o.cl.NOR.toFixed(4)},${o.cl.ECN},${o.cl.LC.toFixed(4)},${o.cl.WKL},${o.cl.ELV.toFixed(4)}`,
    ])].join('\n');
  writeFileSync(join(outDir, 'layout.csv'), csv);
  writeFileSync(join(outDir, 'layout-report.json'), JSON.stringify({
    generatedAt: new Date().toISOString(), provider: PROVIDER,
    metricRef: 'Purchase (2002); Mooney dkk. (2024)', better: BETTER,
    analysisA: rowsA, analysisB: rowsB, observations: obs,
  }, null, 2));
  console.log(`\n${c.dim}CSV:${c.reset} ${join(outDir,'layout.csv')}`);
  console.log(`${c.dim}Report JSON:${c.reset} ${join(outDir,'layout-report.json')}\n`);
}
main().catch(e => { console.error('Fatal:', e); process.exit(1); });
