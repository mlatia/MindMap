/**
 * mindmap-demo.js - Jalankan pipeline Auto-CoT pada teks contoh,
 * lalu tampilkan JSON output + meta ke terminal.
 *
 * Cara pakai (dari folder server/):
 *   npm run mindmap:demo
 *   # atau pakai teks sendiri:
 *   node scripts/mindmap-demo.js "Teks bebasmu di sini..."
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// load .env manual
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '..', '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*(#.*)?$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const { buildPrompt }    = await import('../src/mindmap/autoCoT.js');
const { generateMindMap }= await import('../src/mindmap/llmClient.js');
const { validate, stats }= await import('../src/mindmap/validation.js');
const { summarize }      = await import('../src/mindmap/preprocess.js');

const DEFAULT_TEXT =
  'Mind mapping merupakan teknik visualisasi pengetahuan yang dikembangkan oleh Tony Buzan. ' +
  'Teknik ini menyajikan informasi secara non-linear dari satu konsep pusat ke berbagai sub-konsep. ' +
  'Mind map terbukti efektif meningkatkan retensi memori dan pembelajaran kognitif. ' +
  'Pembuatan mind map manual membutuhkan waktu 20-30 menit per dokumen 1000 kata. ' +
  'Otomatisasi dengan Large Language Model dapat mengurangi waktu tersebut secara signifikan ' +
  'melalui strategi prompt engineering seperti Auto-CoT.';

const c = { reset:'\x1b[0m', bold:'\x1b[1m', dim:'\x1b[2m', green:'\x1b[32m', red:'\x1b[31m', yellow:'\x1b[33m', cyan:'\x1b[36m', blue:'\x1b[34m', magenta:'\x1b[35m' };

const MAX_ATTEMPTS = 3;

/**
 * Print pohon mind map sebagai outline ASCII dengan warna per level.
 */
function printTree(node, indent = '', isLast = true) {
  const colors = [c.bold, c.yellow, c.blue, c.magenta, c.green];
  const color = colors[node.level] || c.reset;
  const branch = indent === '' ? '' : (isLast ? '+-- ' : '|-- ');
  console.log(`${c.dim}${indent}${c.reset}${branch}${color}[L${node.level}] ${node.concept}${c.reset}`);
  const children = node.children || [];
  const newIndent = indent + (isLast ? '    ' : '|   ');
  children.forEach((ch, i) => printTree(ch, newIndent, i === children.length - 1));
}

async function main() {
  const text = process.argv[2] || DEFAULT_TEXT;
  const provider = process.env.LLM_PROVIDER || 'mock';

  console.log(`\n${c.bold}== Pipeline Auto-CoT Mind Map Generator ==${c.reset}`);
  console.log(`${c.dim}provider:${c.reset} ${c.cyan}${provider}${c.reset}`);
  if (provider === 'openai') console.log(`${c.dim}model:${c.reset}    ${c.cyan}${process.env.LLM_MODEL || 'gpt-4o-mini'}${c.reset}`);
  if (provider === 'google') console.log(`${c.dim}model:${c.reset}    ${c.cyan}${process.env.LLM_MODEL || 'gemini-2.0-flash'}${c.reset}`);
  console.log(`\n${c.bold}TEKS INPUT (${text.length} char):${c.reset}\n${c.dim}${text}${c.reset}\n`);

  const startedAt = Date.now();
  let lastError = null;
  let attempt;
  let tree;
  let valResult;

  for (attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    console.log(`${c.dim}[attempt ${attempt}/${MAX_ATTEMPTS}]${c.reset} membangun prompt + memanggil LLM...`);
    const prompt = buildPrompt(text, { previousError: lastError });
    try {
      tree = await generateMindMap(prompt, text);
    } catch (err) {
      console.log(`  ${c.red}LLM error:${c.reset} ${err.message}`);
      lastError = err.message;
      continue;
    }
    try {
      valResult = validate(tree, text);
      console.log(`  ${c.green}+ validasi lulus${c.reset}`);
      break;
    } catch (err) {
      console.log(`  ${c.yellow}x validasi gagal:${c.reset} ${err.message}`);
      lastError = err.message;
      if (attempt === MAX_ATTEMPTS) {
        console.log(`\n${c.red}GAGAL setelah ${MAX_ATTEMPTS} percobaan.${c.reset}`);
        process.exit(1);
      }
    }
  }

  const durationMs = Date.now() - startedAt;

  console.log(`\n${c.bold}=== META ===${c.reset}`);
  console.table({
    provider,
    attempts: attempt,
    durationMs,
    nodes: valResult.stats.nodes,
    depth: valResult.stats.depth,
    branchesRoot: valResult.stats.branchesRoot,
    sourceChars: text.length,
    sourceSentences: summarize(text).sentences.length,
    validation: 'passed'
  });

  console.log(`\n${c.bold}=== STRUKTUR MIND MAP (outline) ===${c.reset}`);
  printTree(tree);

  console.log(`\n${c.bold}=== JSON OUTPUT ===${c.reset}`);
  console.log(JSON.stringify(tree, null, 2));
  console.log('');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
