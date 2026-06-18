/**
 * Topbar.jsx - Header global (star icon + nav + theme switcher).
 * Nav memakai ikon + label yang ringkas & tidak membungkus (nowrap).
 */
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { getToken, setToken } from '../services/api';
import ThemeSwitcher from './ThemeSwitcher';

function StarIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 1.5l2.4 7.4h7.6l-6.2 4.5 2.4 7.4-6.2-4.5-6.2 4.5 2.4-7.4-6.2-4.5h7.6L12 1.5z"
            fill="var(--color-ink)" />
    </svg>
  );
}

const ic = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none',
  stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round',
  'aria-hidden': true, style: { flexShrink: 0 } };

const IconDashboard = () => (
  <svg {...ic}><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>
);
const IconPlus = () => (
  <svg {...ic}><path d="M12 5v14M5 12h14"/></svg>
);
const IconLogout = () => (
  <svg {...ic}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>
);

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
        <ThemeSwitcher />
        {loggedIn ? (
          <>
            <NavLink to="/dashboard" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
              <IconDashboard /> <span>Dashboard</span>
            </NavLink>
            <NavLink to="/new" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
              <IconPlus /> <span>Buat Baru</span>
            </NavLink>
            <button className="secondary nav-item" onClick={logout}>
              <IconLogout /> <span>Logout</span>
            </button>
          </>
        ) : (
          <>
            <NavLink to="/login"    className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>Login</NavLink>
            <NavLink to="/register" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>Register</NavLink>
          </>
        )}
      </nav>
    </header>
  );
}
