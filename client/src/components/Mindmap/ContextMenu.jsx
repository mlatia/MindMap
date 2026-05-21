/**
 * ContextMenu.jsx - Menu klik-kanan untuk node mind map.
 *
 * Bug-fix vs versi sebelumnya:
 *   - Pakai 'click' (bukan mousedown) untuk deteksi outside-click,
 *     karena mousedown bisa fire SEBELUM child onClick → menu close duluan.
 *   - Hapus listener 'contextmenu' yang ikut close menu sendiri saat
 *     user klik-kanan node lain (sekarang parent yang re-set posisi).
 *   - Setup listener ditunda 80ms supaya event 'contextmenu' mounting
 *     awal tidak ke-detect sebagai outside-click.
 *   - Auto-reposition kalau menu overflow viewport (geser ke kiri/atas).
 */
import { useEffect, useRef, useState } from 'react';

export default function ContextMenu({ x, y, onAddChild, onRename, onDelete, onClose }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ x, y });

  // Reposition kalau menu mau lewat viewport
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let nx = x;
    let ny = y;
    if (x + rect.width > vw - 8) nx = vw - rect.width - 8;
    if (y + rect.height > vh - 8) ny = vh - rect.height - 8;
    if (nx !== pos.x || ny !== pos.y) setPos({ x: nx, y: ny });
    // eslint-disable-next-line
  }, [x, y]);

  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    const handleEsc = (e) => { if (e.key === 'Escape') onClose(); };
    // delay 80ms supaya event yang membuka menu (right-click) tidak
    // langsung trigger close lewat document-level click berikutnya
    const tid = setTimeout(() => {
      document.addEventListener('click', handleClick);
      document.addEventListener('keydown', handleEsc);
    }, 80);
    return () => {
      clearTimeout(tid);
      document.removeEventListener('click', handleClick);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [onClose]);

  function handleItemClick(fn) {
    return (e) => {
      e.preventDefault();
      e.stopPropagation();
      fn();
    };
  }

  return (
    <div
      ref={ref}
      role="menu"
      onContextMenu={(e) => e.preventDefault()}
      style={{
        position: 'fixed',
        top: pos.y, left: pos.x,
        background: '#fff',
        border: '1.5px solid var(--color-ink)',
        borderRadius: 12,
        boxShadow: '4px 4px 0 var(--color-ink)',
        padding: 6,
        minWidth: 200,
        zIndex: 10000,
        fontFamily: 'Plus Jakarta Sans, sans-serif',
        fontWeight: 600,
        userSelect: 'none',
      }}
    >
      <Item label="+ Tambah sub-konsep" onClick={handleItemClick(onAddChild)} />
      <Item label="✎ Rename"             onClick={handleItemClick(onRename)} />
      <hr style={{ border: 'none', borderTop: '1px dashed var(--color-ink)', margin: '4px 0' }} />
      <Item label="🗑  Hapus node" onClick={handleItemClick(onDelete)} danger />
    </div>
  );
}

function Item({ label, onClick, danger }) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: '10px 14px',
        borderRadius: 8,
        cursor: 'pointer',
        color: danger ? '#C0392B' : 'var(--color-ink)',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = danger ? '#FFC9C9' : 'var(--pink-tag)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      {label}
    </div>
  );
}
