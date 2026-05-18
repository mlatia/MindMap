/**
 * seed.js - Isi demo data ke database mindmap.
 *
 * Cara pakai (dari folder server/):
 *   npm run db:seed
 *
 * Menambahkan:
 *   - 1 user demo: email=melati@example.com, password=demo1234
 *   - 2 proyek mind map yang sudah lulus 4-tahap validasi
 *
 * Aman dijalankan berulang (idempotent).
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import bcrypt from 'bcryptjs';
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

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'mindmap',
});

const DEMO_USER = {
  username: 'melati',
  email: 'melati@example.com',
  password: 'demo1234',
};

const PROJECTS = [
  {
    title: 'Mind Mapping Tony Buzan',
    source_text:
      'Mind mapping merupakan teknik visualisasi pengetahuan yang dikembangkan oleh Tony Buzan. ' +
      'Teknik ini menyajikan informasi secara non-linear dari satu konsep pusat ke berbagai sub-konsep. ' +
      'Mind map terbukti efektif meningkatkan retensi memori dan pembelajaran kognitif. ' +
      'Pembuatan mind map manual membutuhkan waktu 20-30 menit per dokumen 1000 kata. ' +
      'Otomatisasi dengan AI dapat mengurangi waktu tersebut secara signifikan.',
    layout: 'reingold-tilford-radial',
    mindmap: {
      concept: 'Mind Mapping',
      level: 0,
      children: [
        { concept: 'Tony Buzan', level: 1, children: [
          { concept: 'Radiant Thinking', level: 2, children: [] },
          { concept: 'Visualisasi Pengetahuan', level: 2, children: [] }
        ]},
        { concept: 'Manfaat', level: 1, children: [
          { concept: 'Retensi Memori', level: 2, children: [] },
          { concept: 'Pembelajaran Kognitif', level: 2, children: [] }
        ]},
        { concept: 'Pembuatan Manual', level: 1, children: [
          { concept: '20-30 Menit per 1000 Kata', level: 2, children: [] }
        ]},
        { concept: 'Otomatisasi AI', level: 1, children: [
          { concept: 'Mengurangi Waktu', level: 2, children: [] }
        ]}
      ]
    },
    meta: { provider: 'seed', attempts: 1, stats: { nodes: 10, depth: 2, branchesRoot: 4 } }
  },
  {
    title: 'Arsitektur PERN Stack',
    source_text:
      'Arsitektur PERN terdiri atas PostgreSQL untuk basis data relasional, Express sebagai framework backend Node.js, ' +
      'React untuk antarmuka pengguna single-page application, serta Node.js sebagai runtime JavaScript di server. ' +
      'Komunikasi antara client dan server menggunakan REST API dengan pertukaran data JSON. ' +
      'Autentikasi dilakukan menggunakan JSON Web Token. PostgreSQL menyediakan tipe data JSONB.',
    layout: 'force-directed-radial',
    mindmap: {
      concept: 'PERN Stack',
      level: 0,
      children: [
        { concept: 'PostgreSQL', level: 1, children: [
          { concept: 'Basis Data Relasional', level: 2, children: [] },
          { concept: 'JSONB', level: 2, children: [] }
        ]},
        { concept: 'Express', level: 1, children: [
          { concept: 'Framework Backend', level: 2, children: [] },
          { concept: 'REST API', level: 2, children: [] }
        ]},
        { concept: 'React', level: 1, children: [
          { concept: 'Single Page Application', level: 2, children: [] }
        ]},
        { concept: 'Node.js', level: 1, children: [
          { concept: 'Runtime JavaScript', level: 2, children: [] }
        ]},
        { concept: 'Autentikasi', level: 1, children: [
          { concept: 'JSON Web Token', level: 2, children: [] }
        ]}
      ]
    },
    meta: { provider: 'seed', attempts: 1, stats: { nodes: 12, depth: 2, branchesRoot: 5 } }
  }
];

const c = { reset: '\x1b[0m', bold: '\x1b[1m', green: '\x1b[32m', cyan: '\x1b[36m', yellow: '\x1b[33m', red: '\x1b[31m' };

async function main() {
  console.log(`\n${c.bold}== Seed database ==${c.reset}`);

  const hashed = await bcrypt.hash(DEMO_USER.password, 10);
  const upUser = await pool.query(
    `INSERT INTO users (username, email, password) VALUES ($1, $2, $3)
     ON CONFLICT (email) DO UPDATE SET password = EXCLUDED.password
     RETURNING id, username, email`,
    [DEMO_USER.username, DEMO_USER.email, hashed]
  );
  const user = upUser.rows[0];
  console.log(`${c.green}+${c.reset} User demo siap: ${c.cyan}${user.email}${c.reset} (id=${user.id})`);
  console.log(`  ${c.yellow}password: ${DEMO_USER.password}${c.reset}`);

  let created = 0, skipped = 0;
  for (const p of PROJECTS) {
    const exists = await pool.query(
      'SELECT id FROM projects WHERE user_id = $1 AND title = $2',
      [user.id, p.title]
    );
    if (exists.rows.length) {
      skipped += 1;
      console.log(`  ${c.yellow}skip${c.reset}    "${p.title}" (sudah ada, id=${exists.rows[0].id})`);
      continue;
    }
    const ins = await pool.query(
      `INSERT INTO projects (user_id, title, source_text, mindmap, layout, meta)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [user.id, p.title, p.source_text, p.mindmap, p.layout, p.meta]
    );
    created += 1;
    console.log(`  ${c.green}created${c.reset} "${p.title}" (id=${ins.rows[0].id}, ${p.layout})`);
  }

  console.log(`\n${c.bold}Selesai.${c.reset} ${created} proyek baru, ${skipped} sudah ada.\n`);
  console.log(`Login:  email ${c.cyan}${DEMO_USER.email}${c.reset}  password ${c.cyan}${DEMO_USER.password}${c.reset}\n`);
  await pool.end();
}

main().catch(err => {
  console.error(`${c.red}Seed error:${c.reset}`, err.message);
  process.exit(1);
});
