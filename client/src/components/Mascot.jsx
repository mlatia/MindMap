/**
 * Mascot.jsx - Maskot robot mind map (gaya pastel, mengikuti tema warna).
 *
 * Warna badan mengikuti CSS var --pink-tag / --pink-strong sehingga ikut
 * berubah saat tema diganti (pink / biru / mint). Dipakai di hero, empty
 * state dashboard, halaman auth, dll.
 *
 * Props:
 *   size  - lebar/tinggi px (default 140)
 *   mood  - 'happy' | 'wink' (default 'happy')
 *   style - style tambahan (mis. rotate)
 */
export default function Mascot({ size = 140, mood = 'happy', style = {}, className = '' }) {
  return (
    <svg
      className={`mascot ${className}`}
      width={size} height={size} viewBox="0 0 200 200"
      role="img" aria-label="Maskot robot mind map"
      style={style}
    >
      {/* antena + node mind-map mini */}
      <line x1="100" y1="44" x2="100" y2="22" stroke="var(--color-ink)" strokeWidth="3" />
      <line x1="100" y1="30" x2="74" y2="16" stroke="var(--color-ink)" strokeWidth="2.5" />
      <line x1="100" y1="30" x2="126" y2="16" stroke="var(--color-ink)" strokeWidth="2.5" />
      <circle cx="100" cy="22" r="9" fill="var(--pink-strong)" stroke="var(--color-ink)" strokeWidth="2.5" />
      <rect x="58" y="6" width="22" height="15" rx="4" fill="var(--note-yellow)" stroke="var(--color-ink)" strokeWidth="2.5" />
      <rect x="120" y="6" width="22" height="15" rx="4" fill="var(--note-blue)" stroke="var(--color-ink)" strokeWidth="2.5" />

      {/* telinga / headphone */}
      <rect x="26" y="86" width="22" height="40" rx="11" fill="var(--pink-strong)" stroke="var(--color-ink)" strokeWidth="3" />
      <rect x="152" y="86" width="22" height="40" rx="11" fill="var(--pink-strong)" stroke="var(--color-ink)" strokeWidth="3" />

      {/* kepala */}
      <rect x="42" y="50" width="116" height="104" rx="34" fill="var(--pink-tag)" stroke="var(--color-ink)" strokeWidth="3.5" />
      {/* layar wajah */}
      <rect x="58" y="68" width="84" height="68" rx="24" fill="#fff" stroke="var(--color-ink)" strokeWidth="3" />

      {/* mata */}
      <circle cx="84" cy="100" r="8" fill="var(--color-ink)" />
      <circle cx="116" cy="100" r="8" fill="var(--color-ink)" />
      <circle cx="86.5" cy="97.5" r="2.6" fill="#fff" />
      <circle cx="118.5" cy="97.5" r="2.6" fill="#fff" />
      {/* pipi */}
      <circle cx="72" cy="116" r="6" fill="var(--pink-strong)" opacity="0.5" />
      <circle cx="128" cy="116" r="6" fill="var(--pink-strong)" opacity="0.5" />
      {/* senyum / wink */}
      {mood === 'wink'
        ? <path d="M78 118 q14 12 28 0" fill="none" stroke="var(--color-ink)" strokeWidth="3" strokeLinecap="round" />
        : <path d="M84 116 q16 14 32 0" fill="none" stroke="var(--color-ink)" strokeWidth="3" strokeLinecap="round" />}
    </svg>
  );
}
