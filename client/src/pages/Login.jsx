/**
 * Login.jsx - Halaman Login (L-01).
 */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Auth, setToken } from '../services/api';
import Mascot from '../components/Mascot';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      const res = await Auth.login({ email, password });
      setToken(res.token);
      navigate('/dashboard');
    } catch (ex) {
      setErr(ex.message || 'Login gagal');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="panel">
        <div style={{ maxWidth: 360, width: '100%', margin: '0 auto' }}>
          <span className="tag">Haii!!</span>
          <h1 style={{ marginTop: 12 }}>Masuk ke akun.</h1>
          <p style={{ marginTop: 8, marginBottom: 24 }}>
            Belum punya?{' '}
            <Link to="/register" style={{ borderBottom: '2px solid var(--pink-strong)' }}>
              Daftar di sini
            </Link>
          </p>

          {err && <div className="alert error" style={{ marginBottom: 16 }}>{err}</div>}

          <form onSubmit={submit} className="col">
            <label>
              <span style={{ fontWeight: 700 }}>Email</span>
              <input value={email} onChange={e => setEmail(e.target.value)} type="email" required />
            </label>
            <label>
              <span style={{ fontWeight: 700 }}>Password</span>
              <input value={password} onChange={e => setPassword(e.target.value)} type="password" required />
            </label>
            <button className="pink" disabled={busy}>{busy ? 'Masuk...' : 'Masuk'}</button>
          </form>
        </div>
      </div>
      <div className="accent">
        <Mascot size={150} className="mascot-float" style={{ marginBottom: '1rem' }} />
        <div className="card" style={{ transform: 'rotate(-2deg)', maxWidth: 320 }}>
          <span className="scribble" style={{ fontSize: '1.4rem' }}>Welcome back ✦</span>
          <h3 style={{ marginTop: 8 }}>Lanjutkan proyek mind map-mu.</h3>
          <p>Akunmu menyimpan semua mind map dan revisinya.</p>
        </div>
      </div>
    </div>
  );
}
