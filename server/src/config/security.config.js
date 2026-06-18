import rateLimit from 'express-rate-limit';
import helmet from 'helmet';

/**
 * security.config.js - Middleware keamanan (helmet + rate limit).
 *
 * CATATAN (perbaikan CORS): blok CORS manual sebelumnya DIHAPUS dari sini.
 * Dulu middleware ini menambahkan header Access-Control-Allow-Origin statis
 * (process.env.CLIENT_URL) yang BERTABRAKAN dengan paket `cors` dinamis di
 * app.js, dan rate-limit dijalankan SEBELUM CORS sehingga saat limit tercapai
 * (gampang terjadi saat dev), preflight OPTIONS balas 429 TANPA header CORS ->
 * browser melaporkan "No 'Access-Control-Allow-Origin' header is present".
 *
 * Sekarang: CORS ditangani 1 sumber saja (paket `cors` di app.js, dipasang
 * PALING AWAL). Di sini rate-limit MELEWATI request OPTIONS (preflight) agar
 * preflight tidak pernah ke-limit.
 */

// Rate limiting - lewati preflight OPTIONS supaya CORS tidak pernah ke-block.
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 menit
    max: 300,                 // longgar untuk dev
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.method === 'OPTIONS',
    message: 'Too many requests from this IP, please try again later.'
});

// Helmet: matikan kebijakan cross-origin yang tidak relevan untuk REST API
// (mencegah COEP/CORP ikut menghalangi konsumsi API lintas-origin).
const helmetMiddleware = helmet({
    crossOriginResourcePolicy: false,
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: false,
});

export const securityMiddleware = [
    helmetMiddleware,
    limiter,
];
