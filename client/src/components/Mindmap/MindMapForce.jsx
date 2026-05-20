/**
 * MindMapForce.jsx - Force-Directed dengan konstrain radial.
 *
 * Sama dengan MindMapRadial dari sisi interaksi:
 *   - klik       -> onEdit(path)
 *   - klik kanan -> onContextMenu(path, x, y)
 *   - selected   -> outline pink + pulse
 *   - editing    -> foreignObject input
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
  tree, onEdit, onContextMenu, selectedPath = [], editingPath, onCommitEdit, onCancelEdit
}) {
  const svgRef = useRef(null);

  useEffect(() => {
    if (!tree) return;
    const width = 900;
    const height = 700;
    const { nodes, links } = flatten(tree);
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    svg.attr('viewBox', `${-width / 2} ${-height / 2} ${width} ${height}`);

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
      .style('cursor', 'pointer')
      .on('click', (e, d) => { e.stopPropagation(); if (onEdit) onEdit(d.path); })
      .on('contextmenu', (e, d) => { e.preventDefault(); if (onContextMenu) onContextMenu(d.path, e.pageX, e.pageY); });

    nodeSel.each(function(d) {
      const grp = d3.select(this);
      const label = d.data.concept || '';
      const fontSize = d.depth === 0 ? 16 : (d.depth === 1 ? 13 : 11);
      const tmp = grp.append('text').style('font-size', `${fontSize}px`).text(label);
      const bbox = tmp.node().getBBox(); tmp.remove();
      const w = Math.max(80, bbox.width + 24);
      const h = Math.max(28, bbox.height + 14);
      const isEditing = arrEq(d.path, editingPath);
      const isSelected = arrEq(d.path, selectedPath);

      grp.append('rect')
        .attr('class', 'node-shadow')
        .attr('x', -w / 2 + 3).attr('y', -h / 2 + 3)
        .attr('width', w).attr('height', h).attr('rx', 14)
        .attr('fill', 'var(--color-ink)').attr('opacity', 0.9);
      grp.append('rect')
        .attr('class', 'node-rect')
        .attr('x', -w / 2).attr('y', -h / 2)
        .attr('width', w).attr('height', h).attr('rx', 14)
        .attr('fill', isSelected ? 'var(--pink-tag)'
                                 : (d.depth === 0 ? '#fff' : BRANCH_COLORS[(d.depth - 1) % BRANCH_COLORS.length]))
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
            if (e.key === 'Enter') { e.preventDefault(); if (onCommitEdit) onCommitEdit(d.path, this.value); }
            else if (e.key === 'Escape') { if (onCancelEdit) onCancelEdit(); }
          })
          .on('click', e => e.stopPropagation())
          .on('blur', function() { if (onCommitEdit) onCommitEdit(d.path, this.value); })
          .each(function() { setTimeout(() => { this.focus(); this.select(); }, 0); });
      } else {
        grp.append('text')
          .attr('class', 'node-text')
          .style('font-size', `${fontSize}px`)
          .text(label);
      }
    });

    const sim = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id(d => d.id).distance(d => 80 + d.target.depth * 18).strength(0.8))
      .force('charge', d3.forceManyBody().strength(-260))
      .force('center', d3.forceCenter(0, 0))
      .force('radial', d3.forceRadial(d => d.depth * 130, 0, 0).strength(0.6))
      .force('collide', d3.forceCollide().radius(60));

    sim.on('tick', () => {
      linkSel
        .attr('x1', d => d.source.x).attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
      nodeSel.attr('transform', d => `translate(${d.x},${d.y})`);
    });

    svg.call(d3.zoom().scaleExtent([0.4, 2.5])
      .filter(e => !e.target.closest('input'))
      .on('zoom', e => g.attr('transform', e.transform)));

    return () => sim.stop();
  }, [tree, selectedPath, editingPath, onEdit, onContextMenu, onCommitEdit, onCancelEdit]);

  return <svg ref={svgRef} width="100%" height="100%" style={{ display: 'block' }} />;
}
