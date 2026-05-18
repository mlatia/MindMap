/**
 * Dashboard.jsx - Halaman Daftar Proyek Mind Map (L-03).
 */
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Projects } from '../services/api';

export default function Dashboard() {
  const [list, setList] = useState([]);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState('');
  const navigate = useNavigate();

  async function load() {
    setBusy(true); setErr('');
    try {
      const res = await Projects.list();
      setList(res.projects || []);
    } catch (ex) {
      if (ex.status === 401) navigate('/login');
      else setErr(ex.message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function remove(id) {
    if (!confirm('Hapus proyek ini?')) return;
    await Projects.remove(id);
    load();
  }

  return (
    <div className="container page">
      <div className="row spread" style={{ marginBottom: '1.5rem' }}>
        <div className="col">
          <span className="tag">Dashboard</span>
          <h1 style={{ marginTop: 8 }}>Proyek mind map.</h1>
        </div>
        <Link to="/new"><button className="pink">+ Buat baru</button></Link>
      </div>

      {err && <div className="alert error">{err}</div>}
      {busy && <p className="muted">Memuat...</p>}

      {!busy && list.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <span className="scribble" style={{ fontSize: '1.4rem' }}>belum ada proyek</span>
          <p style={{ marginTop: 8 }}>Buat mind map pertamamu untuk memulai.</p>
          <div style={{ marginTop: 16 }}>
            <Link to="/new"><button className="pink">Mulai mind map baru</button></Link>
          </div>
        </div>
      )}

      <div className="project-grid">
        {list.map((p, i) => (
          <div key={p.id} className="project-card" onClick={() => navigate(`/mindmap/${p.id}`)}>
            <span className={`tag ${['yellow','blue','mint',''][i % 4]}`}>
              {p.layout === 'force-directed-radial' ? 'Force-Directed' : 'Reingold-Tilford'}
            </span>
            <h3>{p.title}</h3>
            <div className="meta">
              Diperbarui {new Date(p.updated_at).toLocaleDateString('id-ID')}
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              <button className="secondary" onClick={(e) => { e.stopPropagation(); navigate(`/mindmap/${p.id}`); }}>
                Buka
              </button>
              <button className="ghost" onClick={(e) => { e.stopPropagation(); remove(p.id); }}>
                Hapus
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
