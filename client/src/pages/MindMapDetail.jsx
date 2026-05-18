/**
 * MindMapDetail.jsx - Editor & Visualisasi Mind Map (L-05, L-06, L-07).
 *
 * Menggabungkan modul:
 *   - MFE-03 Visualisasi (Reingold-Tilford radial)
 *   - MFE-04 Perbandingan layout (toggle Force-Directed)
 *   - MFE-05 Editor (tambah / rename / hapus node)
 *   - MFE-06 Undo / Redo
 *   - MFE-08 Ekspor (PNG / PDF)
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import MindMapRadial from '../components/Mindmap/MindMapRadial';
import MindMapForce from '../components/Mindmap/MindMapForce';
import { exportPNG, exportPDF } from '../components/Mindmap/exportUtils';
import { Projects } from '../services/api';
import useMindMap from '../state/useMindMap';

const LAYOUTS = [
  { id: 'reingold-tilford-radial', label: 'Reingold-Tilford' },
  { id: 'force-directed-radial',   label: 'Force-Directed' },
];

/**
 * Helper: ambil node by path.
 */
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
  const [selectedPath, setSelectedPath] = useState([]);
  const [layout, setLayout] = useState('reingold-tilford-radial');
  const [saveState, setSaveState] = useState('saved'); // saved | saving | dirty
  const wrapRef = useRef(null);

  const mm = useMindMap(null);

  // ---- load project ----
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

  // ---- mark dirty when tree changes from initial ----
  useEffect(() => {
    if (!project || !mm.tree) return;
    const serverTree = JSON.stringify(project.mindmap);
    const localTree = JSON.stringify(mm.tree);
    if (serverTree !== localTree) setSaveState('dirty');
  }, [mm.tree, project]);

  const selected = useMemo(() => mm.tree ? nodeAt(mm.tree, selectedPath) : null, [mm.tree, selectedPath]);

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

  function addChild() {
    mm.addChild(selectedPath, 'Konsep baru');
  }
  function deleteSelected() {
    if (!selectedPath.length) return;
    mm.remove(selectedPath);
    setSelectedPath([]);
  }
  function renameSelected() {
    const next = prompt('Ubah concept:', selected?.concept || '');
    if (next && next.trim()) mm.rename(selectedPath, next.trim());
  }

  function handleExport(kind) {
    const svg = wrapRef.current?.querySelector('svg');
    if (!svg) return;
    if (kind === 'png') exportPNG(svg, `${project?.title || 'mindmap'}.png`);
    else exportPDF(svg, project?.title || 'Mind Map');
  }

  if (busy) return <div className="container page"><p className="muted">Memuat...</p></div>;
  if (err)  return <div className="container page"><div className="alert error">{err}</div></div>;

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
        <button className="ghost" onClick={addChild}>+ Sub-konsep</button>
        <button className="ghost" onClick={renameSelected} disabled={!selected}>Rename</button>
        <button className="ghost" onClick={deleteSelected} disabled={!selectedPath.length}>Hapus</button>
        <span className="spacer" />
        <button className="secondary" onClick={() => handleExport('png')}>Export PNG</button>
        <button className="secondary" onClick={() => handleExport('pdf')}>Export PDF</button>
      </div>

      <div ref={wrapRef} className="canvas-wrap" style={{ height: '70vh' }}>
        {mm.tree ? (
          layout === 'force-directed-radial'
            ? <MindMapForce  tree={mm.tree} onSelect={setSelectedPath} />
            : <MindMapRadial tree={mm.tree} onSelect={setSelectedPath} selectedPath={selectedPath} />
        ) : (
          <div className="empty-hint">Mind map kosong</div>
        )}
      </div>

      <div className="row" style={{ marginTop: '1rem', gap: '1rem', flexWrap: 'wrap' }}>
        <div className="card" style={{ flex: '1 1 320px' }}>
          <span className="tag yellow">Node terpilih</span>
          <h3 style={{ marginTop: 8 }}>{selected ? selected.concept : '— belum ada —'}</h3>
          <p className="muted">
            Klik node pada kanvas untuk memilih, lalu gunakan toolbar untuk edit, hapus, atau tambah sub-konsep.
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
