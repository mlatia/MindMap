/**
 * MindMapForce.jsx - Algoritma Force-Directed dengan konstrain radial.
 *
 * Implementasi FR-6: alternatif algoritma layout untuk evaluasi
 * komparatif terhadap Reingold-Tilford. Konstrain radial diterapkan
 * dengan d3.forceRadial sehingga node anak terdistribusi di ring
 * sekitar parent.
 */

import { useEffect, useRef } from 'react';
import * as d3 from 'd3';

const BRANCH_COLORS = [
  'var(--branch-1)', 'var(--branch-2)', 'var(--branch-3)',
  'var(--branch-4)', 'var(--branch-5)', 'var(--branch-6)'
];

function flatten(node, parentId = null, list = [], links = [], path = []) {
  const id = path.join('.') || 'root';
  list.push({ id, data: node, depth: node.level ?? 0, path });
  if (parentId !== null) links.push({ source: parentId, target: id });
  (node.children || []).forEach((c, i) => flatten(c, id, list, links, [...path, i]));
  return { nodes: list, links };
}

export default function MindMapForce({ tree, onSelect }) {
  const svgRef = useRef(null);

  useEffect(() => {
    if (!tree) return;
    const width = 900;
    const height = 700;

    const { nodes, links } = flatten(tree);
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    svg.attr('viewBox', `${-width / 2} ${-height / 2} ${width} ${height}`);
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
      .selectAll('g')
      .data(nodes)
      .join('g')
      .style('cursor', 'pointer')
      .on('click', (_e, d) => { if (onSelect) onSelect(d.path); });

    nodeSel.each(function(d) {
      const grp = d3.select(this);
      const label = d.data.concept || '';
      const fontSize = d.depth === 0 ? 16 : (d.depth === 1 ? 13 : 11);
      const tmp = grp.append('text').style('font-size', `${fontSize}px`).text(label);
      const bbox = tmp.node().getBBox();
      tmp.remove();
      const w = Math.max(70, bbox.width + 22);
      const h = Math.max(26, bbox.height + 14);
      grp.append('rect')
        .attr('x', 4).attr('y', 4)
        .attr('width', w).attr('height', h)
        .attr('rx', 14).attr('fill', 'var(--color-ink)').attr('opacity', 0.9)
        .attr('transform', `translate(${-w / 2}, ${-h / 2})`);
      grp.append('rect')
        .attr('x', -w / 2).attr('y', -h / 2)
        .attr('width', w).attr('height', h).attr('rx', 14)
        .attr('fill', d.depth === 0 ? '#fff'
              : BRANCH_COLORS[(d.depth - 1) % BRANCH_COLORS.length])
        .attr('stroke', 'var(--color-ink)').attr('stroke-width', 1.5);
      grp.append('text')
        .attr('class', 'node-text')
        .style('font-size', `${fontSize}px`)
        .text(label);
    });

    const sim = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id(d => d.id).distance(d => 80 + d.target.depth * 18).strength(0.8))
      .force('charge', d3.forceManyBody().strength(-260))
      .force('center', d3.forceCenter(0, 0))
      // konstrain radial: tiap node ditarik ke radius depth * R
      .force('radial', d3.forceRadial(d => d.depth * 130, 0, 0).strength(0.6))
      .force('collide', d3.forceCollide().radius(60));

    sim.on('tick', () => {
      linkSel
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);
      nodeSel.attr('transform', d => `translate(${d.x},${d.y})`);
    });

    // zoom & pan
    svg.call(d3.zoom().scaleExtent([0.4, 2.5])
      .on('zoom', e => g.attr('transform', e.transform)));

    return () => sim.stop();
  }, [tree, onSelect]);

  return <svg ref={svgRef} width="100%" height="100%" style={{ display: 'block' }} />;
}
