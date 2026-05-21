/**
 * MindMapForce.jsx - Force-Directed + konstrain radial.
 *
 * Fitur:
 *   - Force simulation dengan radial constraint per depth
 *   - Drag node → fx/fy fixed (simulation honors), atau click (kalau distance < 5px)
 *   - Klik kanan → context menu
 *   - Slider spacing kontrol radius & collide
 */

import { useEffect, useRef } from 'react';
import * as d3 from 'd3';

const BRANCH_COLORS = [
  'var(--branch-1)', 'var(--branch-2)', 'var(--branch-3)',
  'var(--branch-4)', 'var(--branch-5)', 'var(--branch-6)'
];

function arrEq(a, b) {
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

function flatten(node, parentId = null, list = [], links = [], path = []) {
  const id = path.join('.') || 'root';
  list.push({ id, data: node, depth: node.level ?? 0, path });
  if (parentId !== null) links.push({ source: parentId, target: id });
  (node.children || []).forEach((c, i) => flatten(c, id, list, links, [...path, i]));
  return { nodes: list, links };
}

export default function MindMapForce({
  tree, onEdit, onContextMenu, selectedPath = [], editingPath,
  onCommitEdit, onCancelEdit, spacing = 1.0
}) {
  const svgRef = useRef(null);

  useEffect(() => {
    if (!tree) return;
    const radiusStep = 150 * spacing;
    const { nodes, links } = flatten(tree);

    nodes.forEach(n => {
      const fontSize = n.depth === 0 ? 16 : (n.depth === 1 ? 13 : 11);
      const len = (n.data.concept || '').length;
      n.w = Math.max(80, len * (fontSize * 0.55) + 24);
      n.h = Math.max(28, fontSize + 16);
      n.r = Math.hypot(n.w / 2, n.h / 2) + 8;
    });

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    svg.append('defs').append('style').text(`
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
      }
    `);

    const g = svg.append('g');

    const linkSel = g.append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', d => {
        const sNode = nodes.find(n => n.id === d.source);
        return BRANCH_COLORS[(sNode?.depth || 0) % BRANCH_COLORS.length];
      })
      .attr('stroke-width', 1.6)
      .attr('opacity', 0.7);

    const nodeSel = g.append('g')
      .selectAll('g.node-group')
      .data(nodes)
      .join('g')
      .attr('class', d => 'node-group' + (arrEq(d.path, selectedPath) ? ' selected' : ''))
      .style('cursor', 'pointer');

    nodeSel.each(function(d) {
      const grp = d3.select(this);
      const label = d.data.concept || '';
      const fontSize = d.depth === 0 ? 16 : (d.depth === 1 ? 13 : 11);
      const isEditing = arrEq(d.path, editingPath);
      const isSelected = arrEq(d.path, selectedPath);

      grp.append('rect').attr('class', 'node-shadow')
        .attr('x', -d.w / 2 + 3).attr('y', -d.h / 2 + 3).attr('rx', 14)
        .attr('width', d.w).attr('height', d.h)
        .attr('fill', 'var(--color-ink)').attr('opacity', 0.9);
      grp.append('rect').attr('class', 'node-rect')
        .attr('x', -d.w / 2).attr('y', -d.h / 2).attr('rx', 14)
        .attr('width', d.w).attr('height', d.h)
        .attr('fill', isSelected ? 'var(--pink-tag)'
                                 : (d.depth === 0 ? '#fff' : BRANCH_COLORS[(d.depth - 1) % BRANCH_COLORS.length]))
        .attr('stroke', isSelected ? 'var(--pink-strong)' : 'var(--color-ink)')
        .attr('stroke-width', isSelected ? 3 : 1.5);

      if (isEditing) {
        grp.append('foreignObject')
          .attr('x', -d.w / 2 + 2).attr('y', -d.h / 2 + 2)
          .attr('width', d.w - 4).attr('height', d.h - 4)
          .append('xhtml:input')
          .attr('class', 'node-edit-input')
          .attr('style', `width:100%;height:100%;font-size:${fontSize}px`)
          .attr('value', label)
          .on('keydown', function(e) {
            e.stopPropagation();
            if (e.key === 'Enter') { e.preventDefault(); if (onCommitEdit) onCommitEdit(d.path, this.value); }
            else if (e.key === 'Escape') { if (onCancelEdit) onCancelEdit(); }
          })
          .on('click', e => e.stopPropagation())
          .on('blur', function() { if (onCommitEdit) onCommitEdit(d.path, this.value); })
          .each(function() { setTimeout(() => { this.focus(); this.select(); }, 0); });
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

    const sim = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links)
        .id(d => d.id)
        .distance(d => (110 + d.target.depth * 30) * spacing)
        .strength(0.85))
      .force('charge', d3.forceManyBody().strength(-320 * spacing))
      .force('center', d3.forceCenter(0, 0))
      .force('radial', d3.forceRadial(d => d.depth * radiusStep, 0, 0).strength(0.55))
      .force('collide', d3.forceCollide().radius(d => d.r * spacing).iterations(3))
      .alphaDecay(0.02);

    sim.on('tick', () => {
      linkSel
        .attr('x1', d => d.source.x).attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
      nodeSel.attr('transform', d => `translate(${d.x},${d.y})`);
    });

    sim.on('end', () => {
      try {
        const bbox = g.node().getBBox();
        const pad = 50;
        svg.attr('viewBox',
          `${bbox.x - pad} ${bbox.y - pad} ${bbox.width + pad * 2} ${bbox.height + pad * 2}`);
      } catch (e) { /* ignore */ }
    });

    // ---- Drag handler (zoom-aware, smooth, ikut kursor) ----
    // subject=datum -> drag relatif posisi node; container=g -> koordinat
    // event sudah di local SVG (zoom-aware). alphaTarget kecil (0.05) saat
    // drag supaya simulation tidak agresif menarik node ke posisi radial
    // ("muter ke bawah dulu" disebabkan oleh alphaTarget 0.25).
    const drag = d3.drag()
      .subject(function(_e, d) { return { x: d.x, y: d.y }; })
      .container(function() { return g.node(); })
      .on('start', function(e, d) {
        d.__dragStart = { x: e.x, y: e.y, moved: false };
        if (!e.active) sim.alphaTarget(0.05).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', function(e, d) {
        const dx = e.x - d.__dragStart.x;
        const dy = e.y - d.__dragStart.y;
        if (!d.__dragStart.moved && Math.hypot(dx, dy) < 5) return;
        d.__dragStart.moved = true;
        // langsung set posisi node ke koordinat kursor (sudah zoom-aware
        // karena container=g)
        d.fx = e.x;
        d.fy = e.y;
      })
      .on('end', function(e, d) {
        if (!e.active) sim.alphaTarget(0);
        if (!d.__dragStart.moved) {
          d.fx = null; d.fy = null;
          if (onEdit) onEdit(d.path);
        }
        // node tetap di-pin di posisi drag akhir supaya tidak melesat
      });
    nodeSel.call(drag);

    nodeSel.on('contextmenu', (e, d) => {
      e.preventDefault();
      if (onContextMenu) onContextMenu(d.path, e.pageX, e.pageY);
    });

    const zoom = d3.zoom().scaleExtent([0.3, 3])
      .filter(e => !e.target.closest('input') && !e.target.closest('.node-group'))
      .on('zoom', e => g.attr('transform', e.transform));
    svg.call(zoom);

    return () => sim.stop();
  }, [tree, selectedPath, editingPath, onEdit, onContextMenu, onCommitEdit, onCancelEdit, spacing]);

  return <svg ref={svgRef} width="100%" height="100%" style={{ display: 'block' }} />;
}
