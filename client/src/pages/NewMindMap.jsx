/**
 * NewMindMap.jsx - Halaman Input Teks (L-04).
 *
 * Mengirim teks ke endpoint /api/mindmap/generate, lalu menyimpan
 * hasilnya sebagai proyek baru dan mengarahkan user ke editor.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mindmap, Projects } from '../services/api';

const TEMPLATES = [
  {
    label: 'Pembelajaran (Mind Map)',
    text: 'Mind mapping merupakan teknik visualisasi pengetahuan yang dikembangkan oleh Tony Buzan. Teknik ini menyajikan informasi secara non-linear dari satu konsep pusat ke berbagai sub-konsep. Mind map terbukti efektif meningkatkan retensi memori dan pembelajaran kognitif. Pembuatan mind map manual membutuhkan waktu 20-30 menit per dokumen 1000 kata. Otomatisasi dengan AI dapat mengurangi waktu tersebut secara signifikan.'
  },
  {
    label: 'Arsitektur PERN',
    text: 'Arsitektur PERN terdiri atas PostgreSQL untuk basis data relasional, Express sebagai framework backend Node.js, React untuk antarmuka pengguna single-page application, serta Node.js sebagai runtime JavaScript di server. Komunikasi antara client dan server menggunakan REST API dengan pertukaran data JSON. Autentikasi dilakukan menggunakan JSON Web Token. PostgreSQL menyediakan tipe data JSONB yang mendukung penyimpanan dokumen hierarkis.'
  }
];

export default function NewMindMap() {
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const navigate = useNavigate();

  async function submit(e) {
    e.preventDefault();
    if (text.trim().length < 20) { setErr('Teks minimal 20 karakter'); return; }
    setBusy(true); setErr('');
    try {
      const gen = await Mindmap.generate(text);
      const finalTitle = title.trim() || gen.mindmap.concept || 'Mind Map Baru';
      const proj = await Projects.create({
        title: finalTitle,
        source_text: text,
        mindmap: gen.mindmap,
        layout: 'reingold-tilford-radial',
        meta: gen.meta
      });
      navigate(`/mindmap/${proj.project.id}`);
    } catch (ex) {
      if (ex.status === 401) navigate('/login');
      else setErr(ex.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container page">
      <div className="row spread" style={{ marginBottom: '1.4rem' }}>
        <div className="col">
          <span className="tag yellow">Input Teks</span>
          <h1 style={{ marginTop: 8 }}>Tempel teksmu ✦</h1>
          <p>Pipeline Auto-CoT + Validation Layer akan menghasilkan struktur hierarkis untukmu.</p>
        </div>
      </div>

      {err && <div className="alert error" style={{ marginBottom: 16 }}>{err}</div>}

      <form onSubmit={submit} className="col" style={{ gap: '1.2rem' }}>
        <label>
          <span style={{ fontWeight: 700 }}>Judul (opsional)</span>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ringkasan Bab II" />
        </label>
        <label>
          <span style={{ fontWeight: 700 }}>Teks sumber</span>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            rows={12}
            placeholder="Tempel paragraf atau ringkasan teks di sini..."
            style={{ resize: 'vertical' }}
          />
        </label>
        <div className="row" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
          <span className="muted">Coba template:</span>
          {TEMPLATES.map(t => (
            <button
              key={t.label}
              type="button"
              className="ghost"
              onClick={() => setText(t.text)}
            >{t.label}</button>
          ))}
        </div>
        <div className="row spread">
          <span className="muted">{text.trim().length} karakter</span>
          <button className="pink" disabled={busy}>
            {busy ? 'Membangkitkan...' : 'Generate mind map'}
          </button>
        </div>
      </form>
    </div>
  );
}
