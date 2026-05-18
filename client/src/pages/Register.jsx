/**
 * Register.jsx - Halaman Registrasi (L-02).
 */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Auth, setToken } from '../services/api';

export default function Register() {
  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  function update(k, v) { setForm(prev => ({ ...prev, [k]: v })); }

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      await Auth.register(form);
      const res = await Auth.login({ email: form.email, password: form.password });
      setToken(res.token);
      navigate('/dashboard');
    } catch (ex) {
      setErr(ex.message || 'Registrasi gagal');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="panel">
        <div style={{ maxWidth: 400, width: '100%', margin: '0 auto' }}>
          <span className="tag yellow">Akun baru</span>
          <h1 style={{ marginTop: 12 }}>Daftar sekarang.</h1>
          <p style={{ marginTop: 8, marginBottom: 24 }}>
            Sudah punya?{' '}
            <Link to="/login" style={{ borderBottom: '2px solid var(--pink-strong)' }}>
              Login
            </Link>
          </p>

          {err && <div className="alert error" style={{ marginBottom: 16 }}>{err}</div>}

          <form onSubmit={submit} className="col">
            <label>
              <span style={{ fontWeight: 700 }}>Username</span>
              <input value={form.username} onChange={e => update('username', e.target.value)} required />
            </label>
            <label>
              <span style={{ fontWeight: 700 }}>Email</span>
              <input type="email" value={form.email} onChange={e => update('email', e.target.value)} required />
            </label>
            <label>
              <span style={{ fontWeight: 700 }}>Password</span>
              <input type="password" value={form.password} onChange={e => update('password', e.target.value)} required minLength={6} />
            </label>
            <button className="pink" disabled={busy}>{busy ? 'Memproses...' : 'Buat akun'}</button>
          </form>
        </div>
      </div>
      <div className="accent">
        <div className="card yellow" style={{ transform: 'rotate(2deg)', maxWidth: 320 }}>
          <span className="scribble" style={{ fontSize: '1.4rem' }}>Let&apos;s start ✦</span>
          <h3 style={{ marginTop: 8 }}>Mind map otomatis</h3>
          <p>Tempel teks, biarkan AI yang menyusun strukturnya.</p>
        </div>
      </div>
    </div>
  );
}
