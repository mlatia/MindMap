/**
 * Integration Testing - Mind map pipeline (Tabel IV.II di TA)
 *
 *   IT-10..IT-12  MFE-02 + MBE-03 + MSM-01..05 (FR-1, FR-2) Input -> mindmap
 *   IT-13..IT-15  MSM-04 + MSM-05               (FR-3, FR-4) LLM + Validation
 *
 * Test memakai LLM_PROVIDER=mock supaya bisa jalan offline.
 */
import { expect } from 'chai';
import express from 'express';
import jwt from 'jsonwebtoken';
import http from 'node:http';
import mindmapRoutes from '../../src/routes/mindmap.routes.js';

const SECRET = process.env.JWT_SECRET || 'your-secret-key';
const SAMPLE_TEXT =
  'Mind mapping merupakan teknik visualisasi pengetahuan yang dikembangkan oleh Tony Buzan. ' +
  'Teknik ini menyajikan informasi non-linear dari konsep pusat ke sub-konsep. ' +
  'Mind map terbukti efektif meningkatkan retensi memori dan pembelajaran kognitif. ' +
  'Otomatisasi dengan AI dapat mengurangi waktu pembuatan.';

let server;
let baseUrl;

before(async () => {
  process.env.LLM_PROVIDER = 'mock';
  const app = express();
  app.use(express.json());
  app.use('/api/mindmap', mindmapRoutes);
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((r) => server.close(r)));

async function call(path, body, token) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body || {}),
  });
  let payload = {};
  try { payload = await res.json(); } catch (_) {}
  return { status: res.status, payload };
}

const token = () => jwt.sign({ id: 1 }, SECRET, { expiresIn: '1h' });

describe('IT-10..IT-15 [MBE-01 + MSM-*] /api/mindmap/generate', () => {
  it('IT-10 tolak request tanpa JWT (401)', async () => {
    const r = await call('/api/mindmap/generate', { text: SAMPLE_TEXT });
    expect(r.status).to.equal(401);
  });

  it('IT-11 tolak teks < 20 karakter (400)', async () => {
    const r = await call('/api/mindmap/generate', { text: 'pendek' }, token());
    expect(r.status).to.equal(400);
    expect(r.payload.message).to.match(/minimal 20/);
  });

  it('IT-12 sukses generate mind map untuk teks valid (200)', async () => {
    const r = await call('/api/mindmap/generate', { text: SAMPLE_TEXT }, token());
    expect(r.status).to.equal(200);
    expect(r.payload).to.have.property('mindmap');
    expect(r.payload.mindmap).to.have.property('concept');
    expect(r.payload.mindmap.children).to.be.an('array');
  });

  it('IT-13 meta menyertakan attempts, durationMs, stats, validation', async () => {
    const r = await call('/api/mindmap/generate', { text: SAMPLE_TEXT }, token());
    expect(r.payload.meta).to.have.property('attempts');
    expect(r.payload.meta).to.have.property('durationMs');
    expect(r.payload.meta).to.have.property('stats');
    expect(r.payload.meta.validation).to.equal('passed');
  });

  it('IT-14 output deterministik untuk input identik (FR-3)', async () => {
    const r1 = await call('/api/mindmap/generate', { text: SAMPLE_TEXT }, token());
    const r2 = await call('/api/mindmap/generate', { text: SAMPLE_TEXT }, token());
    expect(r1.payload.mindmap).to.deep.equal(r2.payload.mindmap);
  });

  it('IT-15 mindmap memenuhi constraint TA (depth<=3, branches<=7)', async () => {
    const r = await call('/api/mindmap/generate', { text: SAMPLE_TEXT }, token());
    expect(r.payload.meta.stats.depth).to.be.at.most(3);
    expect(r.payload.meta.stats.branchesRoot).to.be.at.most(7);
  });
});
