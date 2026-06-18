# Changelog Template

> Quick Reference:
> - Track notable changes on each release
> - Organized by version number and release date
> - Categorize changes by type (e.g., Added, Changed, Fixed)
> - Maintain a clear history for project stakeholders

> Instructions:
> 1. Keep this template at the top of the CHANGELOG.md file
> 2. Add new versions below this template
> 3. Use semantic versioning (MAJOR.MINOR.PATCH)
> 4. Include release date in YYYY-MM-DD format
> 5. Categorize all changes under appropriate sections
> 6. Most recent version should appear first

## [Version] - YYYY-MM-DD
### Added
- [New feature or functionality]

### Changed
- [Modified existing feature to improve performance or usability]

### Deprecated
- [Features soon to be removed]

### Removed
- [Features or components removed from the codebase]

### Fixed
- [Bugs that have been fixed]

### Security
- [Security patches or updates]
## Revisi: Faithful-to-text & koreksi algoritma (2026-06)

Masalah yang diperbaiki: system prompt + reasoning lama secara tidak langsung
memaksa struktur JSON menjadi seimbang (target 3-4 level, 4-7 cabang, "sedalam
mungkin"/"komprehensif"). Akibatnya muncul parent-child yang tidak sesuai
konteks, duplikasi konsep, dan teks padat angka (mis. inflasi BPS) gagal
membentuk JSON setelah 3x retry.

Perubahan:
- autoCoT.js (MSM-03): prompt ditulis ulang -> "bentuk mengikuti isi". Hapus
  target kedalaman/jumlah cabang & instruksi balanced/komprehensif. Tambah
  aturan anti-duplikasi & penanganan teks angka. Few-shot diganti 3 contoh
  KONTRAS (breadth-heavy, depth-heavy, balanced). Ref: Wei dkk. 2022 (CoT),
  Zhang dkk. 2023 (Auto-CoT, question clustering).
- validation.js (MSM-05): MAX_DEPTH 4->12 & MAX_BRANCH 7->24 kini hanya PENGAMAN
  (bukan paksaan keseimbangan). Cek semantik/kelengkapan dibuat TOLERAN ANGKA
  (concept numerik "2,61%" dicocokkan ke teks). Tambah validateShape() & klasifikasi
  bentuk (depth/breadth/balanced) yang deskriptif.
- mindmap.routes.js: degradasi anggun berbasis BENTUK SEHAT -> teks angka tak lagi 422.
- llmClient.js: mock tidak lagi memaksa lebar (slice 4 dibuang); default model
  Anthropic diperbaiki; tambah provider "sim" (simulator variabilitas offline).
- sted.js: KOREKSI agar setia paper Wang dkk. 2025 -> Hungarian per-level,
  lambda=0.1, delta = ||C1|-|C2||, C(O) = rata-rata pairwise (hapus sigmoid
  yang sebelumnya salah diatribusikan ke paper).
- Reingold-Tilford: client (MindMapRadial) separation diberi clamp & dokumentasi;
  headless-layouts (eval) kini memakai d3.tree() ASLI dgn separation IDENTIK klien
  (sebelumnya aproksimasi buatan tangan yang tidak mencerminkan tampilan nyata).
- Pengujian: eval-stability.js menulis stability-report.json + samples/<id>.json,
  menambah teks BPS (angka) & teks proses (depth-heavy) sebagai bukti bentuk
  muncul alami. Target NF-2 (SCS>=0.70, ESR>=90%) terpenuhi. Unit test diperbarui.
