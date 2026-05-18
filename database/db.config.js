/**
 * db.config.js - Database Connection Configuration
 *
 * Singleton PostgreSQL Pool. Membaca konfigurasi dari env yang sudah
 * di-load oleh server/src/index.js (lewat `import 'dotenv/config'`).
 *
 * Jika dipakai dari script test (NODE_ENV=test), load .env.test secara
 * sinkron sebelum Pool dibuat.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pkg from 'pg';

const { Pool } = pkg;

// ---- Load .env.test SECARA SINKRON jika NODE_ENV=test ----
if (process.env.NODE_ENV === 'test') {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const envPath = join(__dirname, '..', 'server', '.env.test');
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*(#.*)?$/);
      if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

// Validasi dini: bantu user debug bila env tidak ter-load
if (!process.env.DB_PASSWORD || typeof process.env.DB_PASSWORD !== 'string') {
  console.warn('[db.config] DB_PASSWORD tidak terdefinisi sebagai string. Pastikan server/.env ada dan ter-load.');
}

const pool = new Pool({
  user:     process.env.DB_USER     || 'postgres',
  password: String(process.env.DB_PASSWORD || 'postgres'),
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME     || 'mindmap',
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle Postgres client', err);
  process.exit(-1);
});

export default pool;
