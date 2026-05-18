/**
 * check-db.js - Diagnostik koneksi PostgreSQL & isi tabel.
 *
 * Cara pakai (dari folder server/):
 *   npm run db:check
 *
 * Membaca konfigurasi dari server/.env (DB_USER, DB_PASSWORD, DB_HOST,
 * DB_PORT, DB_NAME). Tahan banting jika dotenv belum diinstal.
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pkg from 'pg';

const { Pool } = pkg;

// ---- Load .env manual (tidak butuh dotenv) ----
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '..', '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*(#.*)?$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const cfg = {
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'mindmap',
};

const c = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m', cyan: '\x1b[36m',
};

function log(label, value, color = c.cyan) {
  console.log(`  ${c.dim}${label.padEnd(14)}${c.reset} ${color}${value}${c.reset}`);
}

async function main() {
  console.log(`\n${c.bold}== Cek koneksi PostgreSQL ==${c.reset}`);
  log('user',     cfg.user);
  log('host:port', `${cfg.host}:${cfg.port}`);
  log('database', cfg.database);

  const pool = new Pool(cfg);
  let client;
  try {
    client = await pool.connect();
  } catch (err) {
    console.log(`\n${c.red}${c.bold}X Gagal connect:${c.reset} ${err.message}`);
    console.log(`\n${c.yellow}Cek hal-hal berikut:${c.reset}`);
    console.log(`  1. Service PostgreSQL sudah running?`);
    console.log(`     Windows PowerShell: ${c.cyan}Get-Service postgresql*${c.reset}`);
    console.log(`     Kalau Stopped:      ${c.cyan}Start-Service postgresql-x64-16${c.reset}`);
    console.log(`  2. Database '${cfg.database}' sudah dibuat?`);
    console.log(`     ${c.cyan}psql -U ${cfg.user} -c "CREATE DATABASE ${cfg.database}"${c.reset}`);
    console.log(`  3. Password di server/.env (${envPath}) sesuai dengan password user '${cfg.user}'?`);
    process.exit(1);
  }

  try {
    const ver = await client.query('SELECT version() as v, current_database() as db');
    console.log(`\n${c.green}+ Connected!${c.reset}`);
    log('PG version',  ver.rows[0].v.split(',')[0]);
    log('connected to', ver.rows[0].db);

    console.log(`\n${c.bold}== Daftar tabel di schema public ==${c.reset}`);
    const tables = await client.query(`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
    `);
    if (!tables.rows.length) {
      console.log(`  ${c.yellow}(tidak ada tabel - jalankan: ${c.cyan}psql -U ${cfg.user} -d ${cfg.database} -f ../database/init.sql${c.reset})${c.reset}`);
    } else {
      for (const { tablename } of tables.rows) {
        const cnt = await client.query(`SELECT COUNT(*)::int AS n FROM "${tablename}"`);
        log(tablename, `${cnt.rows[0].n} baris`);
      }
    }

    const hasUsers = tables.rows.some(t => t.tablename === 'users');
    if (hasUsers) {
      console.log(`\n${c.bold}== Sample users (max 3) ==${c.reset}`);
      const u = await client.query('SELECT id, username, email, created_at FROM users ORDER BY id LIMIT 3');
      console.table(u.rows);
    }

    const hasProjects = tables.rows.some(t => t.tablename === 'projects');
    if (hasProjects) {
      console.log(`${c.bold}== Sample projects (max 3) ==${c.reset}`);
      const p = await client.query(`
        SELECT id, user_id, title, layout,
               jsonb_array_length(COALESCE(mindmap->'children', '[]'::jsonb)) AS root_branches,
               updated_at
        FROM projects ORDER BY id LIMIT 3
      `);
      if (p.rows.length) console.table(p.rows);
      else console.log(`  ${c.yellow}(belum ada proyek - jalankan: ${c.cyan}npm run db:seed${c.reset})${c.reset}`);
    }

    console.log(`\n${c.green}${c.bold}Selesai.${c.reset}\n`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error(`${c.red}Error:${c.reset}`, err);
  process.exit(1);
});
