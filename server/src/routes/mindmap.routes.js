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
 * Strategi retry (TERPRESERVASI, lebih tahan banting):
 *   - Maks 3 retry dengan pesan error sebelumnya ditambahkan ke prompt.
 *   - DEGRADASI ANGGUN: selama pohon TERAKHIR berbentuk sehat (struktural +
 *     kendala pengaman lolos), kembalikan dengan warning daripada 422 total.
 *     Ini mencegah teks padat angka / relasi tak eksplisit gagal 3x hanya
 *     karena cek lunak (semantik/kelengkapan).
 *   - Hanya kegagalan total (tidak ada pohon valid sama sekali) yang memicu 422.
 */

import express from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { buildPrompt } from '../mindmap/autoCoT.js';
import { generateMindMap } from '../mindmap/llmClient.js';
import { validate, validateShape, stats } from '../mindmap/validation.js';
import { summarize } from '../mindmap/preprocess.js';

const router = express.Router();
router.use(requireAuth);

const MAX_ATTEMPTS = 3;

/** True jika pohon berbentuk sehat (struktural + kendala pengaman). */
function shapeOk(tree) {
  try { return validateShape(tree); } catch { return false; }
}

router.post('/generate', async (req, res) => {
  const { text, demos } = req.body || {};
  if (!text || typeof text !== 'string' || text.trim().length < 20) {
    return res.status(400).json({ message: 'Teks input minimal 20 karakter' });
  }
  const startedAt = Date.now();
  let lastError = null;
  let lastTree = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const prompt = buildPrompt(text, {
        demos: demos || 3,
        previousError: lastError
      });
      const tree = await generateMindMap(prompt, text);
      lastTree = tree;
      const validation = validate(tree, text);
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
      console.warn(`[mindmap] attempt ${attempt} failed:`, err.message);
    }
  }

  if (lastTree && shapeOk(lastTree)) {
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
    } catch (_) { }
  }

  return res.status(422).json({
    message: 'Gagal menghasilkan mind map setelah retry maksimal',
    lastError,
    attempts: MAX_ATTEMPTS,
    hint: 'Coba teks yang lebih jelas/terstruktur, atau pastikan LLM_PROVIDER dan kunci API sudah benar.'
  });
});

export default router;
