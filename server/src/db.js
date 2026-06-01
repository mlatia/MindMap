/**
 * db.js - PostgreSQL Pool yang lokal di server/src/ supaya ter-bundle
 * Vercel saat Root Directory = server/.
 *
 * Mendukung:
 *   - Local dev: pool standar
 *   - Serverless (Vercel + Supabase): auto-detect Transaction Pooler
 *     via env SUPABASE_POOLER=true atau DB_HOST yang mengandung pooler.supabase
 *
 * Pool dibuat LAZY (sekali per process) supaya warm invocation reuse koneksi.
 * SSL auto-enabled untuk host non-localhost.
 *
 * TIDAK MEMANGGIL process.exit() di error handler -- ini penting untuk
 * serverless karena akan menghentikan function terminator dan menyebabkan
 * FUNCTION_INVOCATION_FAILED.
 */
import pkg from 'pg';

const { Pool } = pkg;

const host = process.env.DB_HOST || 'localhost';
const isLocal = host === 'localhost' || host === '127.0.0.1';
const isSupabasePooler = /pooler\.supabase/.test(host) || process.env.SUPABASE_POOLER === 'true';

const config = {
  user:     process.env.DB_USER     || 'postgres',
  password: String(process.env.DB_PASSWORD || 'postgres'),
  host,
  port:     parseInt(process.env.DB_PORT || (isSupabasePooler ? '6543' : '5432'), 10),
  database: process.env.DB_NAME     || 'mindmap',
  ssl: isLocal ? false : { rejectUnauthorized: false },
  max: isSupabasePooler ? 1 : 10,
  idleTimeoutMillis: isSupabasePooler ? 10_000 : 30_000,
  connectionTimeoutMillis: 8_000,
};

let pool;
function getPool() {
  if (!pool) {
    if (!process.env.DB_PASSWORD) {
      console.warn('[db] DB_PASSWORD tidak terdefinisi - cek env vars di Vercel');
    }
    pool = new Pool(config);
    // PENTING: jangan process.exit() di serverless
    pool.on('error', (err) => {
      console.error('[db] idle client error:', err.message);
    });
  }
  return pool;
}

export default {
  query: (...args) => getPool().query(...args),
  connect: (...args) => getPool().connect(...args),
  end: () => pool ? pool.end() : Promise.resolve(),
  get poolConfig() { return config; },
};
