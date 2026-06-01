/**
 * api/index.js - Vercel Serverless Function entry untuk backend Express.
 *
 * Vercel akan auto-route semua request ke /api/* lewat file ini.
 * Express app dipakai sebagai handler langsung; tidak perlu listen()
 * karena Vercel handle HTTP-nya.
 *
 * Catatan serverless:
 *   - Cold start ~500ms (warm: <50ms)
 *   - Max duration: 10s (Hobby) / 60s (Pro). LLM call retry harus muat.
 *   - DB connection pool harus dibuat per-invocation atau pakai
 *     Supabase Transaction Pooler (port 6543) yang stateless.
 */

// Load env paling awal sebelum import app
import 'dotenv/config';
import app from '../src/app.js';

export default function handler(req, res) {
  return app(req, res);
}
