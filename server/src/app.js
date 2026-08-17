/**
 * app.js - Express Application Configuration
 *
 * Setup utama untuk aplikasi Mind Map Otomatis: middleware keamanan,
 * CORS, parser, sesi, autentikasi, lalu mount semua rute API.
 *
 * Environment Variables:
 *   API_URL        - URL frontend untuk CORS. Bisa comma-separated list:
 *                    "https://fe.vercel.app,https://other.com"
 *   NODE_ENV       - development / production / test
 *   LLM_PROVIDER   - groq | anthropic | openai | mock (default mock)
 *
 * CORS strategy:
 *   1. Always allow origins di API_URL (comma-separated)
 *   2. Always allow localhost untuk dev
 *   3. Auto-allow *.vercel.app (untuk preview deployments)
 *   4. Tolak yang lain + log untuk debug
 */

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import { securityMiddleware } from './config/security.config.js';
import authRoutes from './routes/auth.routes.js';
import counterRoutes from './routes/counter.routes.js';
import projectsRoutes from './routes/projects.routes.js';
import mindmapRoutes from './routes/mindmap.routes.js';

const app = express();

// ---- Trust proxy (Vercel/Render butuh ini untuk req.ip + secure cookie) ----
app.set('trust proxy', 1);

// ---- CORS dinamis (DIPASANG PALING AWAL, sebelum keamanan/rate-limit) ----
// Penting: CORS harus jalan sebelum rate-limit agar preflight OPTIONS tidak
// pernah ke-block oleh limiter (penyebab error "No Access-Control-Allow-Origin").
const allowedOrigins = (process.env.API_URL || 'http://localhost:5173')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
// Selalu tambah localhost untuk dev
const localOrigins = ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173'];
const finalOrigins = [...new Set([...allowedOrigins, ...localOrigins])];

function corsOriginCheck(origin, callback) {
  // No origin (server-to-server, curl, mobile native) => allow
  if (!origin) return callback(null, true);
  // Exact match dari env / localhost
  if (finalOrigins.includes(origin)) return callback(null, true);
  // Auto-allow *.vercel.app supaya preview deployments tidak ke-block
  if (/^https:\/\/[\w-]+\.vercel\.app$/.test(origin)) return callback(null, true);
  // Log + reject
  console.warn(`[CORS] origin ditolak: ${origin}. Whitelist:`, finalOrigins);
  callback(new Error('Not allowed by CORS'));
}

app.use(cors({
  origin: corsOriginCheck,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

// Handle preflight semua route (express 4 perlu eksplisit)
app.options('*', cors({ origin: corsOriginCheck, credentials: true }));

// ---- Keamanan (helmet + rate-limit) setelah CORS ----
app.use(securityMiddleware);

// ---- Body & cookie parser ----
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ---- Root info ----
app.get('/', (_req, res) => {
  res.type('html').send(
    '<!doctype html><html><head><title>Mind Map Otomatis API</title>' +
    '<style>' +
    'body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:680px;margin:40px auto;padding:0 20px;color:#0A0A0A}' +
    'h1{font-weight:800;letter-spacing:-0.02em}' +
    'code{background:#FFE45C;padding:2px 8px;border-radius:6px;font-weight:700}' +
    '.tag{display:inline-block;background:#FFB7DE;border-radius:6px;padding:2px 10px;font-weight:700;transform:rotate(-2deg);box-shadow:1px 1px 0 #0A0A0A}' +
    'ul{line-height:1.9} li code{font-size:0.95em}' +
    'a{color:#0A0A0A;border-bottom:2px solid #FF7AC4}' +
    '</style></head><body>' +
    '<span class="tag">Backend API</span>' +
    '<h1>Mind Map Otomatis</h1>' +
    '<p>Backend Express berjalan.</p>' +
    '<h3>Endpoint API:</h3><ul>' +
    '<li><code>GET  /api/health</code> - status backend</li>' +
    '<li><code>POST /api/auth/register</code> - daftar akun</li>' +
    '<li><code>POST /api/auth/login</code> - login (dapat JWT)</li>' +
    '<li><code>POST /api/mindmap/generate</code> - pipeline Auto-CoT (perlu JWT)</li>' +
    '<li><code>GET/POST/PUT/DELETE /api/projects</code> - CRUD proyek (perlu JWT)</li>' +
    '</ul>' +
    '<p style="margin-top:24px;color:#6B6B6B">Cek cepat: <a href="/api/health">/api/health</a></p>' +
    '</body></html>'
  );
});

// ---- API routes ----
app.get('/api/health', (_req, res) => res.json({
  status: 'ok',
  service: 'mind-map-otomatis',
  cors: { allowedOrigins: finalOrigins, autoAllowVercelApp: true },
  llm: process.env.LLM_PROVIDER || 'mock',
}));

// Diagnostic endpoint: cek koneksi DB + tabel
app.get('/api/health/db', async (_req, res) => {
  const out = {
    env: {
      DB_USER: process.env.DB_USER || '(unset)',
      DB_HOST: process.env.DB_HOST || '(unset)',
      DB_PORT: process.env.DB_PORT || '(unset)',
      DB_NAME: process.env.DB_NAME || '(unset)',
      DB_PASSWORD: process.env.DB_PASSWORD ? '***set***' : '(unset!)',
      SUPABASE_POOLER: process.env.SUPABASE_POOLER || '(unset)',
    }
  };
  try {
    const pool = (await import('./db.js')).default;
    const ver = await pool.query('SELECT version()');
    out.connected = true;
    out.pgVersion = ver.rows[0].version.split(',')[0];
    const tables = await pool.query(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename"
    );
    out.tables = tables.rows.map(r => r.tablename);
    out.missingTables = ['users','projects','mindmap_revisions']
      .filter(t => !out.tables.includes(t));
    if (out.missingTables.length) {
      out.hint = 'Jalankan database/init.sql di Supabase SQL Editor untuk membuat tabel.';
    } else {
      const userCount = await pool.query('SELECT COUNT(*)::int AS n FROM users');
      out.userCount = userCount.rows[0].n;
    }
    res.json(out);
  } catch (err) {
    out.connected = false;
    out.error = err.message;
    out.hint = 'Cek env DB_* di Vercel Settings, dan pastikan pakai Supabase Transaction Pooler (port 6543).';
    res.status(500).json(out);
  }
});

// Vercel Cron: ping ringan ke DB supaya Supabase Free tidak ke-pause.
// Dipanggil otomatis lewat schedule di vercel.json. Endpoint diproteksi
// dengan header X-Vercel-Cron-Signature secara default kalau pakai
// crons di Hobby plan; di sini cukup return 200 dan log ke console.
app.get('/api/cron/keepalive', async (_req, res) => {
  try {
    const pool = (await import('./db.js')).default;
    const r = await pool.query('SELECT NOW() AS now, COUNT(*)::int AS users FROM users');
    console.log('[cron] keepalive ok:', r.rows[0]);
    res.json({ ok: true, at: r.rows[0].now, users: r.rows[0].users });
  } catch (err) {
    console.error('[cron] keepalive error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/counter', counterRoutes);
app.use('/api/projects', projectsRoutes);
app.use('/api/mindmap', mindmapRoutes);

/**
 * Global error handler.
 */
app.use((err, _req, res, _next) => {
  console.error('[error]', err.stack || err.message);
  if (err.message && err.message.includes('CORS')) {
    return res.status(403).json({ message: err.message });
  }
  res.status(500).json({ message: 'Something went wrong!' });
});

export default app;
