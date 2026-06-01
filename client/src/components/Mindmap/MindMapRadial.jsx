/**
 * MindMapRadial.jsx - Modul Visualisasi Mind Map (MFE-03)
 *
 * Fitur:
 *   - Reingold-Tilford radial dengan auto-fit viewBox
 *   - Klik node → onEdit (kalau drag distance < 5px)
 *   - Drag node → reposisi individual; link otomatis re-routed
 *   - Klik kanan → onContextMenu
 *   - Slider 'spacing' kontrol radius layout global
 *   - Text-anchor + dominant-baseline diset sebagai attribute biar
 *     centered di export PNG/PDF
 */

import { useEffect, useRef } from 'react';
import * as d3 from 'd3';

const BRANCH_COLORS = [
  'var(--branch-1)', 'var(--branch-2)', 'var(--branch-3)',
  'var(--branch-4)', 'var(--branch-5)', 'var(--branch-6)'
];

function annotatePath(node, path = []) {
  node.__path = path;
  (node.children || []).forEach((c, i) => annotatePath(c, [...path, i]));
}

function arrEq(a, b) {
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

export default function MindMapRadial({
  tree, onEdit, onContextMenu, selectedPath = [], editingPath,
  onCommitEdit, onCancelEdit, spacing = 1.0
}) {
  const svgRef = useRef(null);
  const dragOverrideRef = useRef(new Map()); // pathKey -> {x, y}

  useEffect(() => {
    if (!tree) return;
    annotatePath(tree);
    // Clear posisi override hasil drag sebelumnya supaya layout fresh
    // saat tree berubah (project switch, layout switch, atau spacing).
    dragOverrideRef.current = new Map();
    const baseRadius = 380 * spacing;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    // Set initial viewBox SEBELUM render konten -> mencegah konten muncul
    // di pojok kiri-atas saat switch dari Force-Directed ke Reingold-Tilford
    // (default SVG viewBox 0,0,300,150 membuat layout radial yang centered
    // di (0,0) ter-crop di kuadran kanan-bawah dari viewport).
    const initialSize = baseRadius * 2.5;
    svg.attr('viewBox',
      `${-initialSize / 2} ${-initialSize / 2} ${initialSize} ${initialSize}`);

    const defs = svg.append('defs');
    defs.append('style').text(`
      .node-rect { transition: stroke 180ms ease, stroke-width 180ms ease; }
      .node-group:hover .node-rect { stroke: var(--pink-strong); }
      .node-group.selected .node-rect {
        stroke: var(--pink-strong);
        stroke-width: 3.5;
        animation: mm-pulse 1.4s ease-in-out infinite;
      }
      @keyframes mm-pulse {
        0%, 100% { filter: drop-shadow(0 0 0 var(--pink-strong)); }
        50%      { filter: drop-shadow(0 0 8px var(--pink-strong)); }
      }
      .node-edit-input {
        font-family: 'Plus Jakarta Sans', sans-serif;
        font-weight: 700;
        text-align: center;
        border: 2px solid var(--pink-strong);
        border-radius: 10px;
        padding: 4px 8px;
        outline: none;
        background: white;
        color: var(--color-ink);
        box-shadow: 0 0 0 3px rgba(255,122,196,0.25);
      }
    `);

    const g = svg.append('g').attr('class', 'zoom-root');

    // ---- Reingold-Tilford radial ----
    const root = d3.hierarchy(tree, d => d.children);
    const sepFn = (a, b) => {
      const lenA = (a.data.concept || '').length;
      const lenB = (b.data.concept || '').length;
      const labelFactor = Math.max(1, (lenA + lenB) / 18);
      const base = a.parent === b.parent ? 1 : 2;
      return base * labelFactor / Math.max(a.depth, 1);
    };
    const layout = d3.tree().size([2 * Math.PI, baseRadius]).separation(sepFn);
    layout(root);

    // konversi polar → cartesian + apply user override drag
    root.descendants().forEach(d => {
      const pk = d.data.__path.join('.');
      const override = dragOverrideRef.current.get(pk);
      if (override) {
        d.cx = override.x;
        d.cy = override.y;
      } else {
        d.cx = Math.cos(d.x - Math.PI / 2) * d.y;
        d.cy = Math.sin(d.x - Math.PI / 2) * d.y;
      }
    });

    // ---- Links (line straight - karena posisi node bisa override) ----
    const linkSel = g.append('g').attr('class', 'links')
      .selectAll('path')
      .data(root.links())
      .join('path')
        .attr('class', 'link')
        .attr('fill', 'none')
        .attr('stroke', d => BRANCH_COLORS[(d.source.depth) % BRANCH_COLORS.length])
        .attr('stroke-width', d => Math.max(1.2, 3.5 - d.target.depth * 0.7))
        .attr('opacity', 0.75)
        .attr('d', d => linkPath(d.source, d.target));

    function linkPath(src, tgt) {
      // smooth bezier antara dua titik
      const mx = (src.cx + tgt.cx) / 2;
      const my = (src.cy + tgt.cy) / 2;
      return `M${src.cx},${src.cy} Q${mx},${my} ${tgt.cx},${tgt.cy}`;
    }

    // ---- Nodes ----
    const nodeSel = g.append('g')
      .selectAll('g.node-group')
      .data(root.descendants())
      .join('g')
        .attr('class', d => 'node-group' + (arrEq(d.data.__path, selectedPath) ? ' selected' : ''))
        .attr('transform', d => `translate(${d.cx},${d.cy})`)
        .style('cursor', 'pointer');

    nodeSel.each(function(d) {
      const grp = d3.select(this);
      const label = d.data.concept || '';
      const fontSize = d.depth === 0 ? 18 : (d.depth === 1 ? 14 : 12);
      const padX = 14, padY = 8;
      const isEditing = arrEq(d.data.__path, editingPath);

      const tmp = grp.append('text').attr('text-anchor', 'middle').attr('dominant-baseline', 'central').attr('font-family', "'Plus Jakarta Sans', sans-serif").attr('font-weight', 700).style('font-size', `${fontSize}px`).text(label);
      const bbox = tmp.node().getBBox(); tmp.remove();
      const w = Math.max(80, bbox.width + padX * 2 + 8);
      const h = Math.max(30, bbox.height + padY * 2);
      d.__w = w; d.__h = h;

      const isSelected = arrEq(d.data.__path, selectedPath);
      const fill = d.depth === 0 ? '#fff' : BRANCH_COLORS[(d.depth - 1) % BRANCH_COLORS.length];

      grp.append('rect').attr('class', 'node-shadow')
        .attr('x', -w / 2 + 3).attr('y', -h / 2 + 3).attr('rx', 14)
        .attr('width', w).attr('height', h)
        .attr('fill', 'var(--color-ink)').attr('opacity', 0.9);
      grp.append('rect').attr('class', 'node-rect')
        .attr('x', -w / 2).attr('y', -h / 2).attr('rx', 14)
        .attr('width', w).attr('height', h)
        .attr('fill', isSelected ? 'var(--pink-tag)' : fill)
        .attr('stroke', isSelected ? 'var(--pink-strong)' : 'var(--color-ink)')
        .attr('stroke-width', isSelected ? 3 : 1.5);

      if (isEditing) {
        grp.append('foreignObject')
          .attr('x', -w / 2 + 2).attr('y', -h / 2 + 2)
          .attr('width', w - 4).attr('height', h - 4)
          .append('xhtml:input')
          .attr('class', 'node-edit-input')
          .attr('style', `width:100%;height:100%;font-size:${fontSize}px`)
          .attr('value', label)
          .on('keydown', function(e) {
            e.stopPropagation();
            if (e.key === 'Enter') { e.preventDefault(); if (onCommitEdit) onCommitEdit(d.data.__path, this.value); }
            else if (e.key === 'Escape') { if (onCancelEdit) onCancelEdit(); }
          })
          .on('click', e => e.stopPropagation())
          .on('blur', function() { if (onCommitEdit) onCommitEdit(d.data.__path, this.value); })
          .each(function() {
            setTimeout(() => {
              this.focus();
              // taruh cursor di AKHIR teks, jangan select-all
              // supaya user bisa menambahkan/edit huruf tanpa harus tulis ulang
              const len = this.value.length;
              try { this.setSelectionRange(len, len); } catch (_) {}
            }, 0);
          });
      } else {
        grp.append('text').attr('class', 'node-text')
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'central')
          .attr('font-family', "'Plus Jakarta Sans', sans-serif")
          .attr('font-weight', 700)
          .attr('fill', 'var(--color-ink)')
          .style('font-size', `${fontSize}px`)
          .text(label);
      }
    });

    // ---- Drag handler (jarak < 5px = click, > 5px = move) ----
    // subject=datum dan container=g supaya event.x/y ada di koordinat
    // lokal g (zoom-aware), jadi node mengikuti kursor presisi.
    const drag = d3.drag()
      .subject(function(_e, d) { return { x: d.cx, y: d.cy }; })
      .container(function() { return g.node(); })
      .on('start', function(e, d) {
        d.__dragStart = { x: e.x, y: e.y, moved: false };
      })
      .on('drag', function(e, d) {
        const dx = e.x - d.__dragStart.x;
        const dy = e.y - d.__dragStart.y;
        if (!d.__dragStart.moved && Math.hypot(dx, dy) < 5) return;
        d.__dragStart.moved = true;
        d.cx = e.x;
        d.cy = e.y;
        const pk = d.data.__path.join('.');
        dragOverrideRef.current.set(pk, { x: e.x, y: e.y });
        d3.select(this).attr('transform', `translate(${d.cx},${d.cy})`);
        linkSel.attr('d', l => linkPath(l.source, l.target));
      })
      .on('end', function(_e, d) {
        if (!d.__dragStart.moved) {
          if (onEdit) onEdit(d.data.__path);
        }
      });
    nodeSel.call(drag);

    // klik kanan
    nodeSel.on('contextmenu', (e, d) => {
      e.preventDefault();
      if (onContextMenu) onContextMenu(d.data.__path, e.pageX, e.pageY);
    });

    // ---- Auto-fit viewBox (cuma di initial render, tidak reset saat drag) ----
    requestAnimationFrame(() => {
      try {
        const bbox = g.node().getBBox();
        const pad = 50;
        svg.attr('viewBox',
          `${bbox.x - pad} ${bbox.y - pad} ${bbox.width + pad * 2} ${bbox.height + pad * 2}`);
      } catch (e) { /* ignore */ }
    });

    // ---- Zoom & pan ----
    const zoom = d3.zoom()
      .scaleExtent([0.3, 3])
      .filter(e => !e.target.closest('input') && !e.target.closest('.node-group'))
      .on('zoom', (e) => g.attr('transform', e.transform));
    svg.call(zoom);
  }, [tree, selectedPath, editingPath, onEdit, onContextMenu, onCommitEdit, onCancelEdit, spacing]);

  return (
    <svg ref={svgRef} width="100%" height="100%" style={{ display: 'block' }} />
  );
}
