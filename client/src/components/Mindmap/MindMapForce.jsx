/**
 * MindMapForce.jsx - Force-Directed dengan konstrain radial (v2 improved).
 *
 * Perbaikan dari versi sebelumnya:
 *   1. INITIAL SEEDING — tiap node ditempatkan di posisi polar sesuai
 *      Reingold-Tilford layout BEFORE simulation, supaya tidak random.
 *   2. FORCE BALANCE — radial > link > collide > charge (urutan strength
 *      dibalik supaya hierarki radial dominan, link cuma adjuster).
 *   3. ANGULAR SIBLING SEPARATION — custom force yang spread anak-anak
 *      dari parent sama secara angular (wedge per child).
 *   4. ROOT PINNED — root selalu di (0,0) dengan fx/fy.
 *   5. EXTENDED CONVERGENCE — alpha decay lebih lambat + alpha awal
 *      lebih tinggi → simulasi lebih lama → keluar dari local minima.
 *
 * Interaksi tetap sama: klik node = edit, klik kanan = context menu,
 * drag = pindah individual (zoom-aware).
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

/**
 * Flatten + computed initial polar positions (Reingold-Tilford radial).
 * Output: nodes (dengan x,y init), links, parentMap.
 */
function flattenWithSeed(tree, radiusStep) {
  // Pakai d3.tree untuk dapat initial polar positions deterministik
  const root = d3.hierarchy(tree, d => d.children);
  const sepFn = (a, b) => (a.parent === b.parent ? 1 : 1.6) / Math.max(a.depth, 1);
  d3.tree().size([2 * Math.PI, radiusStep * 3]).separation(sepFn)(root);

  const nodes = [];
  const links = [];
  const parentMap = new Map();

  root.descendants().forEach((n) => {
    const path = n.ancestors().reverse().slice(1).map(a =>
      a.parent.children.indexOf(a)
    );
    const id = path.join('.') || 'root';
    // Konversi polar → cartesian sebagai INITIAL position
    const initX = n.depth === 0 ? 0 : Math.cos(n.x - Math.PI / 2) * n.y;
    const initY = n.depth === 0 ? 0 : Math.sin(n.x - Math.PI / 2) * n.y;
    nodes.push({
      id,
      data: n.data,
      depth: n.depth,
      path,
      x: initX, y: initY,                  // seed posisi awal
      angularTarget: n.depth === 0 ? 0 : n.x,  // target sudut untuk angular force
    });
    if (n.parent) {
      const parentPath = n.parent.ancestors().reverse().slice(1).map(a =>
        a.parent.children.indexOf(a)
      );
      const parentId = parentPath.join('.') || 'root';
      links.push({ source: parentId, target: id });
      parentMap.set(id, parentId);
    }
  });
  return { nodes, links, parentMap };
}

/**
 * Custom force: angular sibling separation.
 * Mendorong anak dari parent sama agar sudut relatif terhadap parent merata.
 */
function forceAngularSiblings(nodes, parentMap, strength = 0.08) {
  // Cluster siblings by parent
  const siblings = new Map();
  for (const n of nodes) {
    const p = parentMap.get(n.id);
    if (!p) continue;
    if (!siblings.has(p)) siblings.set(p, []);
    siblings.get(p).push(n);
  }
  const nodeById = new Map(nodes.map(n => [n.id, n]));

  return function (alpha) {
    for (const [parentId, kids] of siblings) {
      if (kids.length < 2) continue;
      const parent = nodeById.get(parentId);
      if (!parent) continue;
      const baseAngle = Math.atan2(parent.y, parent.x) || 0;
      const wedge = Math.PI * (kids.length >= 4 ? 1.4 : 0.9);
      kids.forEach((k, i) => {
        const targetAngle = baseAngle - wedge / 2 + (i + 0.5) * wedge / kids.length;
        const dist = Math.hypot(k.x - parent.x, k.y - parent.y) || 1;
        const tx = parent.x + Math.cos(targetAngle) * dist;
        const ty = parent.y + Math.sin(targetAngle) * dist;
        k.vx += (tx - k.x) * strength * alpha;
        k.vy += (ty - k.y) * strength * alpha;
      });
    }
  };
}

export default function MindMapForce({
  tree, onEdit, onContextMenu, selectedPath = [], editingPath,
  onCommitEdit, onCancelEdit, spacing = 1.0
}) {
  const svgRef = useRef(null);
  // cache posisi node antar-render supaya tidak re-simulasi tiap pilih/edit
  const posRef = useRef({ sig: null, pos: new Map(), vb: null });

  useEffect(() => {
    if (!tree) return;
    const radiusStep = 140 * spacing;
    const { nodes, links, parentMap } = flattenWithSeed(tree, radiusStep);

    const _css = getComputedStyle(document.documentElement);
    const cv = (n, fb) => (_css.getPropertyValue(n).trim() || fb);
    const INK = cv('--color-ink', '#0A0A0A');
    const ROOT_FILL = cv('--root-fill', '#FF7AC4');
    const PINK_TAG = cv('--pink-tag', '#FFB7DE');
    const PINK_STRONG = cv('--pink-strong', '#FF7AC4');
    const BRANCH = [1,2,3,4,5,6].map(i => cv(`--branch-${i}`, '#ddd'));

    // Hitung ukuran tiap node untuk collide radius
    nodes.forEach(n => {
      const fontSize = n.depth === 0 ? 20 : (n.depth === 1 ? 13 : 11);
      const len = (n.data.concept || '').length;
      n.w = Math.max(80, len * (fontSize * 0.55) + (n.depth === 0 ? 40 : 24));
      n.h = Math.max(28, fontSize + (n.depth === 0 ? 24 : 16));
      n.r = Math.hypot(n.w / 2, n.h / 2) + 6;
    });
    // Pin root di pusat
    const root = nodes.find(n => n.id === 'root');
    if (root) { root.fx = 0; root.fy = 0; }

    // STABILITAS: kalau struktur sama (mis. hanya pilih/rename node),
    // pakai posisi tersimpan + pin semua node supaya TIDAK ber-simulasi ulang
    // (mencegah node "muter-muter" sehingga sulit diedit di Force-Directed).
    const sig = nodes.length + '|' + spacing.toFixed(2);
    const reuse = posRef.current.sig === sig && posRef.current.pos.size > 0;
    if (reuse) {
      nodes.forEach(n => {
        const pp = posRef.current.pos.get(n.id);
        if (pp) { n.x = pp.x; n.y = pp.y; n.fx = pp.x; n.fy = pp.y; }
      });
    }

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    const initSize = Math.max(900, radiusStep * 4.5);
    svg.attr('viewBox', reuse && posRef.current.vb
      ? posRef.current.vb
      : `${-initSize / 2} ${-initSize / 2} ${initSize} ${initSize}`);

    svg.append('defs').append('style').text(`
      .node-rect { transition: stroke 180ms ease, stroke-width 180ms ease; }
      .node-group:hover .node-rect { stroke: var(--pink-strong); }
      .node-group.selected .node-rect {
        stroke: var(--pink-strong); stroke-width: 3.5;
        animation: mm-pulse 1.4s ease-in-out infinite;
      }
      @keyframes mm-pulse {
        0%, 100% { filter: drop-shadow(0 0 0 var(--pink-strong)); }
        50%      { filter: drop-shadow(0 0 8px var(--pink-strong)); }
      }
      .node-edit-input {
        font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 700;
        text-align: center; border: 2px solid var(--pink-strong);
        border-radius: 10px; padding: 4px 8px; outline: none;
        background: white; color: var(--color-ink);
      }
    `);

    const g = svg.append('g');

    const linkSel = g.append('g')
      .selectAll('line').data(links).join('line')
      .attr('stroke', INK)
      .attr('stroke-width', 1.6).attr('opacity', 0.85);

    const nodeSel = g.append('g')
      .selectAll('g.node-group').data(nodes).join('g')
      .attr('class', d => 'node-group' + (arrEq(d.path, selectedPath) ? ' selected' : ''))
      .style('cursor', 'pointer');

    nodeSel.each(function(d) {
      const grp = d3.select(this);
      const label = d.data.concept || '';
      const fontSize = d.depth === 0 ? 20 : (d.depth === 1 ? 13 : 11);
      const isEditing = arrEq(d.path, editingPath);
      const isSelected = arrEq(d.path, selectedPath);

      grp.append('rect').attr('class', 'node-shadow')
        .attr('x', -d.w / 2 + 3).attr('y', -d.h / 2 + 3).attr('rx', 14)
        .attr('width', d.w).attr('height', d.h)
        .attr('fill', INK).attr('opacity', 0.9);
      grp.append('rect').attr('class', 'node-rect')
        .attr('x', -d.w / 2).attr('y', -d.h / 2).attr('rx', 14)
        .attr('width', d.w).attr('height', d.h)
        .attr('fill', isSelected ? PINK_TAG
              : (d.depth === 0 ? PINK_TAG : BRANCH[(d.depth - 1) % BRANCH.length]))
        .attr('stroke', isSelected ? PINK_STRONG : (d.depth === 0 ? ROOT_FILL : INK))
        .attr('stroke-width', isSelected ? 3 : (d.depth === 0 ? 2 : 1.5));

      if (isEditing) {
        grp.append('foreignObject')
          .attr('x', -d.w / 2 + 2).attr('y', -d.h / 2 + 2)
          .attr('width', d.w - 4).attr('height', d.h - 4)
          .append('xhtml:input').attr('class', 'node-edit-input')
          .attr('style', `width:100%;height:100%;font-size:${fontSize}px`)
          .attr('value', label)
          .on('keydown', function(e) {
            e.stopPropagation();
            if (e.key === 'Enter') { e.preventDefault(); if (onCommitEdit) onCommitEdit(d.path, this.value); }
            else if (e.key === 'Escape') { if (onCancelEdit) onCancelEdit(); }
          })
          .on('click', e => e.stopPropagation())
          .on('blur', function() { if (onCommitEdit) onCommitEdit(d.path, this.value); })
          .each(function() {
            setTimeout(() => {
              this.focus();
              const len = this.value.length;
              try { this.setSelectionRange(len, len); } catch (_) {}
            }, 0);
          });
      } else {
        grp.append('text').attr('class', 'node-text')
          .attr('text-anchor', 'middle').attr('dominant-baseline', 'central')
          .attr('font-family', "'Plus Jakarta Sans', sans-serif")
          .attr('font-weight', 700).attr('fill', INK)
          .style('font-size', `${fontSize}px`).text(label);
      }
    });

    // Posisi awal eksplisit supaya node langsung tampil di tempat tersimpan.
    nodeSel.attr('transform', d => `translate(${d.x},${d.y})`);

    // ---- IMPROVED FORCE SIMULATION ----
    const sim = d3.forceSimulation(nodes)
      .force('radial', d3.forceRadial(d => d.depth * radiusStep, 0, 0).strength(0.95))
      .force('link', d3.forceLink(links)
        .id(d => d.id)
        .distance(d => 60 + d.target.depth * 25)
        .strength(0.25))
      .force('charge', d3.forceManyBody().strength(-80))
      .force('collide', d3.forceCollide().radius(d => d.r + 4).iterations(6))
      .force('angular', forceAngularSiblings(nodes, parentMap, 0.15))
      // Convergence parameters
      .alpha(reuse ? 0 : 0.9)
      .alphaMin(0.001)
      .alphaDecay(0.012)
      .velocityDecay(0.45);

    sim.on('tick', () => {
      linkSel
        .attr('x1', d => d.source.x).attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
      nodeSel.attr('transform', d => `translate(${d.x},${d.y})`);
    });

    sim.on('end', () => {
      // simpan posisi akhir + signature untuk dipakai render berikutnya
      posRef.current.sig = sig;
      posRef.current.pos = new Map(nodes.map(n => [n.id, { x: n.x, y: n.y }]));
      if (reuse) return; // jangan reset framing saat hanya pilih/edit
      try {
        const bbox = g.node().getBBox();
        const pad = 60;
        let vx = bbox.x - pad, vy = bbox.y - pad;
        let vw = bbox.width + pad * 2, vh = bbox.height + pad * 2;
        const _r = svgRef.current && svgRef.current.getBoundingClientRect();
        if (_r && _r.width && _r.height) {
          const cA = _r.width / _r.height, vA = vw / vh;
          if (cA > vA) { const nw = vh * cA; vx -= (nw - vw) / 2; vw = nw; }
          else { const nh = vw / cA; vy -= (nh - vh) / 2; vh = nh; }
        }
        const vb = `${vx} ${vy} ${vw} ${vh}`;
        posRef.current.vb = vb;
        svg.attr('viewBox', vb);
      } catch (e) { /* ignore */ }
    });

    // ---- Drag handler (zoom-aware, alpha kalem) ----
    const drag = d3.drag()
      .subject(function(_e, d) { return { x: d.x, y: d.y }; })
      .container(function() { return g.node(); })
      .on('start', function(e, d) {
        d.__dragStart = { x: e.x, y: e.y, moved: false };
        if (!e.active) sim.alphaTarget(0.05).restart();
        if (d.id !== 'root') { d.fx = d.x; d.fy = d.y; }
      })
      .on('drag', function(e, d) {
        const dx = e.x - d.__dragStart.x;
        const dy = e.y - d.__dragStart.y;
        if (!d.__dragStart.moved && Math.hypot(dx, dy) < 5) return;
        d.__dragStart.moved = true;
        if (d.id !== 'root') { d.fx = e.x; d.fy = e.y; }
      })
      .on('end', function(e, d) {
        if (!e.active) sim.alphaTarget(0);
        if (!d.__dragStart.moved) {
          if (onEdit) onEdit(d.path);
        } else {
          posRef.current.pos.set(d.id, { x: d.x, y: d.y });
        }
      });
    nodeSel.call(drag);

    nodeSel.on('contextmenu', (e, d) => {
      e.preventDefault();
      if (onContextMenu) onContextMenu(d.path, e.pageX, e.pageY);
    });

    svg.call(d3.zoom().scaleExtent([0.3, 3])
      .filter(e => !e.target.closest('input') && !e.target.closest('.node-group'))
      .on('zoom', e => g.attr('transform', e.transform)));

    return () => sim.stop();
  }, [tree, selectedPath, editingPath, onEdit, onContextMenu, onCommitEdit, onCancelEdit, spacing]);

  return <svg ref={svgRef} width="100%" height="100%" style={{ display: 'block' }} />;
}
