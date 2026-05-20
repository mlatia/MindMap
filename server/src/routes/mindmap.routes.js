/**
 * mindmap.routes.js - Endpoint Pemrosesan Mind Map (MBE-01 + MSM-*)
 *
 *   POST /api/mindmap/generate
 *     body : { text: string, demos?: number, lenient?: boolean }
 *     auth : Bearer JWT
 *     resp : { mindmap, meta: { attempts, durationMs, stats, validation, warnings? } }
 *
 * Mengintegrasikan pipeline Auto-CoT:
 *   preprocess -> embedding/clustering -> buildPrompt -> LLM -> validation
 *
 * Strategi retry yang TERPRESERVASI:
 *   - Maks 3 retry dengan pesan error sebelumnya ditambahkan ke prompt
 *   - Jika semua retry gagal validasi semantik/kelengkapan TAPI struktur valid,
 *     kembalikan hasil terakhir dengan warning (degradasi anggun).
 *   - Hanya kegagalan struktural / kendala yang benar-benar memicu 422.
 */

import express from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { buildPrompt } from '../mindmap/autoCoT.js';
import { generateMindMap } from '../mindmap/llmClient.js';
import { validate, stats } from '../mindmap/validation.js';
import { summarize } from '../mindmap/preprocess.js';

const router = express.Router();
router.use(requireAuth);

const MAX_ATTEMPTS = 3;

router.post('/generate', async (req, res) => {
  const { text, demos } = req.body || {};
  if (!text || typeof text !== 'string' || text.trim().length < 20) {
    return res.status(400).json({ message: 'Teks input minimal 20 karakter' });
  }
  const startedAt = Date.now();
  let lastError = null;
  let lastTree = null;
  let lastErrorType = null;
  let lastValStats = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const prompt = buildPrompt(text, {
        demos: demos || 3,
        previousError: lastError
      });
      const tree = await generateMindMap(prompt, text);
      lastTree = tree;
      const validation = validate(tree, text);
      lastValStats = validation.stats;
      return res.json({
        mindmap: tree,
        meta: {
          attempts: attempt,
          durationMs: Date.now() - startedAt,
          stats: validation.stats,
          preprocess: summarize(text),
          provider: process.env.LLM_PROVIDER || 'mock',
          validation: 'passed'
        }
      });
    } catch (err) {
      lastError = err.message;
      lastErrorType = err.message.split(':')[0]; // "Struktural", "Kendala", "Semantik", "Kelengkapan"
      console.warn(`[mindmap] attempt ${attempt} failed:`, err.message);
    }
  }

  // ---- Degradasi anggun: jika sebelumnya berhasil struktural tapi gagal semantik/kelengkapan,
  // kembalikan tree terakhir dengan warning daripada 422 total.
  if (lastTree && (lastErrorType === 'Semantik' || lastErrorType === 'Kelengkapan')) {
    try {
      const fallbackStats = stats(lastTree);
      return res.json({
        mindmap: lastTree,
        meta: {
          attempts: MAX_ATTEMPTS,
          durationMs: Date.now() - startedAt,
          stats: fallbackStats,
          preprocess: summarize(text),
          provider: process.env.LLM_PROVIDER || 'mock',
          validation: 'warning',
          warnings: [lastError]
        }
      });
    } catch (_) { /* fall through */ }
  }

  return res.status(422).json({
    message: 'Gagal menghasilkan mind map setelah retry maksimal',
    lastError,
    attempts: MAX_ATTEMPTS,
    hint: 'Coba teks yang lebih jelas/terstruktur, atau pastikan LLM_PROVIDER dan OPENAI_API_KEY sudah benar.'
  });
});

export default router;
