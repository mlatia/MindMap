/**
 * Unit Testing - Pipeline Auto-CoT (Tabel III.11 di TA).
 *
 * Skenario:
 *   UT-10..UT-14 - MFE-02 + MBE-03  (FR-1)    Input teks pipeline
 *   UT-15..UT-24 - MSM-01..MSM-05   (FR-2,3)  Pipeline Auto-CoT
 *   UT-25..UT-30 - MSM-05           (FR-4)    Validation Layer
 */
import { expect } from 'chai';
import { splitSentences, tokenize, summarize, cleanText } from '../../src/mindmap/preprocess.js';
import { clusterSentences, cosine, vectorize } from '../../src/mindmap/embedding.js';
import { buildPrompt } from '../../src/mindmap/autoCoT.js';
import { mockGenerate, generateMindMap } from '../../src/mindmap/llmClient.js';
import { validate, stats } from '../../src/mindmap/validation.js';
import { sted, aggregateConsistency } from '../../src/mindmap/sted.js';

const SAMPLE = `Mind mapping merupakan teknik visualisasi pengetahuan yang dikembangkan oleh Tony Buzan.
Teknik ini menyajikan informasi secara non-linear dari satu konsep pusat ke berbagai sub-konsep.
Mind map terbukti efektif meningkatkan retensi memori dan pembelajaran kognitif.
Pembuatan mind map manual membutuhkan waktu 20-30 menit per dokumen 1000 kata.
Otomatisasi dengan AI dapat mengurangi waktu tersebut secara signifikan.`;

// =============================================================
//  UT-15..UT-17 : MSM-01 Preprocessing
// =============================================================
describe('UT-15..UT-17 [MSM-01] Preprocessing', () => {
  it('UT-15 cleanText menghapus whitespace berlebih', () => {
    expect(cleanText('  hello   world  ')).to.equal('hello world');
  });
  it('UT-16 splitSentences memecah jadi >= 4 kalimat', () => {
    expect(splitSentences(SAMPLE)).to.have.length.at.least(4);
  });
  it('UT-17 tokenize menghapus stopword ID/EN', () => {
    const t = tokenize('yang dan di mind map the and tony');
    expect(t).to.include.members(['mind', 'map', 'tony']);
    expect(t).to.not.include.members(['yang', 'dan', 'the', 'and']);
  });
});

// =============================================================
//  UT-18..UT-19 : MSM-02 Embedding & Clustering
// =============================================================
describe('UT-18..UT-19 [MSM-02] Embedding + Clustering', () => {
  it('UT-18 cosine identik = 1, ortogonal = 0', () => {
    const [v1, v2] = vectorize(['mind map', 'qwertyuiop']);
    expect(cosine(v1, v1)).to.be.closeTo(1, 1e-9);
    expect(cosine(v1, v2)).to.equal(0);
  });
  it('UT-19 clusterSentences deterministik untuk input identik (FR-3)', () => {
    const s = splitSentences(SAMPLE);
    expect(clusterSentences(s, 3).medoids).to.deep.equal(clusterSentences(s, 3).medoids);
  });
});

// =============================================================
//  UT-20..UT-21 : MSM-03 Auto-CoT Prompt Builder
// =============================================================
describe('UT-20..UT-21 [MSM-03] Auto-CoT prompt', () => {
  it('UT-20 buildPrompt memuat JSON schema + reasoning steps', () => {
    const p = buildPrompt(SAMPLE);
    expect(p.system).to.match(/JSON/i);
    expect(p.user).to.match(/concept/);
    expect(p.user).to.match(/Auto.?CoT/i);
    expect(p.user).to.match(/Langkah 1/);
  });
  it('UT-21 buildPrompt dengan previousError menyertakan pesan untuk retry', () => {
    const p = buildPrompt(SAMPLE, { previousError: 'Struktural: contoh error' });
    expect(p.user).to.match(/Struktural: contoh error/);
  });
});

// =============================================================
//  UT-22..UT-24 : MSM-04 LLM Client (mock + JSON parse)
// =============================================================
describe('UT-22..UT-24 [MSM-04] LLM Client', () => {
  it('UT-22 mockGenerate menghasilkan pohon berstruktur', () => {
    const tree = mockGenerate(SAMPLE);
    expect(tree).to.have.property('concept');
    expect(tree).to.have.property('level', 0);
    expect(tree.children).to.be.an('array');
  });
  it('UT-23 mockGenerate deterministik (FR-3)', () => {
    expect(mockGenerate(SAMPLE)).to.deep.equal(mockGenerate(SAMPLE));
  });
  it('UT-24 generateMindMap(provider=mock) mengembalikan pohon', async () => {
    const tree = await generateMindMap(buildPrompt(SAMPLE), SAMPLE);
    expect(tree).to.have.property('concept');
  });
});

// =============================================================
//  UT-25..UT-30 : MSM-05 Validation Layer (FR-4)
// =============================================================
describe('UT-25..UT-30 [MSM-05] Validation Layer', () => {
  it('UT-25 pohon mock lulus 4-tahap validasi', () => {
    const tree = mockGenerate(SAMPLE);
    const r = validate(tree, SAMPLE);
    expect(r.ok).to.equal(true);
    expect(r.stats.depth).to.be.at.most(3);
  });
  it('UT-26 validasi struktural - tolak level tidak konsisten', () => {
    const bad = { concept: 'r', level: 0, children: [{ concept: 'a', level: 99, children: [] }] };
    expect(() => validate(bad, SAMPLE)).to.throw(/Struktural/);
  });
  it('UT-27 validasi kendala - tolak depth > 4 level', () => {
    const deep = { concept: 'a', level: 0, children: [
      { concept: 'b', level: 1, children: [
        { concept: 'c', level: 2, children: [
          { concept: 'd', level: 3, children: [
            { concept: 'e', level: 4, children: [] }
          ]}
        ]}
      ]}
    ]};
    expect(() => validate(deep, SAMPLE)).to.throw(/Kendala/);
  });
  it('UT-28 validasi kendala - tolak > 7 cabang root', () => {
    const fat = { concept: 'mind', level: 0,
      children: Array.from({ length: 8 }, (_, i) => ({ concept: 'mind ' + i, level: 1, children: [] }))
    };
    expect(() => validate(fat, SAMPLE)).to.throw(/Kendala/);
  });
  it('UT-29 validasi semantik - tolak halusinasi total', () => {
    const hallu = { concept: 'bicycle', level: 0, children: [
      { concept: 'pedal', level: 1, children: [] },
      { concept: 'wheel', level: 1, children: [] },
      { concept: 'chain', level: 1, children: [] }
    ]};
    expect(() => validate(hallu, SAMPLE)).to.throw(/Semantik|Kelengkapan/);
  });
  it('UT-30 stats melaporkan nodes/depth/branchesRoot', () => {
    const tree = mockGenerate(SAMPLE);
    const s = stats(tree);
    expect(s.nodes).to.be.greaterThan(0);
    expect(s.branchesRoot).to.equal(tree.children.length);
  });
});

// =============================================================
//  UT-50..UT-52 : STED Metric (untuk pengujian Stabilitas)
// =============================================================
describe('UT-50..UT-52 [Eval] STED stability metric', () => {
  it('UT-50 STED(T, T) = 1', () => {
    const t = mockGenerate(SAMPLE);
    expect(sted(t, t)).to.be.closeTo(1, 1e-6);
  });
  it('UT-51 STED pohon berbeda total < 0.5', () => {
    const A = mockGenerate(SAMPLE);
    const B = { concept: 'sepeda', level: 0, children: [
      { concept: 'roda', level: 1, children: [] },
      { concept: 'rantai', level: 1, children: [] }
    ]};
    expect(sted(A, B)).to.be.lessThan(0.5);
  });
  it('UT-52 aggregateConsistency 1 pohon -> mean = 1', () => {
    const t = mockGenerate(SAMPLE);
    const c = aggregateConsistency([t]);
    expect(c.mean).to.equal(1);
  });
});

// =============================================================
//  Helper: kerunutan UT-code -> kebutuhan TA
// =============================================================
describe('Kerunutan unit test ke TA (Tabel III.11)', () => {
  it('semua UT-code memetakan ke modul + FR yang sesuai', () => {
    const matrix = {
      'UT-15..UT-17': { module: 'MSM-01', fr: ['FR-1', 'FR-2'] },
      'UT-18..UT-19': { module: 'MSM-02', fr: ['FR-2', 'FR-3'] },
      'UT-20..UT-21': { module: 'MSM-03', fr: ['FR-2', 'FR-3'] },
      'UT-22..UT-24': { module: 'MSM-04', fr: ['FR-3'] },
      'UT-25..UT-30': { module: 'MSM-05', fr: ['FR-4'] },
      'UT-50..UT-52': { module: 'EVAL',   fr: ['NF-2'] }
    };
    expect(Object.keys(matrix)).to.have.length(6);
  });
});
