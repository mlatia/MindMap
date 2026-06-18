/**
 * ThemeSwitcher.jsx - Pemilih tema warna (pink / biru / mint).
 *
 * Menyetel atribut data-theme di <html> dan menyimpannya di localStorage,
 * sehingga seluruh aplikasi - termasuk warna node mind map (var --branch-*,
 * --pink-strong) - ikut berubah. Tema diterapkan ulang saat aplikasi dimuat
 * (lihat applySavedTheme di main.jsx).
 */
import { useState } from 'react';

export const THEMES = [
  { id: 'pink', label: 'Pink', swatch: '#FF7AC4' },
  { id: 'blue', label: 'Biru', swatch: '#3DA8E0' },
  { id: 'mint', label: 'Mint', swatch: '#4FBF8B' },
];

export function applyTheme(id) {
  const theme = THEMES.some(t => t.id === id) ? id : 'pink';
  if (theme === 'pink') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', theme);
  try { localStorage.setItem('mm_theme', theme); } catch (_) {}
}

export function getSavedTheme() {
  try { return localStorage.getItem('mm_theme') || 'pink'; } catch (_) { return 'pink'; }
}

export default function ThemeSwitcher() {
  const [active, setActive] = useState(getSavedTheme());
  const pick = (id) => { applyTheme(id); setActive(id); };
  return (
    <div className="theme-switcher" role="group" aria-label="Pilih tema warna">
      {THEMES.map(t => (
        <button
          key={t.id}
          type="button"
          title={`Tema ${t.label}`}
          aria-label={`Tema ${t.label}`}
          aria-pressed={active === t.id}
          className={`theme-dot${active === t.id ? ' active' : ''}`}
          style={{ background: t.swatch }}
          onClick={() => pick(t.id)}
        />
      ))}
    </div>
  );
}
