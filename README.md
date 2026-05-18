# Mind Map Otomatis (PERN + LLM + D3)

Implementasi tugas akhir **"Pengembangan Sistem Mind Map Otomatis dari Hasil Generatif AI"** — Melati Anggraini (NIM 13522035), Teknik Informatika ITB.

Sistem ini menerima input teks bebas dari pengguna, mengekstraksi struktur hierarkis konsep menggunakan strategi **Auto-CoT prompting** terhadap LLM (Claude / OpenAI), memvalidasi output dengan **validation layer 4 tahap**, kemudian memvisualisasikannya dengan algoritma **Reingold-Tilford radial** dan **Force-Directed dengan konstrain radial** (D3.js).

## Stack

- **client** — React + Vite + React Router + D3.js. Styling mengikuti portofolio (white + black sans-serif + pink highlighter + pastel sticky-note).
- **server** — Node.js + Express + JWT. Pipeline mind map ada di `src/mindmap/`.
- **database** — PostgreSQL (JSONB). Schema: `users`, `projects`, `mindmap_revisions`.

## Modul

### Backend
| Kode | File | Modul |
| --- | --- | --- |
| MSM-01 | `server/src/mindmap/preprocess.js` | Preprocessing teks (split kalimat, tokenize, stopwords ID/EN) |
| MSM-02 | `server/src/mindmap/embedding.js` | Sentence embedding (TF-IDF deterministik) + k-medoids clustering |
| MSM-03 | `server/src/mindmap/autoCoT.js` | Auto-CoT prompt builder (system + user + JSON schema + few-shot demonstration) |
| MSM-04 | `server/src/mindmap/llmClient.js` | LLM client (Anthropic / OpenAI / mock deterministik) |
| MSM-05 | `server/src/mindmap/validation.js` | Validation layer 4 tahap (struktural, semantik, kendala, kelengkapan) |
| MBE-01 | `server/src/app.js` + `routes/` | API Gateway |
| MBE-02 | `server/src/middleware/auth.middleware.js`, `routes/auth.routes.js` | Autentikasi JWT |
| MBE-03 | `server/src/routes/projects.routes.js` | Manajemen Proyek (CRUD + revisions) |

### Frontend
| Kode | File | Modul |
| --- | --- | --- |
| MFE-01 | `client/src/pages/Login.jsx`, `Register.jsx` | Autentikasi |
| MFE-02 | `client/src/pages/NewMindMap.jsx` | Input Teks |
| MFE-03 | `client/src/components/Mindmap/MindMapRadial.jsx` | Visualisasi (Reingold-Tilford radial) |
| MFE-04 | `client/src/components/Mindmap/MindMapForce.jsx` | Layout alternatif (Force-Directed + radial constraint) |
| MFE-05/06 | `client/src/pages/MindMapDetail.jsx` + `state/useMindMap.js` | Editor + Undo/Redo |
| MFE-07 | `client/src/pages/Dashboard.jsx` | Manajemen Proyek |
| MFE-08 | `client/src/components/Mindmap/exportUtils.js` | Ekspor PNG / PDF |
| MFE-09 | `client/src/services/api.js` | Layanan API |
| MFE-10 | `client/src/state/useMindMap.js` | State management (useReducer + history) |

## Endpoint utama

- `POST /api/auth/register` `{ username, email, password }` → 201
- `POST /api/auth/login` `{ email, password }` → `{ user, token }`
- `POST /api/mindmap/generate` `{ text, demos? }` _(auth)_ → `{ mindmap, meta }`
- `GET  /api/projects` _(auth)_ → daftar proyek
- `POST /api/projects` _(auth)_ → buat proyek
- `GET  /api/projects/:id` _(auth)_ → detail
- `PUT  /api/projects/:id` _(auth)_ → update mindmap / layout / title
- `DELETE /api/projects/:id` _(auth)_ → hapus
- `GET/POST /api/projects/:id/revisions` _(auth)_ → snapshot revisi (undo/redo persisten)

## Format JSON mind map

```json
{
  "concept": "Mind Map",
  "level": 0,
  "children": [
    { "concept": "Buzan",       "level": 1, "children": [ ... ] },
    { "concept": "Auto-CoT",    "level": 1, "children": [ ... ] }
  ]
}
```

## Validation Layer (FR-4)

1. **Struktural** — JSON schema (concept string non-kosong, level integer konsisten dengan kedalaman, children array).
2. **Semantik** — minimal 55% node-nya mengandung token yang muncul di teks sumber (cegah halusinasi LLM).
3. **Kendala** — maksimal 4 level (root + 3 sub) dan ≤ 7 cabang per node (sesuai standar Buzan).
4. **Kelengkapan** — minimal 40% istilah dominan (top-8 TF) teks sumber tertangkap dalam pohon.

Gagal di tahap manapun → retry otomatis (maks. 3x) dengan prompt yang diperkaya pesan error sebelumnya.

## Setup

### Environment variables (server/.env)

```
DB_USER=postgres
DB_PASSWORD=postgres
DB_HOST=localhost
DB_PORT=5432
DB_NAME=mindmap
JWT_SECRET=ganti-saya
SESSION_SECRET=ganti-saya
LLM_PROVIDER=mock           # anthropic | openai | mock
ANTHROPIC_API_KEY=          # jika provider=anthropic
OPENAI_API_KEY=             # jika provider=openai
LLM_MODEL=claude-sonnet-4-6 # opsional, override default
```

Catatan: provider default `mock` memakai pipeline deterministik lokal (TF-IDF + k-medoids) sehingga sistem tetap berjalan tanpa koneksi internet — berguna untuk demo dan unit testing (FR-3 stabilitas output).

### Jalankan

```bash
# database
psql -U postgres -c "CREATE DATABASE mindmap"
psql -U postgres -d mindmap -f database/init.sql

# backend
cd server && npm install && npm run dev    # → http://localhost:5000

# frontend
cd client && npm install && npm run dev    # → http://localhost:5173
```

Atau dengan Docker:

```bash
./scripts/start.sh
```

## Testing

Pipeline mind map memiliki 16 unit test di `server/__tests__/unit/mindmap.pipeline.test.js` yang mengcover preprocess, embedding, prompt builder, mock generator, dan semua 4 tahap validasi. Frontend smoke test di `client/__tests__/unit/App.test.jsx`.

```bash
cd server && npm test           # 16 unit tests
cd client && npm run test:unit  # smoke tests
cd client && npm run test:e2e   # Cypress E2E
```

## Design language

Mengikuti portofolio personal Melati:

- Background putih bersih dengan grid titik halus
- Tipografi `Plus Jakarta Sans` (bold 700–800) untuk heading dan `Caveat` untuk aksen hand-drawn
- Aksen pink highlighter (`#FFB7DE` / `#FF7AC4`) untuk tag dan sticker
- Sticky-note cards dengan palet pastel: kuning, biru, pink, mint, lilac
- Tombol pill rounded dengan border 1.5px hitam dan drop-shadow 4px solid hitam
- Bintang sparkle 4-titik sebagai icon brand
