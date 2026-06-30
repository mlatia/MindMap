/**
 * exportUtils.js - Modul Ekspor (MFE-08)
 *
 * Export SVG kanvas mind map ke PNG / PDF.
 *
 * Fix Reingold-Tilford PNG yang "tidak sesuai":
 *   - Masalah: SVG punya struktur <svg><g class="zoom-root" transform="...">...</g></svg>
 *     Saat user zoom/pan, transform di .zoom-root berubah. Bila kita clone
 *     tanpa reset transform, konten di clone ke-shift oleh transform tersebut,
 *     sementara viewBox sudah kita hitung dari bbox dalam koordinat lokal g.
 *   - Solusi: di clone, set transform="" di .zoom-root (dan child g zoom),
 *     supaya bbox cocok dengan viewBox yang kita kalkulasi.
 *   - Bbox dihitung dari elemen ASLI (yang sudah render di DOM), bukan clone.
 */

const COLOR_VARS = [
  '--color-ink','--color-bg','--color-surface',
  '--branch-1','--branch-2','--branch-3','--branch-4','--branch-5','--branch-6',
  '--pink-strong','--pink-tag','--note-yellow','--note-blue','--note-pink','--note-mint'
];

function resolveColors() {
  const styles = getComputedStyle(document.documentElement);
  const map = {};
  for (const v of COLOR_VARS) map[v] = (styles.getPropertyValue(v) || '').trim() || '#000';
  return map;
}

function inlineCssVars(svgString) {
  const colors = resolveColors();
  return svgString.replace(/var\((--[\w-]+)\)/g, (_, k) => colors[k] || '#000');
}

/**
 * Bangun SVG string siap export.
 *
 * Langkah:
 *   1. Temukan root group (.zoom-root atau g pertama).
 *   2. Hitung bbox di koordinat LOKAL g (tanpa zoom transform).
 *      Caranya: temporary set transform="" di g asli, panggil getBBox(),
 *      lalu restore transform-nya.
 *   3. Clone SVG, reset transform di clone-nya, set viewBox = bbox + padding.
 *   4. Insert white background rect.
 *   5. Inline CSS variables ke nilai konkret.
 */
function buildExportSvg(svgEl, padding = 50) {
  const inner = svgEl.querySelector('g.zoom-root') || svgEl.querySelector('g');
  if (!inner) {
    return { svgString: inlineCssVars(new XMLSerializer().serializeToString(svgEl)), W: 1200, H: 800 };
  }

  // ---- Hitung bbox dalam koordinat lokal (reset transform sementara) ----
  const savedTransform = inner.getAttribute('transform') || '';
  inner.setAttribute('transform', '');  // reset agar bbox = lokal coords

  let bbox;
  try { bbox = inner.getBBox(); }
  catch { bbox = { x: -500, y: -350, width: 1000, height: 700 }; }

  // restore segera
  if (savedTransform) inner.setAttribute('transform', savedTransform);
  else inner.removeAttribute('transform');

  if (!isFinite(bbox.width) || bbox.width <= 0) {
    bbox = { x: -500, y: -350, width: 1000, height: 700 };
  }

  const W = Math.ceil(bbox.width + padding * 2);
  const H = Math.ceil(bbox.height + padding * 2);
  const xMin = Math.floor(bbox.x - padding);
  const yMin = Math.floor(bbox.y - padding);

  // ---- Clone SVG + reset transform di group ----
  const clone = svgEl.cloneNode(true);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  clone.setAttribute('viewBox', `${xMin} ${yMin} ${W} ${H}`);
  clone.setAttribute('width', W);
  clone.setAttribute('height', H);
  clone.removeAttribute('style'); // hapus style display:block dll

  // Reset transform di SEMUA group level atas supaya tidak ada shift
  const cloneInner = clone.querySelector('g.zoom-root') || clone.querySelector('g');
  if (cloneInner) cloneInner.removeAttribute('transform');

  // Hilangkan animasi pulse supaya tidak burn-in
  const styleEl = clone.querySelector('defs style');
  if (styleEl) {
    styleEl.textContent = styleEl.textContent
      .replace(/animation:\s*[^;]+;?/g, '')
      .replace(/@keyframes[\s\S]*?\}\s*\}/g, '');
  }

  // Background putih di belakang konten
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('x', xMin);
  bg.setAttribute('y', yMin);
  bg.setAttribute('width', W);
  bg.setAttribute('height', H);
  bg.setAttribute('fill', '#FFFFFF');
  clone.insertBefore(bg, clone.firstChild);

  // Pastikan SEMUA garis cabang (edge) HITAM persis seperti tampilan visualisasi,
  // apa pun algoritma yang dipilih (node tetap mengikuti warna di tampilan).
  // Edge selalu berupa <path>/<line> dengan fill="none" atau berkelas "link".
  clone.querySelectorAll('path, line').forEach((el) => {
    if (el.classList.contains('link') || el.getAttribute('fill') === 'none') {
      el.setAttribute('stroke', '#0A0A0A');
      el.setAttribute('opacity', '0.85');
    }
  });
  // Node pada hasil unduhan dibuat PUTIH semua (bukan berwarna). Stroke tetap
  // (root tetap memakai stroke berwarna + lebih tebal sebagai penanda pusat).
  clone.querySelectorAll('rect.node-rect').forEach((r) => {
    r.setAttribute('fill', '#FFFFFF');
  });

  return { svgString: inlineCssVars(new XMLSerializer().serializeToString(clone)), W, H };
}

/**
 * Export ke PNG (2× DPI) dan trigger download.
 */
export async function exportPNG(svgEl, filename = 'mindmap.png') {
  if (!svgEl) return;
  const { svgString, W, H } = buildExportSvg(svgEl, 60);

  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
    img.src = url;
  });

  const dpi = 2;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(W * dpi);
  canvas.height = Math.round(H * dpi);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(url);

  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = filename;
  a.click();
}

/**
 * Export ke PDF lewat jendela print, dipaksa muat 1 halaman A4.
 */
export function exportPDF(svgEl, title = 'Mind Map') {
  if (!svgEl) return;
  const { svgString, W, H } = buildExportSvg(svgEl, 60);
  const isLandscape = W > H;

  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(`<!doctype html><html><head>
    <meta charset="utf-8">
    <title>${title}</title>
    <style>
      @page { size: A4 ${isLandscape ? 'landscape' : 'portrait'}; margin: 8mm; }
      html, body {
        margin: 0; padding: 0; background: white;
        font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
        width: 100%; height: 100%;
      }
      .page {
        width: 100%; height: 100vh;
        display: flex; flex-direction: column;
        align-items: center; justify-content: flex-start;
        padding: 4mm 0;
        box-sizing: border-box;
        page-break-inside: avoid; break-inside: avoid;
      }
      h1 {
        font-size: 14pt; margin: 0 0 4mm;
        text-align: center; font-weight: 800; letter-spacing: -0.01em;
      }
      .svg-wrap {
        flex: 1; width: 100%;
        display: flex; align-items: center; justify-content: center;
        overflow: hidden;
      }
      svg {
        width: 100%; height: 100%;
        max-width: 100%; max-height: 100%;
        object-fit: contain;
      }
      @media print {
        @page { size: A4 ${isLandscape ? 'landscape' : 'portrait'}; margin: 8mm; }
        .page { height: 100vh; page-break-after: avoid; }
      }
    </style></head><body>
    <div class="page">
      <h1>${title.replace(/</g, '&lt;')}</h1>
      <div class="svg-wrap">${svgString}</div>
    </div>
    <script>window.onload = () => setTimeout(() => window.print(), 400);</script>
    </body></html>`);
  win.document.close();
}
