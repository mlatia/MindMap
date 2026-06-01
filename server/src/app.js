/**
 * app.js - Express Application Configuration
 *
 * Setup utama untuk aplikasi Mind Map Otomatis: middleware keamanan,
 * CORS, parser, sesi, autentikasi, lalu mount semua rute API.
 *
 * Environment Variables:
 *   API_URL        - URL frontend untuk CORS. Bisa comma-separated list:
 *                    "https://fe.vercel.app,https://other.com"
 *   SESSION_SECRET - secret untuk express-session
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
import session from 'express-session';
import passport from 'passport';

import { securityMiddleware } from './config/security.config.js';
import authRoutes from './routes/auth.routes.js';
import counterRoutes from './routes/counter.routes.js';
import projectsRoutes from './routes/projects.routes.js';
import mindmapRoutes from './routes/mindmap.routes.js';

const app = express();

// ---- Trust proxy (Vercel/Render butuh ini untuk req.ip + secure cookie) ----
app.set('trust proxy', 1);

// ---- Keamanan ----
app.use(securityMiddleware);

// ---- CORS dinamis ----
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

// ---- Body & cookie parser ----
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ---- Session & passport (opsional, pakai JWT sebagai primary) ----
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 86400000,
  },
}));
app.use(passport.initialize());
app.use(passport.session());

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
