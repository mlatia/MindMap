/**
 * auth.routes.js - Authentication endpoints (MBE-02)
 *
 *   POST /api/auth/register   { username, email, password } -> 201
 *   POST /api/auth/login      { email, password }            -> { user, token }
 *
 * Endpoint ini HANYA terima POST dengan JSON body. Akses GET (dari
 * browser address bar) akan dijawab 405 Method Not Allowed dengan
 * pesan ramah supaya developer tahu cara pakainya.
 */
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../db.js';

const router = express.Router();

// ---- Method guard: jelaskan kalau pakai GET ----
router.get('/register', (_req, res) => {
  res.status(405).json({
    message: 'Method Not Allowed',
    expected: 'POST /api/auth/register',
    body:     { username: 'string', email: 'string', password: 'string' },
    hint:     'Endpoint ini hanya menerima POST dengan JSON body. Gunakan form di /register pada frontend, atau panggil lewat fetch/axios/curl POST.'
  });
});

router.get('/login', (_req, res) => {
  res.status(405).json({
    message: 'Method Not Allowed',
    expected: 'POST /api/auth/login',
    body:     { email: 'string', password: 'string' },
    hint:     'Endpoint ini hanya menerima POST dengan JSON body. Gunakan form di /login pada frontend.'
  });
});

// ---- POST /register ----
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body || {};
    if (!username || !email || !password) {
      return res.status(400).json({
        message: 'username, email, dan password wajib diisi',
        received: { username: !!username, email: !!email, password: !!password }
      });
    }

    const userExists = await pool.query(
      'SELECT * FROM users WHERE username = $1 OR email = $2',
      [username, email]
    );
    if (userExists.rows.length > 0) {
      const existing = userExists.rows[0];
      if (existing.username === username) return res.status(400).json({ message: 'Username sudah dipakai' });
      if (existing.email === email)       return res.status(400).json({ message: 'Email sudah terdaftar' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const result = await pool.query(
      'INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING id, username, email',
      [username, email, hashedPassword]
    );

    res.status(201).json({
      message: 'Registrasi berhasil',
      user: result.rows[0]
    });
  } catch (error) {
    console.error('[register] error:', error);
    res.status(500).json({ message: 'Gagal mendaftarkan user', detail: error.message });
  }
});

// ---- POST /login ----
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ message: 'email dan password wajib diisi' });
    }

    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) return res.status(401).json({ message: 'Email atau password salah' });

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: 'Email atau password salah' });

    const token = jwt.sign(
      { id: user.id },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );

    delete user.password;
    res.status(200).json({ message: 'Login berhasil', user, token });
  } catch (error) {
    console.error('[login] error:', error);
    res.status(500).json({ message: 'Gagal login', detail: error.message });
  }
});

// ---- GET /api/auth/me - cek token validity ----
router.get('/me', async (req, res) => {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ message: 'Token tidak ditemukan di header Authorization' });
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    const result = await pool.query(
      'SELECT id, username, email, created_at FROM users WHERE id = $1',
      [payload.id]
    );
    if (!result.rows.length) return res.status(404).json({ message: 'User tidak ditemukan' });
    res.json({ user: result.rows[0] });
  } catch (err) {
    res.status(401).json({ message: 'Token tidak valid' });
  }
});

export default router;
