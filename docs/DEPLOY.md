# Panduan Deploy: FE + BE Vercel + DB Supabase (semua gratis)

Arsitektur production:

```
┌──────────────────────┐       ┌──────────────────────┐       ┌────────────────┐
│  Vercel (frontend)   │ HTTPS │  Vercel (backend)    │  pg   │ Supabase (DB)  │
│  React + Vite build  │ ─────>│  Serverless function │ ─────>│ PostgreSQL     │
│  mindmap-fe.         │       │  mindmap-api.        │       │ *.supabase.co  │
│  vercel.app          │       │  vercel.app          │       │ pooler:6543    │
└──────────────────────┘       └──────────────────────┘       └────────────────┘
```

Dua project Vercel terpisah (FE dan BE), satu repo GitHub. Cold start BE ~500ms,
warm <50ms. Max duration 60s (cukup untuk pipeline Auto-CoT + retry 3x).

---

## A. Persiapan: push ke GitHub

```bash
cd C:\Users\Administrator\Downloads\TA\Repo\MindMap
git status
git add .
git commit -m "Production-ready: vercel config + serverless handler"
git push origin main
```

Jika belum ada remote:
```bash
git remote add origin https://github.com/USERNAME/mindmap-otomatis.git
git branch -M main
git push -u origin main
```

---

## B. Database — Supabase

1. Buka https://supabase.com → Sign in with GitHub.
2. **New project**:
   - Name: `mindmap`
   - Database Password: catat (akan jadi `DB_PASSWORD`)
   - Region: Singapore
   - Free plan
3. Tunggu 2 menit sampai DB siap.
4. **SQL Editor → New Query** → paste seluruh isi `database/init.sql` → Run.
   Tabel `users`, `projects`, `mindmap_revisions` terbuat.
5. **Connect** (tombol di atas) → pilih **Transaction Pooler** (port 6543).
   PENTING: untuk Vercel serverless WAJIB pakai Pooler, bukan direct connection,
   supaya tidak menumpuk koneksi.

Catat URI Transaction Pooler:
```
postgresql://postgres.xxxxxx:[YOUR-PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres
```

Pecah jadi 5 nilai:
- `DB_USER=postgres.xxxxxx`         (perhatikan format `postgres.<project_ref>`)
- `DB_PASSWORD=<password kamu>`
- `DB_HOST=aws-0-ap-southeast-1.pooler.supabase.com`
- `DB_PORT=6543`
- `DB_NAME=postgres`

---

## C. Backend — Vercel (Serverless Function)

1. Buka https://vercel.com → Sign in with GitHub.
2. **Add New → Project** → Import repo `mindmap-otomatis`.
3. Konfigurasi:
   - Project Name: `mindmap-api`
   - Framework Preset: **Other**
   - **Root Directory**: `server` (klik Edit → pilih)
   - Build Command: kosongkan / default
   - Output Directory: kosongkan
4. **Environment Variables** (klik "Add"):
   ```
   NODE_ENV=production
   DB_USER=postgres.xxxxxx
   DB_PASSWORD=<dari Supabase>
   DB_HOST=aws-0-ap-southeast-1.pooler.supabase.com
   DB_PORT=6543
   DB_NAME=postgres
   SUPABASE_POOLER=true
   JWT_SECRET=<random string panjang, mis. dari https://1password.com/password-generator>
   SESSION_SECRET=<random string panjang>
   LLM_PROVIDER=groq
   LLM_MODEL=llama-3.3-70b-versatile
   GROQ_API_KEY=<dari console.groq.com>
   ```
   `API_URL` dan `CLIENT_URL` belum di-set — akan diisi setelah FE deploy (langkah E).
5. Klik **Deploy**. Tunggu 1-2 menit.
6. Setelah deploy, copy URL: `https://mindmap-api-xxx.vercel.app`
7. Test: buka `https://mindmap-api-xxx.vercel.app/api/health` → harus muncul
   `{"status":"ok","service":"mind-map-otomatis"}`.

---

## D. Frontend — Vercel

1. Vercel dashboard → **Add New → Project** → Import repo `mindmap-otomatis` (lagi).
2. Konfigurasi:
   - Project Name: `mindmap-fe` (beda dari BE)
   - Framework Preset: **Vite** (auto-detect)
   - **Root Directory**: `client`
   - Build / Output: default
3. **Environment Variables**:
   ```
   VITE_API_URL=https://mindmap-api-xxx.vercel.app
   ```
   (URL dari langkah C.6)
4. Klik **Deploy**. Tunggu 1-2 menit.
5. URL: `https://mindmap-fe-xxx.vercel.app`

---

## E. Konek FE ↔ BE (CORS)

BE harus tahu URL FE supaya CORS tidak block.

1. Vercel dashboard → project **mindmap-api** → **Settings → Environment Variables**.
2. Tambah:
   ```
   API_URL=https://mindmap-fe-xxx.vercel.app
   CLIENT_URL=https://mindmap-fe-xxx.vercel.app
   ```
3. **Deployments** tab → menu titik tiga di deployment terbaru → **Redeploy**.

---

## F. Verifikasi end-to-end

1. Buka `https://mindmap-fe-xxx.vercel.app`
2. **Daftar** akun baru
3. Login → **Buat baru** → tempel teks → Generate
4. Cek di Vercel BE → **Logs** tab: harus muncul `[mindmap] attempt 1` (sukses) atau detail error
5. Cek Supabase **Table Editor** → `users` (1 baris), `projects` (1 baris setelah generate)

---

## G. Limit & catatan

**Vercel Hobby (gratis)**:
- 100 GB bandwidth / bulan
- 100 GB-hours serverless execution / bulan
- Max function duration: **60 detik** (cukup untuk LLM call + retry)
- Cold start ~500ms (sangat cepat dibanding Render)

**Supabase Free**:
- 500 MB database storage (cukup banget untuk TA)
- 2 GB bandwidth / bulan
- Project paused setelah 1 minggu **tanpa aktivitas** (mudah resume: klik 1 tombol)
- Tidak expire seperti Render Postgres

**Groq Free**:
- 30 req/menit untuk llama-3.3-70b
- 14,400 req/hari
- Cukup untuk eval TA (50 stability + 15 layout = 65 calls)

---

## H. Troubleshooting

| Masalah | Solusi |
| --- | --- |
| `CORS error` di browser | Cek `API_URL` di BE = URL FE persis (https + domain) |
| `Cannot read properties of undefined (reading 'rows')` | DB connection gagal → cek 5 DB_* env var di BE |
| `password authentication failed` | Cek `DB_PASSWORD` di BE = password yang dibuat di Supabase |
| `ECONNREFUSED` | Pakai Transaction Pooler port 6543, BUKAN direct 5432 |
| `Function execution timed out` | LLM call > 60s. Coba teks lebih pendek, atau ganti LLM_MODEL ke yang lebih cepat |
| FE 404 saat refresh | `client/vercel.json` sudah ada SPA rewrites; coba redeploy |

---

## I. Tips keamanan

- Jangan commit `.env` ke git (sudah di `.gitignore`)
- Set `JWT_SECRET` & `SESSION_SECRET` ke random string panjang (≥32 chars)
- Rotate `GROQ_API_KEY` kalau pernah ter-expose
- Aktifkan Supabase **Row Level Security** (RLS) di tabel `projects` (optional, kalau mau ekstra aman)
- Vercel auto-HTTPS, tidak perlu setup SSL manual
