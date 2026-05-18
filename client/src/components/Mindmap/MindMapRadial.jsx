/**
 * MindMapRadial.jsx - Modul Visualisasi Mind Map (MFE-03)
 *
 * Render mind map dengan algoritma Reingold-Tilford radial (d3.tree).
 * Mendukung:
 *   - zoom & pan (d3-zoom)
 *   - klik node → onSelect(path)
 *   - styling sticky-note sesuai desain portofolio (warna pastel per cabang)
 *
 * @prop {object} tree    - { concept, level, children }
 * @prop {(path:number[])=>void} onSelect
 * @prop {number[]} [selectedPath]
 */

import { useEffect, useRef } from 'react';
import * as d3 from 'd3';

const BRANCH_COLORS = [
  'var(--branch-1)', 'var(--branch-2)', 'var(--branch-3)',
  'var(--branch-4)', 'var(--branch-5)', 'var(--branch-6)'
];

/**
 * Konversi hierarki ke d3.hierarchy dengan property `path` untuk lookup balik.
 */
function annotatePath(node, path = []) {
  node.__path = path;
  (node.children || []).forEach((c, i) => annotatePath(c, [...path, i]));
}

export default function MindMapRadial({ tree, onSelect, selectedPath = [] }) {
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
      .selectAll('g')
      .data(root.descendants())
      .join('g')
        .attr('transform', d => `rotate(${(d.x * 180 / Math.PI) - 90}) translate(${d.y},0)`)
        .style('cursor', 'pointer')
        .on('click', (_e, d) => {
          if (onSelect) onSelect(d.data.__path);
        });

    // sticky-note rect (rotate-counter agar tetap horizontal)
    node.append('g')
      .attr('transform', d => `rotate(${90 - (d.x * 180 / Math.PI)})`)
      .each(function(d) {
        const grp = d3.select(this);
        const label = d.data.concept || '';
        const padX = 14;
        const padY = 8;
        const fontSize = d.depth === 0 ? 18 : (d.depth === 1 ? 14 : 12);

        // ukur teks
        const text = grp.append('text')
          .attr('class', 'node-text')
          .style('font-size', `${fontSize}px`)
          .text(label);
        const bbox = text.node().getBBox();
        text.remove();

        const w = Math.max(70, bbox.width + padX * 2);
        const h = Math.max(28, bbox.height + padY * 2);

        const isSelected = JSON.stringify(d.data.__path) === JSON.stringify(selectedPath);
        const fill = d.depth === 0 ? '#fff'
                    : BRANCH_COLORS[(d.depth - 1) % BRANCH_COLORS.length];

        grp.append('rect')
          .attr('class', 'node-rect')
          .attr('x', -w / 2)
          .attr('y', -h / 2)
          .attr('width', w)
          .attr('height', h)
          .attr('fill', fill)
          .attr('stroke', isSelected ? 'var(--pink-strong)' : 'var(--color-ink)')
          .attr('stroke-width', isSelected ? 3 : 1.5);

        // sticky-note shadow effect (offset rect)
        grp.insert('rect', 'rect')
          .attr('x', -w / 2 + 3)
          .attr('y', -h / 2 + 3)
          .attr('width', w)
          .attr('height', h)
          .attr('fill', 'var(--color-ink)')
          .attr('rx', 14)
          .attr('opacity', 0.95);
        // re-add foreground rect on top
        grp.append('rect')
          .attr('class', 'node-rect')
          .attr('x', -w / 2)
          .attr('y', -h / 2)
          .attr('width', w)
          .attr('height', h)
          .attr('fill', fill)
          .attr('stroke', isSelected ? 'var(--pink-strong)' : 'var(--color-ink)')
          .attr('stroke-width', isSelected ? 3 : 1.5);

        grp.append('text')
          .attr('class', 'node-text')
          .style('font-size', `${fontSize}px`)
          .text(label);
      });

    // ---- Zoom & pan ----
    const zoom = d3.zoom()
      .scaleExtent([0.4, 2.5])
      .on('zoom', (e) => g.attr('transform', e.transform));
    svg.call(zoom);
  }, [tree, selectedPath, onSelect]);

  return (
    <svg
      ref={svgRef}
      width="100%"
      height="100%"
      style={{ display: 'block' }}
    />
  );
}
