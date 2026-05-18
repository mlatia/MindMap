/**
 * app.js - Express Application Configuration
 *
 * Setup utama untuk aplikasi Mind Map Otomatis: middleware keamanan,
 * CORS, parser, sesi, autentikasi, lalu mount semua rute API.
 *
 * Environment Variables:
 *   API_URL        - URL frontend untuk CORS (default http://localhost:5173)
 *   SESSION_SECRET - secret untuk express-session
 *   NODE_ENV       - development / production / test
 *   LLM_PROVIDER   - anthropic | openai | mock (default mock)
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

// ---- Keamanan & parsing ----
app.use(securityMiddleware);
app.use(cors({
  origin: process.env.API_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ---- Session & passport ----
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 86400000,
  },
}));
app.use(passport.initialize());
app.use(passport.session());

// ---- Root info (biar tidak "Cannot GET /") ----
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
    '<p>Backend Express berjalan. UI ada di <a href="http://localhost:5173">http://localhost:5173</a> ' +
    '(Vite dev server, jalankan dengan <code>cd client &amp;&amp; npm run dev</code>).</p>' +
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
app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'mind-map-otomatis' }));
app.use('/api/auth', authRoutes);
app.use('/api/counter', counterRoutes);
app.use('/api/projects', projectsRoutes);
app.use('/api/mindmap', mindmapRoutes);

/**
 * Global error handler.
 */
app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong!' });
});

export default app;
