/**
 * mindmap.pipeline.test.js
 *
 * Verifikasi unit pipeline mind map otomatis sesuai TA Bab III:
 *   - FR-1 / FR-2 Auto-CoT mock generator
 *   - FR-3 determinisme output untuk input identik
 *   - FR-4 validation layer (struktural, kendala, semantik, kelengkapan)
 */
import { expect } from 'chai';
import { splitSentences, tokenize, summarize } from '../../src/mindmap/preprocess.js';
import { clusterSentences, cosine, vectorize } from '../../src/mindmap/embedding.js';
import { buildPrompt } from '../../src/mindmap/autoCoT.js';
import { mockGenerate, generateMindMap } from '../../src/mindmap/llmClient.js';
import { validate, stats } from '../../src/mindmap/validation.js';

const SAMPLE = `Mind mapping merupakan teknik visualisasi pengetahuan yang dikembangkan oleh Tony Buzan.
Teknik ini menyajikan informasi secara non-linear dari satu konsep pusat ke berbagai sub-konsep.
Mind map terbukti efektif meningkatkan retensi memori dan pembelajaran kognitif.
Pembuatan mind map manual membutuhkan waktu 20-30 menit per dokumen 1000 kata.
Otomatisasi dengan AI dapat mengurangi waktu tersebut secara signifikan.`;

describe('Preprocess (MSM-01)', () => {
  it('memecah teks menjadi >= 4 kalimat', () => {
    expect(splitSentences(SAMPLE)).to.have.length.at.least(4);
  });
  it('tokenize menghapus stopword bahasa Indonesia', () => {
    const t = tokenize('yang dan di mind map tony buzan');
    expect(t).to.include.members(['mind', 'map', 'tony', 'buzan']);
    expect(t).to.not.include('yang');
  });
  it('summarize melaporkan wordCount + sentences', () => {
    const s = summarize(SAMPLE);
    expect(s.wordCount).to.be.greaterThan(20);
    expect(s.sentences.length).to.be.greaterThan(0);
  });
});

describe('Embedding + Clustering (MSM-02/03)', () => {
  it('cosine vektor identik = 1', () => {
    const [v] = vectorize(['mind map mind map']);
    expect(cosine(v, v)).to.be.closeTo(1, 1e-9);
  });
  it('clusterSentences deterministik untuk input yang sama (FR-3)', () => {
    const s = splitSentences(SAMPLE);
    expect(clusterSentences(s, 3).medoids).to.deep.equal(clusterSentences(s, 3).medoids);
  });
});

describe('Auto-CoT prompt builder (MSM-03)', () => {
  it('memuat schema JSON + reasoning langkah-bertahap', () => {
    const p = buildPrompt(SAMPLE);
    expect(p.system).to.match(/JSON/i);
    expect(p.user).to.match(/concept/);
    expect(p.user).to.match(/Auto-CoT/i);
  });
  it('menyertakan informasi error sebelumnya untuk retry', () => {
    const p = buildPrompt(SAMPLE, { previousError: 'Struktural: invalid' });
    expect(p.user).to.match(/Struktural/);
  });
});

describe('mockGenerate (MSM-04) + Validation Layer (MSM-05)', () => {
  it('menghasilkan pohon yang lulus 4-tahap validasi', () => {
    const tree = mockGenerate(SAMPLE);
    const r = validate(tree, SAMPLE);
    expect(r.ok).to.equal(true);
    expect(r.stats.nodes).to.be.greaterThan(2);
    expect(r.stats.depth).to.be.at.most(3);
  });
  it('mockGenerate deterministik untuk input identik (FR-3)', () => {
    expect(mockGenerate(SAMPLE)).to.deep.equal(mockGenerate(SAMPLE));
  });
  it('validation menolak pohon yang melebihi 4 level', () => {
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
  it('validation menolak > 7 cabang root', () => {
    const fat = { concept: 'mind', level: 0,
      children: Array.from({ length: 8 }, (_, i) => ({ concept: 'mind ' + i, level: 1, children: [] }))
    };
    expect(() => validate(fat, SAMPLE)).to.throw(/Kendala/);
  });
  it('validation menolak level yang tidak konsisten (struktural)', () => {
    const bad = { concept: 'r', level: 0, children: [{ concept: 'a', level: 99, children: [] }] };
    expect(() => validate(bad, SAMPLE)).to.throw(/Struktural/);
  });
  it('validation menolak halusinasi (semantik + kelengkapan)', () => {
    const hallu = { concept: 'bicycle', level: 0, children: [
      { concept: 'pedal', level: 1, children: [] },
      { concept: 'wheel', level: 1, children: [] },
      { concept: 'chain', level: 1, children: [] }
    ]};
    expect(() => validate(hallu, SAMPLE)).to.throw(/Semantik|Kelengkapan/);
  });
});

describe('generateMindMap (provider=mock)', () => {
  it('mengembalikan pohon valid tanpa API key', async () => {
    const prompt = buildPrompt(SAMPLE);
    const tree = await generateMindMap(prompt, SAMPLE);
    expect(validate(tree, SAMPLE).ok).to.equal(true);
  });
});
