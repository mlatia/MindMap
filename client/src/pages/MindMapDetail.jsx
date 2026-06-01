/**
 * MindMapDetail.jsx - Editor & Visualisasi Mind Map (L-05, L-06, L-07).
 *
 * Interaksi baru (UX redesign):
 *   - Klik node      -> masuk edit mode inline (input on top of node)
 *   - Klik kanan     -> context menu (Tambah sub-konsep, Rename, Hapus)
 *   - Enter          -> commit edit
 *   - Escape         -> batal
 *   - Hover          -> outline pink
 *   - Selected       -> pulse + warna pink-tag
 *
 * Toolbar atas tinggal: layout switcher, undo/redo, save, export.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import MindMapRadial from '../components/Mindmap/MindMapRadial';
import MindMapForce from '../components/Mindmap/MindMapForce';
import MindMapCluster from '../components/Mindmap/MindMapCluster';
import ContextMenu from '../components/Mindmap/ContextMenu';
import { exportPNG, exportPDF } from '../components/Mindmap/exportUtils';
import { Projects } from '../services/api';
import useMindMap from '../state/useMindMap';

const LAYOUTS = [
  { id: 'reingold-tilford-radial', label: 'Reingold-Tilford' },
  { id: 'force-directed-radial',   label: 'Force-Directed' },
  { id: 'radial-cluster',          label: 'Radial Cluster' },
];

function nodeAt(tree, path) {
  let cur = tree;
  for (const i of path) cur = cur?.children?.[i];
  return cur;
}

export default function MindMapDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState('');
  const [selectedPath, setSelectedPath] = useState(null);
  const [editingPath, setEditingPath] = useState(null);
  const [ctxMenu, setCtxMenu] = useState(null); // { path, x, y }
  const [layout, setLayout] = useState('reingold-tilford-radial');
  const [spacing, setSpacing] = useState(1.0);
  const [saveState, setSaveState] = useState('saved');
  const wrapRef = useRef(null);

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

  useEffect(() => {
    if (!project || !mm.tree) return;
    const serverTree = JSON.stringify(project.mindmap);
    const localTree = JSON.stringify(mm.tree);
    if (serverTree !== localTree) setSaveState('dirty');
  }, [mm.tree, project]);

  const selected = useMemo(
    () => (mm.tree && selectedPath ? nodeAt(mm.tree, selectedPath) : null),
    [mm.tree, selectedPath]
  );

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

  // ---- Event handlers untuk canvas ----
  function handleEdit(path) {
    setSelectedPath(path);
    setEditingPath(path);
    setCtxMenu(null);
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

  function cancelEdit() {
    setEditingPath(null);
  }

  function handleExport(kind) {
    const svg = wrapRef.current?.querySelector('svg');
    if (!svg) return;
    if (kind === 'png') exportPNG(svg, `${project?.title || 'mindmap'}.png`);
    else exportPDF(svg, project?.title || 'Mind Map');
  }

  // ---- Context menu actions ----
  function ctxAddChild() {
    if (!ctxMenu) return;
    const parent = nodeAt(mm.tree, ctxMenu.path);
    const newIdx = parent?.children?.length ?? 0;  // anak baru di-append, index = current length
    const targetPath = [...ctxMenu.path, newIdx];
    mm.addChild(ctxMenu.path, 'Konsep baru');
    // tunda set edit supaya state tree sudah update dulu
    setTimeout(() => {
      setSelectedPath(targetPath);
      setEditingPath(targetPath);
    }, 0);
    setCtxMenu(null);
  }
  function ctxRename() {
    if (!ctxMenu) return;
    setEditingPath(ctxMenu.path);
    setCtxMenu(null);
  }
  function ctxDelete() {
    if (!ctxMenu) return;
    if (ctxMenu.path.length === 0) {
      alert('Node root tidak bisa dihapus.');
      setCtxMenu(null);
      return;
    }
    mm.remove(ctxMenu.path);
    setSelectedPath(null);
    setCtxMenu(null);
  }

  if (busy) return <div className="container page"><p className="muted">Memuat...</p></div>;
  if (err)  return <div className="container page"><div className="alert error">{err}</div></div>;

  const validationStatus = project?.meta?.validation;
  const warnings = project?.meta?.warnings || [];

  return (
    <div className="container page" style={{ paddingTop: '1.4rem' }}>
      <div className="row spread" style={{ marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div className="col" style={{ gap: '0.25rem' }}>
          <span className="tag">{project?.meta?.provider || 'mock'} LLM</span>
          <h1 style={{ fontSize: '2rem' }}>{project?.title}</h1>
          <span className="muted">
            {project?.meta?.stats
              ? `${project.meta.stats.nodes} node · depth ${project.meta.stats.depth} · ${project.meta.attempts} attempt`
              : 'mind map siap diedit'}
          </span>
        </div>
        <div className="row" style={{ alignItems: 'center', gap: '0.5rem' }}>
          <span className={`tag ${saveState === 'saved' ? 'mint' : 'yellow'}`}>
            {saveState === 'saved' ? 'Tersimpan' : saveState === 'saving' ? 'Menyimpan...' : 'Belum disimpan'}
          </span>
          <button onClick={save}>Simpan</button>
        </div>
      </div>

      {validationStatus === 'warning' && warnings.length > 0 && (
        <div className="alert" style={{ marginBottom: '0.8rem' }}>
          ⚠ Mind map ini di-generate dengan validasi lunak. Pesan: {warnings[0]}
        </div>
      )}

      <div className="toolbar" style={{ marginBottom: '0.9rem' }}>
        <div className="row" style={{ alignItems: 'center' }}>
          <strong>Layout:</strong>
          {LAYOUTS.map(l => (
            <button
              key={l.id}
              className={layout === l.id ? '' : 'secondary'}
              onClick={() => setLayout(l.id)}
            >
              {l.label}
            </button>
          ))}
        </div>
        <span style={{ borderRight: '1.5px dashed var(--color-ink)', margin: '0 0.4rem' }} />
        <button className="secondary" onClick={mm.undo} disabled={!mm.canUndo}>↶ Undo</button>
        <button className="secondary" onClick={mm.redo} disabled={!mm.canRedo}>↷ Redo</button>
        <span style={{ borderRight: '1.5px dashed var(--color-ink)', margin: '0 0.4rem' }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem', fontWeight: 600 }}>
          Jarak node:
          <input
            type="range"
            min="0.5"
            max="2.5"
            step="0.1"
            value={spacing}
            onChange={(e) => setSpacing(parseFloat(e.target.value))}
            style={{ width: 110 }}
          />
          <span className="muted" style={{ minWidth: 32 }}>{spacing.toFixed(1)}x</span>
        </label>
        <span className="spacer" />
        <button className="secondary" onClick={() => handleExport('png')}>Export PNG</button>
        <button className="secondary" onClick={() => handleExport('pdf')}>Export PDF</button>
      </div>

      <div className="card yellow" style={{ marginBottom: '0.8rem', padding: '0.75rem 1rem', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="scribble" style={{ fontSize: '1.1rem' }}>cara edit:</span>
        <span><strong>Klik</strong> node = ubah teks · <strong>Enter</strong> simpan · <strong>Esc</strong> batal · <strong>Klik kanan</strong> = menu (tambah/hapus)</span>
      </div>

      <div ref={wrapRef} className="canvas-wrap">
        {mm.tree ? (
          layout === 'force-directed-radial'
            ? <MindMapForce
                tree={mm.tree}
                onEdit={handleEdit}
                onContextMenu={handleContextMenu}
                selectedPath={selectedPath}
                editingPath={editingPath}
                onCommitEdit={commitEdit}
                onCancelEdit={cancelEdit}
                spacing={spacing}
              />
            : layout === 'radial-cluster'
            ? <MindMapCluster
                tree={mm.tree}
                onEdit={handleEdit}
                onContextMenu={handleContextMenu}
                selectedPath={selectedPath}
                editingPath={editingPath}
                onCommitEdit={commitEdit}
                onCancelEdit={cancelEdit}
                spacing={spacing}
              />
            : <MindMapRadial
                tree={mm.tree}
                onEdit={handleEdit}
                onContextMenu={handleContextMenu}
                selectedPath={selectedPath}
                editingPath={editingPath}
                onCommitEdit={commitEdit}
                onCancelEdit={cancelEdit}
                spacing={spacing}
              />
        ) : (
          <div className="empty-hint">Mind map kosong</div>
        )}
      </div>

      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          onAddChild={ctxAddChild}
          onRename={ctxRename}
          onDelete={ctxDelete}
          onClose={() => setCtxMenu(null)}
        />
      )}

      <div className="row" style={{ marginTop: '1rem', gap: '1rem', flexWrap: 'wrap' }}>
        <div className="card" style={{ flex: '1 1 320px' }}>
          <span className="tag yellow">Node terpilih</span>
          <h3 style={{ marginTop: 8 }}>{selected ? selected.concept : '— belum ada —'}</h3>
          <p className="muted">
            Klik node untuk edit teksnya. Klik kanan untuk menambah anak atau menghapus node.
          </p>
        </div>
        <div className="card blue" style={{ flex: '1 1 280px' }}>
          <span className="tag">Teks sumber</span>
          <p style={{ marginTop: 8, maxHeight: 140, overflow: 'auto' }}>
            {project?.source_text}
          </p>
        </div>
      </div>
    </div>
  );
}
