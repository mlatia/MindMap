/**
 * MindMapRadial.jsx - Modul Visualisasi Mind Map (MFE-03)
 *
 * Render mind map dengan algoritma Reingold-Tilford radial (d3.tree).
 * Interaksi:
 *   - klik node       -> onEdit(path)   (mode edit inline)
 *   - klik kanan node -> onContextMenu(path, x, y)
 *   - hover           -> highlight pink halus
 *   - selected        -> pulse animation + outline pink-strong
 *   - editing         -> foreignObject <input> dengan auto-focus
 *
 * @prop {object} tree
 * @prop {(path:number[])=>void} onEdit       - dipicu saat node diklik (untuk masuk edit mode)
 * @prop {(path:number[], x:number, y:number)=>void} onContextMenu
 * @prop {number[]} [selectedPath]            - node yang sedang dipilih (highlight)
 * @prop {number[]} [editingPath]             - node yang sedang di-edit (foreignObject input)
 * @prop {(path:number[], value:string)=>void} onCommitEdit
 * @prop {()=>void} onCancelEdit
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
  tree, onEdit, onContextMenu, selectedPath = [], editingPath, onCommitEdit, onCancelEdit
}) {
  const svgRef = useRef(null);

  useEffect(() => {
    if (!tree) return;
    annotatePath(tree);
    const width = 900;
    const height = 700;
    const radius = Math.min(width, height) / 2 - 80;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    svg.attr('viewBox', `${-width / 2} ${-height / 2} ${width} ${height}`);

    // ---- defs: gradient + filter ----
    const defs = svg.append('defs');
    defs.append('style').text(`
      .node-rect { transition: stroke 180ms ease, stroke-width 180ms ease, transform 220ms ease; }
      .node-shadow { transition: opacity 180ms ease; }
      .node-group:hover .node-rect { stroke: var(--pink-strong); }
      .node-group.selected .node-rect {
        stroke: var(--pink-strong);
        stroke-width: 3.5;
        animation: mm-pulse 1.4s ease-in-out infinite;
      }
      @keyframes mm-pulse {
        0%, 100% { filter: drop-shadow(0 0 0 var(--pink-strong)); }
        50%      { filter: drop-shadow(0 0 6px var(--pink-strong)); }
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
    const layout = d3.tree()
      .size([2 * Math.PI, radius])
      .separation((a, b) => (a.parent === b.parent ? 1 : 1.6) / Math.max(a.depth, 1));
    layout(root);

    // ---- Links: radial diagonal ----
    g.append('g')
      .selectAll('path')
      .data(root.links())
      .join('path')
        .attr('class', 'link')
        .attr('stroke', d => BRANCH_COLORS[(d.source.depth) % BRANCH_COLORS.length])
        .attr('stroke-width', d => Math.max(1.2, 3.5 - d.target.depth * 0.7))
        .attr('d', d3.linkRadial()
          .angle(d => d.x)
          .radius(d => d.y));

    // ---- Nodes ----
    const node = g.append('g')
      .selectAll('g.node-group')
      .data(root.descendants())
      .join('g')
        .attr('class', d => 'node-group' + (arrEq(d.data.__path, selectedPath) ? ' selected' : ''))
        .attr('transform', d => `rotate(${(d.x * 180 / Math.PI) - 90}) translate(${d.y},0)`)
        .style('cursor', 'pointer')
        .on('click', (e, d) => {
          e.stopPropagation();
          if (onEdit) onEdit(d.data.__path);
        })
        .on('contextmenu', (e, d) => {
          e.preventDefault();
          if (onContextMenu) onContextMenu(d.data.__path, e.pageX, e.pageY);
        });

    // gambar node (rotate balik agar text horizontal)
    node.each(function(d) {
      const grp = d3.select(this).append('g')
        .attr('transform', `rotate(${90 - (d.x * 180 / Math.PI)})`);

      const label = d.data.concept || '';
      const fontSize = d.depth === 0 ? 18 : (d.depth === 1 ? 14 : 12);
      const padX = 14, padY = 8;
      const isEditing = arrEq(d.data.__path, editingPath);

      // ukur teks
      const tmp = grp.append('text').style('font-size', `${fontSize}px`).text(label);
      const bbox = tmp.node().getBBox();
      tmp.remove();
      const w = Math.max(80, bbox.width + padX * 2 + 8);
      const h = Math.max(30, bbox.height + padY * 2);

      const isSelected = arrEq(d.data.__path, selectedPath);
      const fill = d.depth === 0 ? '#fff'
                  : BRANCH_COLORS[(d.depth - 1) % BRANCH_COLORS.length];

      // shadow (sticky-note effect)
      grp.append('rect')
        .attr('class', 'node-shadow')
        .attr('x', -w / 2 + 3).attr('y', -h / 2 + 3)
        .attr('width', w).attr('height', h)
        .attr('rx', 14)
        .attr('fill', 'var(--color-ink)')
        .attr('opacity', 0.9);

      // main rect
      grp.append('rect')
        .attr('class', 'node-rect')
        .attr('x', -w / 2).attr('y', -h / 2)
        .attr('width', w).attr('height', h)
        .attr('rx', 14)
        .attr('fill', isSelected ? 'var(--pink-tag)' : fill)
        .attr('stroke', isSelected ? 'var(--pink-strong)' : 'var(--color-ink)')
        .attr('stroke-width', isSelected ? 3 : 1.5);

      if (isEditing) {
        // foreignObject input
        grp.append('foreignObject')
          .attr('x', -w / 2 + 2).attr('y', -h / 2 + 2)
          .attr('width', w - 4).attr('height', h - 4)
          .append('xhtml:input')
          .attr('class', 'node-edit-input')
          .attr('style', `width:100%;height:100%;font-size:${fontSize}px`)
          .attr('value', label)
          .on('keydown', function(e) {
            e.stopPropagation();
            if (e.key === 'Enter') {
              e.preventDefault();
              if (onCommitEdit) onCommitEdit(d.data.__path, this.value);
            } else if (e.key === 'Escape') {
              if (onCancelEdit) onCancelEdit();
            }
          })
          .on('click', function(e) { e.stopPropagation(); })
          .on('blur', function() {
            if (onCommitEdit) onCommitEdit(d.data.__path, this.value);
          })
          .each(function() {
            setTimeout(() => { this.focus(); this.select(); }, 0);
          });
      } else {
        grp.append('text')
          .attr('class', 'node-text')
          .style('font-size', `${fontSize}px`)
          .text(label);
      }
    });

    // ---- Zoom & pan ----
    const zoom = d3.zoom()
      .scaleExtent([0.4, 2.5])
      .filter(e => !e.target.closest('input'))
      .on('zoom', (e) => g.attr('transform', e.transform));
    svg.call(zoom);
  }, [tree, selectedPath, editingPath, onEdit, onContextMenu, onCommitEdit, onCancelEdit]);

  return (
    <svg ref={svgRef} width="100%" height="100%" style={{ display: 'block' }} />
  );
}
