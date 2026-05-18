/**
 * exportUtils.js - Modul Ekspor (MFE-08)
 *
 * Konversi SVG kanvas mind map menjadi PNG (file download) atau
 * membuka jendela print untuk diekspor ke PDF. Tidak menggunakan
 * library tambahan agar bundle ringan; CSS variables di-resolve
 * lebih dulu agar warna dapat dibaca canvas.
 */

const COLOR_VARS = [
  '--color-ink','--color-bg','--branch-1','--branch-2','--branch-3',
  '--branch-4','--branch-5','--branch-6','--pink-strong'
];

/**
 * Ambil nilai aktual semua CSS variables.
 */
function resolveColors() {
  const styles = getComputedStyle(document.documentElement);
  const map = {};
  for (const v of COLOR_VARS) map[v] = styles.getPropertyValue(v).trim();
  return map;
}

/**
 * Ganti seluruh `var(--xxx)` di string SVG menjadi nilai konkret.
 */
function inlineCssVars(svgString) {
  const colors = resolveColors();
  return svgString.replace(/var\((--[\w-]+)\)/g, (_, k) =>
    colors[k] || '#000');
}

/**
 * Export SVG ke PNG dan download.
 * @param {SVGSVGElement} svgEl
 * @param {string} filename
 */
export async function exportPNG(svgEl, filename = 'mindmap.png') {
  if (!svgEl) return;
  const clone = svgEl.cloneNode(true);
  const serializer = new XMLSerializer();
  let svgString = serializer.serializeToString(clone);
  svgString = inlineCssVars(svgString);
  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
    img.src = url;
  });
  const width = svgEl.clientWidth || 1200;
  const height = svgEl.clientHeight || 800;
  const canvas = document.createElement('canvas');
  canvas.width = width * 2;
  canvas.height = height * 2;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(url);

  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = filename;
  a.click();
}

/**
 * Export ke PDF lewat jendela print (tanpa dependensi tambahan).
 */
export function exportPDF(svgEl, title = 'Mind Map') {
  if (!svgEl) return;
  const serializer = new XMLSerializer();
  const svgString = inlineCssVars(serializer.serializeToString(svgEl));
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(`<!doctype html><html><head><title>${title}</title>
    <style>body{margin:0;padding:24px;font-family:sans-serif}</style></head>
    <body>${svgString}<script>window.onload=()=>setTimeout(()=>window.print(),200)</script>
    </body></html>`);
  win.document.close();
}
