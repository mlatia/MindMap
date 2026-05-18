/**
 * Topbar.jsx - Header global, mirroring portofolio (star icon + nav).
 */
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { getToken, setToken } from '../services/api';

function StarIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 1.5l2.4 7.4h7.6l-6.2 4.5 2.4 7.4-6.2-4.5-6.2 4.5 2.4-7.4-6.2-4.5h7.6L12 1.5z"
            fill="var(--color-ink)" />
    </svg>
  );
}

export default function Topbar() {
  const navigate = useNavigate();
  const logout = () => { setToken(null); navigate('/login'); };
  const loggedIn = Boolean(getToken());

  return (
    <header className="topbar">
      <Link className="brand" to="/">
        <StarIcon />
        Mind Map Otomatis
      </Link>
      <nav className="nav-links">
        {loggedIn ? (
          <>
            <NavLink to="/dashboard" className={({ isActive }) => isActive ? 'active' : ''}>Dashboard</NavLink>
            <NavLink to="/new"        className={({ isActive }) => isActive ? 'active' : ''}>Buat Baru</NavLink>
            <button className="secondary" onClick={logout}>Logout</button>
          </>
        ) : (
          <>
            <NavLink to="/login"    className={({ isActive }) => isActive ? 'active' : ''}>Login</NavLink>
            <NavLink to="/register" className={({ isActive }) => isActive ? 'active' : ''}>Register</NavLink>
          </>
        )}
      </nav>
    </header>
  );
}
