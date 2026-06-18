/**
 * Landing.jsx - Halaman publik dengan style portofolio "Melati".
 */
import { Link } from 'react-router-dom';
import Mascot from '../components/Mascot';

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
            dengan tiga layout: <strong>Reingold-Tilford radial</strong>,{' '}
            <strong>Force-Directed</strong>, dan <strong>Radial Cluster</strong>.
          </p>
          <div className="row">
            <Link to="/register"><button className="pink">Mulai gratis</button></Link>
            <Link to="/login"><button className="secondary">Saya sudah punya akun</button></Link>
          </div>
          <div className="row" style={{ marginTop: '0.4rem', gap: '0.4rem', flexWrap: 'wrap' }}>
            <span className="tag yellow">Auto-CoT</span>
            <span className="tag blue">3 Layout</span>
            <span className="tag mint">Tema Warna</span>
            <span className="tag">Editor Interaktif</span>
          </div>
        </div>
        <div className="col" style={{ gap: '1rem', alignItems: 'center' }}>
          <Mascot size={150} className="mascot-float" style={{ alignSelf: 'center' }} />
          <div className="card yellow" style={{ transform: 'rotate(-2deg)' }}>
            <span className="scribble" style={{ fontSize: '1.4rem' }}>Tempel teks</span>
            <h3>Dari Teks ke Peta</h3>
            <p>Tempel artikel, catatan kuliah, atau materi apa pun langsung jadi mind map terstruktur.</p>
          </div>
          <div className="card blue" style={{ transform: 'rotate(1deg)' }}>
            <span className="scribble" style={{ fontSize: '1.4rem' }}>3 Layout</span>
            <h3>Pilih Gaya Visualisasi</h3>
            <p>Reingold-Tilford radial, Force-Directed, atau Radial Cluster pilih yang paling pas dengan isi teksmu.</p>
          </div>
          <div className="card pink" style={{ transform: 'rotate(-1deg)' }}>
            <span className="scribble" style={{ fontSize: '1.4rem' }}>Custom</span>
            <h3>Ganti Tema Warna</h3>
            <p>Pink, biru, atau mint—ubah nuansa petamu sesuka hati, lalu ekspor ke PNG/PDF.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
