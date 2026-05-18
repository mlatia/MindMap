/**
 * Landing.jsx - Halaman publik dengan style portofolio "Melati".
 */
import { Link } from 'react-router-dom';

export default function Landing() {
  return (
    <div className="container page">
      <div className="hero">
        <div className="col" style={{ gap: '1.4rem' }}>
          <span className="tag">Mind Map Otomatis</span>
          <h1>
            Ubah teks panjangmu jadi
            <span style={{ background: 'var(--note-yellow)', padding: '0 6px', marginLeft: 6 }}>
              mind map
            </span>{' '}
            dalam hitungan detik.
          </h1>
          <p style={{ maxWidth: 520 }}>
            Sistem berbasis Generative AI dengan strategi <em>Auto-CoT prompting</em>{' '}
            mengekstraksi struktur hierarkis konsep dari teks, lalu memvisualisasikannya
            menggunakan algoritma <strong>Reingold-Tilford radial</strong> dan <strong>Force-Directed</strong>.
          </p>
          <div className="row">
            <Link to="/register"><button className="pink">Mulai gratis</button></Link>
            <Link to="/login"><button className="secondary">Saya sudah punya akun</button></Link>
          </div>
          <div className="row" style={{ marginTop: '0.4rem', gap: '0.4rem', flexWrap: 'wrap' }}>
            <span className="tag yellow">Auto-CoT</span>
            <span className="tag blue">D3.js</span>
            <span className="tag mint">Validation Layer</span>
            <span className="tag">Editor Interaktif</span>
          </div>
        </div>
        <div className="col" style={{ gap: '1rem' }}>
          <div className="card yellow" style={{ transform: 'rotate(-2deg)' }}>
            <span className="scribble" style={{ fontSize: '1.4rem' }}>Pen / Paper</span>
            <h3>User Research Design</h3>
            <p>Riset kebutuhan pengguna saat membuat mind map manual.</p>
          </div>
          <div className="card blue" style={{ transform: 'rotate(1deg)' }}>
            <span className="scribble" style={{ fontSize: '1.4rem' }}>Figma</span>
            <h3>UI &amp; Product Design</h3>
            <p>Antarmuka clean, intuitif, dengan visual sticky-note pastel.</p>
          </div>
          <div className="card pink" style={{ transform: 'rotate(-1deg)' }}>
            <span className="scribble" style={{ fontSize: '1.4rem' }}>No-code</span>
            <h3>LLM + D3.js</h3>
            <p>Auto-generate dari teks, edit, ekspor PNG/PDF.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
