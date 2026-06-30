/**
 * MindMapDetail.jsx - Editor & Visualisasi Mind Map (L-05, L-06, L-07).
 *
 * Kontrol kanvas BERADA DI DALAM kanvas (sticky di bawah header), jadi tidak
 * menabrak header dan tetap terlihat saat scroll. Kiri = Download (PNG/PDF);
 * kanan = Undo/Redo + Perbesar (slider berangka) + Help (kotak pink terpisah).
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import MindMapRadial from '../components/Mindmap/MindMapRadial';
import MindMapForce from '../components/Mindmap/MindMapForce';
import MindMapCluster from '../components/Mindmap/MindMapCluster';
import ContextMenu from '../components/Mindmap/ContextMenu';
import { exportPNG, exportPDF } from '../components/Mindmap/exportUtils';
import { Projects } from '../services/api';
import useMindMap from '../state/useMindMap';

const LAYOUTS = [
  { id: 'reingold-tilford-radial', label: 'Reingold-Tilford radial' },
  { id: 'force-directed-radial',   label: 'Force-Directed' },
  { id: 'radial-cluster',          label: 'Radial Cluster' },
];

function nodeAt(tree, path) {
  let cur = tree;
  for (const i of path) cur = cur?.children?.[i];
  return cur;
}

function useIsMobile() {
  const [m, setM] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const fn = (e) => setM(e.matches);
    mq.addEventListener ? mq.addEventListener('change', fn) : mq.addListener(fn);
    return () => { mq.removeEventListener ? mq.removeEventListener('change', fn) : mq.removeListener(fn); };
  }, []);
  return m;
}

export default function MindMapDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [project, setProject] = useState(null);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState('');
  const [selectedPath, setSelectedPath] = useState(null);
  const [editingPath, setEditingPath] = useState(null);
  const [ctxMenu, setCtxMenu] = useState(null);
  const [layout, setLayout] = useState('reingold-tilford-radial');
  const [spacing, setSpacing] = useState(1.0);
  const [saveState, setSaveState] = useState('saved');
  const [showHelp, setShowHelp] = useState(false);
  const [showDownload, setShowDownload] = useState(false);
  const [sheet, setSheet] = useState(null);
  const [headH, setHeadH] = useState(64);
  const layoutReady = useRef(false);
  const wrapRef = useRef(null);
  const headRef = useRef(null);

  const mm = useMindMap(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await Projects.get(id);
        if (cancelled) return;
        setProject(res.project);
        mm.setTree(res.project.mindmap);
        setLayout(res.project.layout || 'reingold-tilford-radial');
      } catch (ex) {
        if (ex.status === 401) navigate('/login');
        else setErr(ex.message);
      } finally {
        setBusy(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line
  }, [id]);

  // Ukur tinggi header (sticky) supaya kontrol kanvas menempel TEPAT di bawahnya.
  useLayoutEffect(() => {
    const measure = () => { if (headRef.current) setHeadH(headRef.current.offsetHeight); };
    measure();
    window.addEventListener('resize', measure);
    let ro;
    if (headRef.current && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(measure);
      ro.observe(headRef.current);
    }
    return () => { window.removeEventListener('resize', measure); if (ro) ro.disconnect(); };
  }, [project, busy]);

  useEffect(() => {
    if (!project || !mm.tree) return;
    if (JSON.stringify(project.mindmap) !== JSON.stringify(mm.tree)) setSaveState('dirty');
  }, [mm.tree, project]);

  useEffect(() => {
    if (!project) return;
    if (!layoutReady.current) { layoutReady.current = true; return; }
    Projects.update(project.id, { mindmap: mm.tree, layout }).catch(() => {});
    // eslint-disable-next-line
  }, [layout]);

  const selected = useMemo(
    () => (mm.tree && selectedPath ? nodeAt(mm.tree, selectedPath) : null),
    [mm.tree, selectedPath]
  );
  const isRootSelected = selectedPath && selectedPath.length === 0;

  async function save() {
    if (!project) return;
    setSaveState('saving');
    try {
      await Projects.update(project.id, { mindmap: mm.tree, layout });
      await Projects.saveRevision(project.id, { mindmap: mm.tree, note: 'manual save' });
      setSaveState('saved');
    } catch (ex) {
      setErr(ex.message);
      setSaveState('dirty');
    }
  }

  function handleEdit(path) {
    setSelectedPath(path);
    setCtxMenu(null);
    if (isMobile) openSheet('rename', path);
    else setEditingPath(path);
  }
  function handleContextMenu(path, x, y) {
    setSelectedPath(path);
    setCtxMenu({ path, x, y });
    setEditingPath(null);
  }
  function commitEdit(path, value) {
    if (value && value.trim() && value.trim() !== nodeAt(mm.tree, path)?.concept) {
      mm.rename(path, value.trim());
    }
    setEditingPath(null);
  }
  function cancelEdit() { setEditingPath(null); }

  function handleExport(kind) {
    setShowDownload(false);
    const svg = wrapRef.current?.querySelector('svg');
    if (!svg) return;
    if (kind === 'png') exportPNG(svg, `${project?.title || 'mindmap'}.png`);
    else exportPDF(svg, project?.title || 'Mind Map');
  }

  function openSheet(mode, path) {
    const cur = mode === 'rename' ? (nodeAt(mm.tree, path)?.concept || '') : '';
    setSheet({ mode, path, value: cur });
  }
  function submitSheet() {
    if (!sheet) return;
    const v = (sheet.value || '').trim();
    if (v) mm.rename(sheet.path, v);
    setSheet(null);
  }

  function actRename() {
    if (!selectedPath) return;
    if (isMobile) openSheet('rename', selectedPath);
    else setEditingPath(selectedPath);
  }
  function actAddChild() {
    if (!selectedPath) return;
    const parent = nodeAt(mm.tree, selectedPath);
    const newIdx = parent?.children?.length ?? 0;
    const childPath = [...selectedPath, newIdx];
    mm.addChild(selectedPath, 'Konsep baru');
    setTimeout(() => {
      setSelectedPath(childPath);
      if (isMobile) openSheet('add', childPath);
      else setEditingPath(childPath);
    }, 0);
  }
  function actDelete() {
    if (!selectedPath) return;
    if (selectedPath.length === 0) { alert('Node root tidak bisa dihapus.'); return; }
    if (!confirm('Hapus node ini beserta anak-anaknya?')) return;
    mm.remove(selectedPath);
    setSelectedPath(null);
  }

  function ctxAddChild() { if (ctxMenu) { setSelectedPath(ctxMenu.path); setTimeout(actAddChild, 0); } setCtxMenu(null); }
  function ctxRename()  { if (ctxMenu) { setSelectedPath(ctxMenu.path); setTimeout(actRename, 0); } setCtxMenu(null); }
  function ctxDelete()  { if (ctxMenu) { setSelectedPath(ctxMenu.path); setTimeout(actDelete, 0); } setCtxMenu(null); }

  if (busy) return <div className="container page"><p className="muted">Memuat...</p></div>;
  if (err)  return <div className="container page"><div className="alert error">{err}</div></div>;

  const validationStatus = project?.meta?.validation;
  const warnings = project?.meta?.warnings || [];
  const layoutProps = {
    tree: mm.tree, onEdit: handleEdit, onContextMenu: handleContextMenu,
    selectedPath, editingPath, onCommitEdit: commitEdit, onCancelEdit: cancelEdit, spacing,
  };

  const helpBody = (
    <>
      <span className="close-x" onClick={() => setShowHelp(false)}>{'✕'}</span>
      <h4>Cara pakai</h4>
      <ul>
        <li><strong>Pilih node</strong>: klik/tap node lalu pakai panel "Node terpilih" di bawah canvas.</li>
        <li><strong>Rename</strong>: klik tombol Rename atau klik node. Enter simpan, Esc batal.</li>
        <li><strong>Tambah subnode</strong>: klik tombol "+ Subnode" pada node terpilih.</li>
        <li><strong>Hapus</strong>: klik tombol Hapus (root tidak bisa dihapus).</li>
        <li><strong>Perbesar</strong>: geser slider jika node menumpuk.</li>
        <li><strong>Zoom/geser</strong>: scroll atau cubit; seret node untuk memindah.</li>
        <li><strong>Download</strong>: tombol Download lalu pilih PNG / PDF.</li>
      </ul>
    </>
  );

  return (
    <div className="container page" style={{ paddingTop: '0.4rem' }}>
      <div ref={headRef} className="detail-head row spread" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div className="col" style={{ gap: '0.25rem' }}>
          <span className="tag">{project?.meta?.provider || 'mock'} LLM</span>
          <h1 style={{ fontSize: '1.8rem' }}>{project?.title}</h1>
          <span className="muted">
            {project?.meta?.stats
              ? `${project.meta.stats.nodes} node · depth ${project.meta.stats.depth} · ${project.meta.attempts} attempt`
              : 'mind map siap diedit'}
          </span>
        </div>
        <div className="row" style={{ alignItems: 'center', gap: '0.5rem' }}>
          <span className={`save-state ${saveState === 'saved' ? 'ok' : 'dirty'}`}>
            {saveState === 'saved' ? '✓ Tersimpan' : saveState === 'saving' ? 'Menyimpan…' : '● Belum disimpan'}
          </span>
          <button onClick={save} disabled={saveState === 'saving'}>Simpan</button>
        </div>
      </div>

      {validationStatus === 'warning' && warnings.length > 0 && (
        <div className="alert" style={{ margin: '0.8rem 0' }}>
          ⚠ Mind map ini di-generate dengan validasi lunak. Pesan: {warnings[0]}
        </div>
      )}

      <div className="layout-bar">
        <span className="ll">Algoritma layout:</span>
        {LAYOUTS.map(l => (
          <button key={l.id} className={layout === l.id ? '' : 'secondary'} onClick={() => setLayout(l.id)}>
            {l.label}
          </button>
        ))}
      </div>

      <div ref={wrapRef} className="canvas-wrap">
        {/* Kontrol di DALAM kanvas, sticky tepat di bawah header */}
        <div className="canvas-controls" style={{ top: headH + 6 }}>
          <div className="ct-group dl-wrap">
            <button className="icon-btn btn-download" onClick={() => setShowDownload(s => !s)} title="Unduh">{'⬇'} Download</button>
            {showDownload && (
              <div className="dl-menu">
                <button className="dl-png" onClick={() => handleExport('png')}>{'⬇'} PNG</button>
                <button className="dl-pdf" onClick={() => handleExport('pdf')}>{'⬇'} PDF</button>
              </div>
            )}
          </div>
          <div className="ct-group">
            <button className="secondary icon-btn" onClick={mm.undo} disabled={!mm.canUndo} title="Undo">{'↶'}</button>
            <button className="secondary icon-btn" onClick={mm.redo} disabled={!mm.canRedo} title="Redo">{'↷'}</button>
            <span className="sep" />
            <label title="Perbesar jarak antar node biar tidak overlap">
              <span className="lbl">Perbesar</span>
              <input type="range" min="0.6" max="3" step="0.1" value={spacing}
                onChange={(e) => setSpacing(parseFloat(e.target.value))} />
              <span className="spacing-val">{spacing.toFixed(1)}×</span>
            </label>
          </div>
          <div className="help-wrap">
            <button className="ct-help" onClick={() => setShowHelp(s => !s)} title="Bantuan"><span className="qm">?</span><span className="hl"> Help</span></button>
            {showHelp && !isMobile && (
              <div className="help-dd" onClick={(e) => e.stopPropagation()}>{helpBody}</div>
            )}
          </div>
        </div>

        {mm.tree ? (
          layout === 'force-directed-radial'
            ? <MindMapForce {...layoutProps} />
            : layout === 'radial-cluster'
            ? <MindMapCluster {...layoutProps} />
            : <MindMapRadial {...layoutProps} />
        ) : (
          <div className="empty-hint">Mind map kosong</div>
        )}

      </div>

      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x} y={ctxMenu.y}
          onAddChild={ctxAddChild} onRename={ctxRename} onDelete={ctxDelete}
          onClose={() => setCtxMenu(null)}
        />
      )}

      <div className="row" style={{ marginTop: '1rem', gap: '1rem', flexWrap: 'wrap' }}>
        <div className="card" style={{ flex: '1 1 340px' }}>
          <span className="tag yellow">Node terpilih</span>
          <h3 style={{ marginTop: 8 }}>{selected ? selected.concept : '— belum ada —'}</h3>
          <div className="node-actions">
            <button className="na-rename" onClick={actRename} disabled={!selected}>Rename</button>
            <button className="na-add" onClick={actAddChild} disabled={!selected}>+ Subnode</button>
            <button className="na-del" onClick={actDelete} disabled={!selected || isRootSelected}>Hapus</button>
          </div>
          <p className="muted" style={{ marginTop: 8, fontSize: '0.85rem' }}>
            {selected ? 'Gunakan tombol di atas untuk mengubah node ini.' : 'Klik/tap salah satu node pada kanvas untuk memilih.'}
          </p>
        </div>
        <div className="card blue" style={{ flex: '1 1 280px' }}>
          <span className="tag">Teks sumber</span>
          <p style={{ marginTop: 8, maxHeight: 140, overflow: 'auto' }}>
            {project?.source_text}
          </p>
        </div>
      </div>

      {showHelp && isMobile && (
        <div className="sheet-backdrop" onClick={() => setShowHelp(false)}>
          <div className="help-modal" onClick={(e) => e.stopPropagation()}>{helpBody}</div>
        </div>
      )}

      {sheet && (
        <div className="sheet-backdrop" onClick={() => setSheet(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h3>{sheet.mode === 'rename' ? 'Ubah nama node' : 'Beri nama subnode'}</h3>
            <input type="text" autoFocus value={sheet.value}
              onChange={(e) => setSheet(s => ({ ...s, value: e.target.value }))}
              onKeyDown={(e) => { if (e.key === 'Enter') submitSheet(); if (e.key === 'Escape') setSheet(null); }}
              placeholder="Tulis nama konsep..." />
            <div className="sheet-actions">
              <button className="secondary" onClick={() => setSheet(null)}>Batal</button>
              <button onClick={submitSheet}>Simpan</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
