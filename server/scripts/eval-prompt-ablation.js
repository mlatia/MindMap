/**
 * eval-prompt-ablation.js - Pengujian Optimasi System Prompt (ablation A vs B).
 *
 * Membandingkan dua varian prompt pada modul MSM-03 (buildPrompt):
 *   - Varian A: forced-balance (target 3-4 level, 4-7 cabang).
 *   - Varian B: faithful-to-text (prompt aktual sistem, src/mindmap/autoCoT.js).
 *
 * Metrik (sumber angka Tabel "Hasil Ablation"):
 *   - ESR : % run menghasilkan JSON valid dalam <= 3 retry.
 *   - HR  : Hallucination Rate = rata-rata proporsi node yang TIDAK berakar
 *           pada teks sumber (semakin kecil semakin baik).
 *   - SCS : rata-rata pairwise STED antar N output (konsistensi, NF-2).
 *
 * PENTING: provider sim/mock MENGABAIKAN prompt (deterministik dari teks),
 * sehingga ablation hanya bermakna dengan LLM nyata. Untuk angka final TA:
 *   LLM_PROVIDER=groq GROQ_API_KEY=... npm run eval:prompt
 *
 * Output: tabel terminal + results/prompt-ablation.json
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '..', '.env');
if (existsSync(envPath)) for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*(#.*)?$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const PROVIDER = process.env.LLM_PROVIDER || 'mock';
const N = parseInt(process.env.N || '10', 10);
const MAX = 3;

const { buildPrompt }     = await import('../src/mindmap/autoCoT.js');   // Varian B
const { generateMindMap } = await import('../src/mindmap/llmClient.js');
const { validate, validateShape } = await import('../src/mindmap/validation.js');
const { aggregateConsistency } = await import('../src/mindmap/sted.js');
const { tokenize } = await import('../src/mindmap/preprocess.js');
const { stabilityCorpus } = await import('./corpus.js');

// ---- Varian A: forced-balance (rekonstruksi prompt lama) ----
function buildPromptOld(text, { previousError } = {}) {
  const system = `Anda asisten yang mengubah teks menjadi mind map hierarkis. Balas HANYA JSON valid.
ATURAN STRUKTURAL (WAJIB):
1. Bangun struktur KOMPREHENSIF dengan kedalaman 3-4 level. Teks panjang WAJIB 4 level penuh.
2. Cabang langsung dari root: 4-7 cabang (jangan kurang dari 4).
3. Tiap cabang level-1 sebaiknya punya 2-4 anak.
4. concept = frasa pendek 1-4 kata; level konsisten; hindari halusinasi & redundansi.`;
  const retry = previousError ? `\nPERBAIKI kegagalan sebelumnya: "${previousError}".` : '';
  const user = `TUGAS: Ekstrak mind map. JADIKAN KOMPREHENSIF DENGAN TARGET 3-4 LEVEL, struktur SEDALAM mungkin.
SCHEMA: {"concept","level","children"}${retry}
TEKS (${text.length} char):
"""${text.trim()}"""
Balas HANYA JSON valid.`;
  return { system, user };
}

// ---- HR: proporsi node tak berakar pada teks ----
function extractNumbers(s){const o=[];const m=String(s).match(/\d+(?:[.,]\d+)*/g);if(m)for(const g of m){o.push(g);const d=g.replace(/[.,]/g,'');if(d.length>=2)o.push(d);}return o;}
function rooted(concept, srcTokens, srcText){
  const t=tokenize(concept);
  if (t.some(x => srcTokens.has(x) || (x.length>=4 && srcText.toLowerCase().includes(x)))) return true;
  const src=srcText.replace(/[.,]/g,'');
  for (const n of extractNumbers(concept)) if (srcText.includes(n) || src.includes(n.replace(/[.,]/g,''))) return true;
  return false;
}
function hallucinationRate(tree, text){
  const st=new Set(tokenize(text)); let bad=0,tot=0;
  const vis=n=>{tot++;if(!rooted(n.concept,st,text))bad++;(n.children||[]).forEach(vis);};
  vis(tree); return tot?bad/tot:0;
}

async function genOnce(text, build, seedNote){
  let lastErr=null, lastTree=null;
  for(let a=1;a<=MAX;a++){
    try{ const tree=await generateMindMap(build(text,{previousError:lastErr}), text); lastTree=tree; validate(tree,text); return {tree,ok:true}; }
    catch(e){ lastErr=e.message; }
  }
  const shapeOk = lastTree && (()=>{try{return validateShape(lastTree)}catch{return false}})();
  return { tree: shapeOk?lastTree:null, ok: !!shapeOk };
}

async function evalVariant(text, build){
  let esrPass=0; const trees=[]; const hrs=[];
  for(let i=0;i<N;i++){
    const r=await genOnce(text, build, i);
    if(r.ok) esrPass++;
    if(r.tree){ trees.push(r.tree); hrs.push(hallucinationRate(r.tree, text)); }
  }
  const scs=aggregateConsistency(trees);
  return { ESR: esrPass/N, HR: hrs.length?hrs.reduce((s,v)=>s+v,0)/hrs.length:null, SCS: trees.length>1?scs.C:null };
}

async function main(){
  console.log(`\n== Pengujian Optimasi System Prompt (ablation A vs B) ==`);
  console.log(`provider: ${PROVIDER}  N: ${N} per teks`);
  if(PROVIDER==='sim'||PROVIDER==='mock') console.log(`! provider ${PROVIDER} MENGABAIKAN prompt -> A == B (tidak bermakna). Pakai LLM_PROVIDER=groq untuk hasil nyata.`);
  const rows=[]; const detail=[];
  for(const item of stabilityCorpus()){
    process.stdout.write(`  ${item.id} ${item.domain}... `);
    const A=await evalVariant(item.text, buildPromptOld);
    const B=await evalVariant(item.text, buildPrompt);
    console.log('done');
    detail.push({id:item.id,domain:item.domain,A,B});
  }
  const avg=(arr,sel)=>{const v=arr.map(sel).filter(x=>x!=null);return v.length?v.reduce((s,x)=>s+x,0)/v.length:null;};
  const pct=x=>x==null?'-':(x*100).toFixed(1)+'%'; const f3=x=>x==null?'-':x.toFixed(3);
  rows.push({Metrik:'ESR (rata-rata)', 'Varian A':pct(avg(detail,d=>d.A.ESR)), 'Varian B':pct(avg(detail,d=>d.B.ESR))});
  rows.push({Metrik:'HR (rata-rata, kecil=baik)', 'Varian A':f3(avg(detail,d=>d.A.HR)), 'Varian B':f3(avg(detail,d=>d.B.HR))});
  rows.push({Metrik:'SCS (rata-rata, NF-2)', 'Varian A':f3(avg(detail,d=>d.A.SCS)), 'Varian B':f3(avg(detail,d=>d.B.SCS))});
  console.log(`\n== Hasil Ablation (sumber angka Tabel Hasil Ablation A vs B) ==`);
  console.table(rows);
  const outDir=join(__dirname,'results'); if(!existsSync(outDir))mkdirSync(outDir,{recursive:true});
  writeFileSync(join(outDir,'prompt-ablation.json'), JSON.stringify({generatedAt:new Date().toISOString(),provider:PROVIDER,N,summary:rows,detail},null,2));
  console.log(`\nReport: ${join(outDir,'prompt-ablation.json')}\n`);
}
main().catch(e=>{console.error('Fatal:',e);process.exit(1);});
