/**
 * ContextMenu.jsx - Mini context menu yang muncul saat klik kanan node.
 * Item: Tambah sub-konsep, Rename, Hapus, Tutup.
 */
import { useEffect, useRef } from 'react';

export default function ContextMenu({ x, y, onAddChild, onRename, onDelete, onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('contextmenu', handler);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') onClose(); });
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('contextmenu', handler);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        top: y, left: x,
        background: '#fff',
        border: '1.5px solid var(--color-ink)',
        borderRadius: 12,
        boxShadow: '4px 4px 0 var(--color-ink)',
        padding: 6,
        minWidth: 180,
        zIndex: 1000,
        fontFamily: 'Plus Jakarta Sans, sans-serif',
        fontWeight: 600,
      }}
    >
      <Item label="+ Tambah sub-konsep" onClick={onAddChild} />
      <Item label="✎ Rename"             onClick={onRename} />
      <hr style={{ border: 'none', borderTop: '1px dashed var(--color-ink)', margin: '4px 0' }} />
      <Item label="🗑  Hapus node" onClick={onDelete} danger />
    </div>
  );
}

function Item({ label, onClick, danger }) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: '8px 12px',
        borderRadius: 8,
        cursor: 'pointer',
        color: danger ? '#C0392B' : 'var(--color-ink)',
        userSelect: 'none',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = danger ? '#FFC9C9' : 'var(--pink-tag)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      {label}
    </div>
  );
}
