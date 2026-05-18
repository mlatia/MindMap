/**
 * projects.routes.js - Modul Manajemen Proyek (MBE-03)
 *
 * Operasi CRUD untuk proyek mind map. Semua endpoint membutuhkan
 * autentikasi JWT (verifikasi kepemilikan di tiap query).
 *
 *   GET    /api/projects        - daftar proyek milik user
 *   POST   /api/projects        - buat proyek baru (manual / dari mind map)
 *   GET    /api/projects/:id    - detail satu proyek
 *   PUT    /api/projects/:id    - perbarui mindmap / layout / title
 *   DELETE /api/projects/:id    - hapus proyek
 *   GET    /api/projects/:id/revisions  - daftar revisi
 *   POST   /api/projects/:id/revisions  - simpan snapshot revisi
 */

import express from 'express';
import pool from '../../../database/db.config.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, title, layout, meta, created_at, updated_at
       FROM projects WHERE user_id = $1 ORDER BY updated_at DESC`,
      [req.user.id]
    );
    res.json({ projects: result.rows });
  } catch (err) {
    console.error('Projects list error:', err);
    res.status(500).json({ message: 'Gagal mengambil daftar proyek' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { title, source_text: sourceText, mindmap, layout, meta } = req.body;
    if (!title || !sourceText || !mindmap) {
      return res.status(400).json({ message: 'title, source_text, mindmap wajib diisi' });
    }
    const result = await pool.query(
      `INSERT INTO projects (user_id, title, source_text, mindmap, layout, meta)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, title, layout, meta, created_at, updated_at`,
      [
        req.user.id,
        title,
        sourceText,
        mindmap,
        layout || 'reingold-tilford-radial',
        meta || {}
      ]
    );
    res.status(201).json({ project: result.rows[0] });
  } catch (err) {
    console.error('Project create error:', err);
    res.status(500).json({ message: 'Gagal membuat proyek' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, title, source_text, mindmap, layout, meta, created_at, updated_at
       FROM projects WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ message: 'Proyek tidak ditemukan' });
    res.json({ project: result.rows[0] });
  } catch (err) {
    console.error('Project read error:', err);
    res.status(500).json({ message: 'Gagal mengambil proyek' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { title, mindmap, layout, meta } = req.body;
    const result = await pool.query(
      `UPDATE projects SET
         title = COALESCE($1, title),
         mindmap = COALESCE($2, mindmap),
         layout = COALESCE($3, layout),
         meta = COALESCE($4, meta),
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $5 AND user_id = $6
       RETURNING id, title, layout, meta, updated_at`,
      [title, mindmap, layout, meta, req.params.id, req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ message: 'Proyek tidak ditemukan' });
    res.json({ project: result.rows[0] });
  } catch (err) {
    console.error('Project update error:', err);
    res.status(500).json({ message: 'Gagal memperbarui proyek' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM projects WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ message: 'Proyek tidak ditemukan' });
    res.json({ message: 'Proyek dihapus', id: result.rows[0].id });
  } catch (err) {
    console.error('Project delete error:', err);
    res.status(500).json({ message: 'Gagal menghapus proyek' });
  }
});

// ---- Revisions (MFE-06 Undo/Redo persisten) ----
router.get('/:id/revisions', async (req, res) => {
  try {
    const ownership = await pool.query(
      'SELECT id FROM projects WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (!ownership.rows.length) return res.status(404).json({ message: 'Proyek tidak ditemukan' });
    const result = await pool.query(
      `SELECT id, mindmap, note, created_at FROM mindmap_revisions
       WHERE project_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [req.params.id]
    );
    res.json({ revisions: result.rows });
  } catch (err) {
    console.error('Revisions list error:', err);
    res.status(500).json({ message: 'Gagal mengambil revisi' });
  }
});

router.post('/:id/revisions', async (req, res) => {
  try {
    const { mindmap, note } = req.body;
    if (!mindmap) return res.status(400).json({ message: 'mindmap wajib diisi' });
    const ownership = await pool.query(
      'SELECT id FROM projects WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (!ownership.rows.length) return res.status(404).json({ message: 'Proyek tidak ditemukan' });
    const result = await pool.query(
      `INSERT INTO mindmap_revisions (project_id, mindmap, note)
       VALUES ($1, $2, $3) RETURNING id, note, created_at`,
      [req.params.id, mindmap, note || null]
    );
    res.status(201).json({ revision: result.rows[0] });
  } catch (err) {
    console.error('Revision create error:', err);
    res.status(500).json({ message: 'Gagal menyimpan revisi' });
  }
});

export default router;
